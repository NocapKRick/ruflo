import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_EVENTS, STORAGE_KEY, createStore, initialState, reduce } from '../src/domain/store.mjs';

const NOW = new Date('2026-10-15T12:00:00Z');
const HOME = { street: '12 Maple St', city: 'Austin', state: 'tx', zip: '78701', yearBuilt: '1998', squareFeet: '1850' };
const PHOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==';

function memoryStorage() {
  const data = new Map();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: (k) => data.delete(k) };
}

function makeStore(storage = memoryStorage()) {
  let n = 0;
  return createStore({ storage, clock: () => NOW, newId: () => `id${++n}` });
}

test('saveHome validates and normalises input', () => {
  const store = makeStore();
  const bad = store.saveHome({ street: '', city: 'Austin', state: 'Texas', zip: '787' });
  assert.equal(bad.ok, false);
  assert.deepEqual(Object.keys(bad.errors).sort(), ['state', 'street', 'zip']);
  assert.equal(store.saveHome({ ...HOME, state: 'TE' }).ok, false, 'not a real state code');
  assert.equal(store.getState().home, null);

  assert.equal(store.saveHome(HOME).ok, true);
  assert.equal(store.getState().home.state, 'TX');
  assert.equal(store.getState().home.yearBuilt, 1998);
});

test('saveSystem adds then updates without losing photos or costs', () => {
  const store = makeStore();
  const { id } = store.saveSystem({ kind: 'furnace', variant: 'gas-furnace', installYear: '2010', filter: { size: '16 x 25 x 1' } });
  assert.equal(store.getSystem(id).filter.size, '16x25x1');
  store.addPhoto(id, { dataUrl: PHOTO, caption: 'Data plate' });
  store.addCost(id, { type: 'repair', date: '2026-01-05', amount: '249.999', description: 'Igniter' });

  assert.equal(store.saveSystem({ id, kind: 'furnace', variant: 'gas-furnace', installYear: '2011', brand: 'Trane' }).ok, true);
  const s = store.getSystem(id);
  assert.equal(s.installYear, 2011);
  assert.equal(s.brand, 'Trane');
  assert.equal(s.photos.length, 1);
  assert.equal(s.costs[0].amount, 250);
});

test('saveSystem rejects unknown ids, future install years and bad filter sizes', () => {
  const store = makeStore();
  assert.equal(store.saveSystem({ id: 'nope', kind: 'ac' }).ok, false);
  const res = store.saveSystem({ kind: 'ac', installYear: '2099', filter: { size: '16x25' } });
  assert.equal(res.ok, false);
  assert.ok(res.errors.installYear);
  assert.ok(res.errors['filter.size']);
});

test('completing a filter or tune-up task updates the system record', () => {
  const store = makeStore();
  const { id } = store.saveSystem({ kind: 'furnace', filter: { size: '16x25x1', lastChanged: '2026-01-01' }, lastServiceDate: '2025-01-01' });
  store.completeTask(id, 'filter', '2026-10-01');
  store.completeTask(id, 'furnace-tuneup', '2026-10-02');
  const s = store.getSystem(id);
  assert.equal(s.filter.lastChanged, '2026-10-01');
  assert.equal(s.lastServiceDate, '2026-10-02');
  assert.equal(store.getState().completions.length, 2);
  assert.equal(store.completeTask(id, 'filter', '2030-01-01').ok, false, 'future dates are rejected');
});

test('photos are validated and capped per system', () => {
  const store = makeStore();
  const { id } = store.saveSystem({ kind: 'roof' });
  assert.equal(store.addPhoto(id, { dataUrl: 'data:text/html;base64,PHNjcmlwdD4=' }).ok, false);
  assert.equal(store.addPhoto(id, { dataUrl: 'javascript:alert(1)' }).ok, false);
  for (let i = 0; i < 8; i++) assert.equal(store.addPhoto(id, { dataUrl: PHOTO }).ok, true);
  assert.equal(store.addPhoto(id, { dataUrl: PHOTO }).ok, false);
});

test('removing a system also removes its completion history', () => {
  const store = makeStore();
  const { id } = store.saveSystem({ kind: 'roof' });
  store.completeTask(id, 'gutters', '2026-10-01');
  store.removeSystem(id);
  assert.deepEqual(store.getState().systems, []);
  assert.deepEqual(store.getState().completions, []);
});

test('state persists to storage and reloads', () => {
  const storage = memoryStorage();
  const a = makeStore(storage);
  a.saveHome(HOME);
  a.saveSystem({ kind: 'roof', variant: 'metal', installYear: '2015' });
  assert.ok(storage.data.has(STORAGE_KEY));
  const b = makeStore(storage);
  assert.equal(b.getState().home.street, '12 Maple St');
  assert.equal(b.getState().systems[0].variant, 'metal');
});

test('quota errors are reported instead of thrown', () => {
  const storage = memoryStorage();
  storage.setItem = () => { throw Object.assign(new Error('full'), { name: 'QuotaExceededError' }); };
  const store = makeStore(storage);
  assert.equal(store.saveHome(HOME).ok, true);
  assert.match(store.getSaveError(), /Storage is full/);
});

test('event log records summaries (not payloads) and is capped', () => {
  const store = makeStore();
  const { id } = store.saveSystem({ kind: 'roof' });
  store.addPhoto(id, { dataUrl: PHOTO });
  assert.ok(!JSON.stringify(store.getState().events).includes('base64'));
  for (let i = 0; i < MAX_EVENTS + 5; i++) store.completeTask(id, 'gutters', '2026-10-01');
  assert.equal(store.getState().events.length, MAX_EVENTS);
});

test('export → import round-trips; foreign files are rejected', () => {
  const a = makeStore();
  a.saveHome(HOME);
  a.saveSystem({ kind: 'ac', installYear: '2014' });
  const b = makeStore();
  assert.equal(b.importData(a.exportJSON()).ok, true);
  assert.equal(b.getState().systems[0].installYear, 2014);
  assert.equal(b.importData('{"hello":1}').ok, false);
  assert.equal(b.importData('not json').ok, false);
});

test('reducer ignores unknown events and reset keeps history', () => {
  const s = initialState();
  assert.equal(reduce(s, { type: 'NOPE', payload: {} }), s);
  const store = makeStore();
  store.saveHome(HOME);
  store.reset();
  assert.equal(store.getState().home, null);
  assert.equal(store.getState().events.length, 2);
});
