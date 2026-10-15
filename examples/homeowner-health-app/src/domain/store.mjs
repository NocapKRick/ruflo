/**
 * Event-sourced home record. Commands are validated, turned into immutable
 * events, and folded into state by a pure reducer. State is persisted as a
 * snapshot plus a capped event log that doubles as the activity history.
 */

import { validateCost, validateHome, validatePhoto, validateSystem } from './validation.mjs';
import { FILTER_TASK, SERVICE_TASKS } from './reminders.mjs';
import { parseDate, toISODate, today } from './dates.mjs';

export const STORAGE_KEY = 'homeowner-health:v1';
export const SCHEMA_VERSION = 1;
export const MAX_EVENTS = 200;
export const MAX_PHOTOS_PER_SYSTEM = 8;

export function initialState() {
  return { version: SCHEMA_VERSION, home: null, systems: [], completions: [], quotes: [], events: [] };
}

function mapSystem(state, systemId, fn) {
  return { ...state, systems: state.systems.map((s) => (s.id === systemId ? fn(s) : s)) };
}

/** Pure reducer: (state, event) → state. Unknown events are ignored. */
export function reduce(state, event) {
  const p = event.payload;
  switch (event.type) {
    case 'HOME_SAVED':
      return { ...state, home: p.home };
    case 'SYSTEM_SAVED': {
      const exists = state.systems.some((s) => s.id === p.system.id);
      if (!exists) return { ...state, systems: [...state.systems, { photos: [], costs: [], ...p.system }] };
      return mapSystem(state, p.system.id, (s) => ({ ...s, ...p.system, photos: s.photos, costs: s.costs }));
    }
    case 'SYSTEM_REMOVED':
      return {
        ...state,
        systems: state.systems.filter((s) => s.id !== p.systemId),
        completions: state.completions.filter((c) => c.systemId !== p.systemId),
      };
    case 'TASK_COMPLETED': {
      const next = { ...state, completions: [...state.completions, { systemId: p.systemId, taskId: p.taskId, date: p.date }] };
      if (p.taskId === FILTER_TASK) {
        return mapSystem(next, p.systemId, (s) => ({ ...s, filter: s.filter && { ...s.filter, lastChanged: maxDate(s.filter.lastChanged, p.date) } }));
      }
      if (SERVICE_TASKS.has(p.taskId)) {
        return mapSystem(next, p.systemId, (s) => ({ ...s, lastServiceDate: maxDate(s.lastServiceDate, p.date) }));
      }
      return next;
    }
    case 'COST_ADDED':
      return mapSystem(state, p.systemId, (s) => ({ ...s, costs: [...(s.costs ?? []), p.cost] }));
    case 'COST_REMOVED':
      return mapSystem(state, p.systemId, (s) => ({ ...s, costs: (s.costs ?? []).filter((c) => c.id !== p.costId) }));
    case 'PHOTO_ADDED':
      return mapSystem(state, p.systemId, (s) => ({ ...s, photos: [...(s.photos ?? []), p.photo] }));
    case 'PHOTO_REMOVED':
      return mapSystem(state, p.systemId, (s) => ({ ...s, photos: (s.photos ?? []).filter((ph) => ph.id !== p.photoId) }));
    case 'QUOTE_REQUESTED':
      return { ...state, quotes: [p.quote, ...state.quotes] };
    case 'DATA_IMPORTED':
      return { ...p.state, events: state.events };
    case 'DATA_RESET':
      return { ...initialState(), events: state.events };
    default:
      return state;
  }
}

function maxDate(a, b) {
  return !a || (b && b > a) ? b : a;
}

/** Event log entries keep a short summary, not the full payload (photos are large). */
function logEntry(event) {
  return { id: event.id, type: event.type, at: event.at, summary: event.summary };
}

const ok = () => ({ ok: true, errors: {} });
const fail = (errors) => ({ ok: false, errors });

/**
 * @param {Object} opts
 * @param {{ getItem(k: string): string|null, setItem(k: string, v: string): void, removeItem?(k: string): void }} [opts.storage]
 * @param {() => Date} [opts.clock]
 * @param {() => string} [opts.newId]
 */
