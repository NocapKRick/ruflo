import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildQuoteRequest, localQuoteProvider, quoteRequestToText } from '../src/domain/quotes.mjs';
import { resolvePath, startServer } from '../server.mjs';

const NOW = new Date('2026-10-15T12:00:00Z');
const HOME = { street: '12 Maple St', city: 'Austin', state: 'TX', zip: '78701' };
const SYSTEM = {
  id: 'a1', kind: 'ac', variant: 'central-ac', brand: 'Carrier', model: '24ACC636', installYear: 2012,
  lastServiceDate: '2026-04-02', filter: { size: '16x25x1' }, warranty: { provider: 'Carrier', expires: '2022-01-01' },
};
const CONTACT = { name: 'Sam Rivera', email: 'sam@example.com', phone: '(512) 555-0100', consent: true, details: 'Short cycling' };

test('quote request carries equipment context for the contractor', () => {
  const res = buildQuoteRequest({ home: HOME, system: SYSTEM, contact: CONTACT, requestType: 'replacement', now: NOW, id: 'q1' });
  assert.equal(res.ok, true);
  const r = res.request;
  assert.equal(r.trade, 'hvac');
  assert.equal(r.equipment.ageYears, 14);
  assert.equal(r.equipment.lifeStatus, 'due');
  assert.equal(r.equipment.warranty.status, 'expired');
  assert.equal(r.location.zip, '78701');
  const text = quoteRequestToText(r);
  assert.match(text, /HVAC replacement request/);
  assert.match(text, /Installed: 2012 \(14 years old\)/);
  assert.match(text, /Filter size: 16x25x1/);
});

test('quote request requires an address, consent and a valid email', () => {
  const res = buildQuoteRequest({ home: null, system: SYSTEM, contact: { ...CONTACT, email: 'nope', consent: false }, now: NOW });
  assert.equal(res.ok, false);
  assert.deepEqual(Object.keys(res.errors).sort(), ['consent', 'email', 'home']);
});

test('local provider saves rather than claiming to send', async () => {
  const out = await localQuoteProvider.submit({});
  assert.equal(out.status, 'saved');
});

test('server only resolves files inside public/ and src/', () => {
  assert.match(resolvePath('/'), /public[\\/]index\.html$/);
  assert.match(resolvePath('/src/domain/store.mjs?v=1'), /store\.mjs$/);
  assert.equal(resolvePath('/package.json'), null);
  assert.equal(resolvePath('/public/../server.mjs'), null);
  assert.equal(resolvePath('/src/%2e%2e/server.mjs'), null);
  assert.equal(resolvePath('/%E0%A4%A'), null);
});

test('server serves the app shell and modules with security headers', async () => {
  const server = await startServer(0);
  const { port } = server.address();
  try {
    const html = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(html.status, 200);
    assert.match(html.headers.get('content-security-policy'), /script-src 'self'/);
    assert.match(await html.text(), /<script type="module" src="\/src\/ui\/app\.mjs">/);
    const js = await fetch(`http://127.0.0.1:${port}/src/ui/app.mjs`);
    assert.equal(js.headers.get('content-type'), 'text/javascript; charset=utf-8');
    assert.equal((await fetch(`http://127.0.0.1:${port}/server.mjs`)).status, 404);
  } finally {
    server.close();
  }
});