export function createStore({ storage = null, clock = () => new Date(), newId = defaultId } = {}) {
  let state = load(storage);
  const listeners = new Set();
  let lastSaveError = null;

  function emit(type, payload, summary) {
    const event = { id: newId(), type, at: clock().toISOString(), payload, summary };
    state = reduce(state, event);
    state = { ...state, events: [logEntry(event), ...state.events].slice(0, MAX_EVENTS) };
    lastSaveError = save(storage, state);
    listeners.forEach((fn) => fn(state));
    return event;
  }

  function findSystem(systemId) {
    return state.systems.find((s) => s.id === systemId) ?? null;
  }

  const commands = {
    saveHome(input) {
      const v = validateHome(input, clock());
      if (!v.ok) return fail(v.errors);
      emit('HOME_SAVED', { home: v.value }, `Saved home details for ${v.value.street}`);
      return ok();
    },
    saveSystem(input) {
      const v = validateSystem(input, clock());
      if (!v.ok) return fail(v.errors);
      if (v.value.id && !findSystem(v.value.id)) return fail({ id: 'Unknown system.' });
      const system = { ...v.value, id: v.value.id ?? newId() };
      emit('SYSTEM_SAVED', { system }, `${input.id ? 'Updated' : 'Added'} ${system.name || system.kind}`);
      return { ...ok(), id: system.id };
    },
    removeSystem(systemId) {
      const s = findSystem(systemId);
      if (!s) return fail({ id: 'Unknown system.' });
      emit('SYSTEM_REMOVED', { systemId }, `Removed ${s.name || s.kind}`);
      return ok();
    },
    completeTask(systemId, taskId, date = toISODate(today(clock()))) {
      const d = parseDate(date);
      if (!findSystem(systemId)) return fail({ id: 'Unknown system.' });
      if (!d || d > clock()) return fail({ date: 'Enter a valid date that is not in the future.' });
      emit('TASK_COMPLETED', { systemId, taskId, date }, `Completed ${taskId} on ${date}`);
      return ok();
    },
    addCost(systemId, input) {
      if (!findSystem(systemId)) return fail({ id: 'Unknown system.' });
      const v = validateCost(input, clock());
      if (!v.ok) return fail(v.errors);
      emit('COST_ADDED', { systemId, cost: { ...v.value, id: newId() } }, `Logged ${v.value.type} $${v.value.amount}`);
      return ok();
    },
    removeCost(systemId, costId) {
      emit('COST_REMOVED', { systemId, costId }, 'Removed a cost entry');
      return ok();
    },
    addPhoto(systemId, input) {
      const s = findSystem(systemId);
      if (!s) return fail({ id: 'Unknown system.' });
      if ((s.photos ?? []).length >= MAX_PHOTOS_PER_SYSTEM) return fail({ dataUrl: `Up to ${MAX_PHOTOS_PER_SYSTEM} photos per system.` });
      const v = validatePhoto(input);
      if (!v.ok) return fail(v.errors);
      emit('PHOTO_ADDED', { systemId, photo: { ...v.value, id: newId(), addedAt: clock().toISOString() } }, `Added a photo${v.value.caption ? `: ${v.value.caption}` : ''}`);
      return ok();
    },
    removePhoto(systemId, photoId) {
      emit('PHOTO_REMOVED', { systemId, photoId }, 'Removed a photo');
      return ok();
    },
    recordQuote(quote) {
      emit('QUOTE_REQUESTED', { quote }, `Quote request for ${quote.systemLabel}`);
      return ok();
    },
    importData(json) {
      const parsed = parseImport(json);
      if (!parsed) return fail({ file: 'That file is not a Homeowner Health export.' });
      emit('DATA_IMPORTED', { state: parsed }, 'Imported data from a backup file');
      return ok();
    },
    reset() {
      emit('DATA_RESET', {}, 'Cleared all data');
      return ok();
    },
  };

  return {
    ...commands,
    getState: () => state,
    getSystem: findSystem,
    getSaveError: () => lastSaveError,
    exportJSON: () => JSON.stringify({ ...state, exportedAt: clock().toISOString() }, null, 2),
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

function parseImport(json) {
  try {
    const data = JSON.parse(json);
    if (data?.version !== SCHEMA_VERSION || !Array.isArray(data.systems)) return null;
    return {
      ...initialState(),
      home: data.home ?? null,
      systems: data.systems.map((s) => ({ photos: [], costs: [], ...s })),
      completions: Array.isArray(data.completions) ? data.completions : [],
      quotes: Array.isArray(data.quotes) ? data.quotes : [],
    };
  } catch {
    return null;
  }
}

function load(storage) {
  if (!storage) return initialState();
  try {
    const raw = storage.getItem(STORAGE_KEY);
    const data = raw ? JSON.parse(raw) : null;
    return data?.version === SCHEMA_VERSION ? { ...initialState(), ...data } : initialState();
  } catch {
    return initialState();
  }
}

/** @returns {string|null} error message when the browser refuses to save (e.g. quota). */
function save(storage, state) {
  if (!storage) return null;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return null;
  } catch (err) {
    return err?.name === 'QuotaExceededError'
      ? 'Storage is full — remove some photos or export a backup.'
      : 'Could not save changes in this browser.';
  }
}

function defaultId() {
  return globalThis.crypto?.randomUUID?.() ?? `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
