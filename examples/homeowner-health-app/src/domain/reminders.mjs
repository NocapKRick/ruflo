/**
 * Maintenance schedule: expands each system's task templates (plus HVAC air
 * filters) into dated reminders, and exports them as an .ics calendar.
 */

import { FILTER_INTERVAL_BY_DEPTH, getKind } from './catalog.mjs';
import { systemName } from './assessment.mjs';
import { addMonths, daysBetween, latestDate, toISODate, today } from './dates.mjs';

export const DUE_SOON_DAYS = 30;

/** Tasks whose completion also counts as the system's professional service. */
export const SERVICE_TASKS = new Set(['ac-tuneup', 'furnace-tuneup']);
export const FILTER_TASK = 'filter';

export function taskKey(systemId, taskId) {
  return `${systemId}:${taskId}`;
}

/** Parses a nominal filter size such as "16x25x1" or "20 x 20 x 4". */
export function parseFilterSize(size) {
  const m = /^\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*$/i.exec(size ?? '');
  if (!m) return null;
  return { width: +m[1], height: +m[2], depth: +m[3], label: `${m[1]}x${m[2]}x${m[3]}` };
}

export function filterIntervalMonths(filter) {
  if (Number.isInteger(filter?.intervalMonths) && filter.intervalMonths > 0) return filter.intervalMonths;
  const depth = parseFilterSize(filter?.size)?.depth;
  return FILTER_INTERVAL_BY_DEPTH[Math.round(depth)] ?? 3;
}

/** Templates that apply to one system, including its filter if it has one. */
export function taskTemplatesFor(system) {
  const kind = getKind(system.kind);
  if (!kind) return [];
  const templates = kind.tasks.filter((t) => !t.appliesTo || t.appliesTo.includes(system.variant));
  if (system.filter?.size) {
    templates.unshift({
      id: FILTER_TASK,
      title: `Replace air filter (${parseFilterSize(system.filter.size)?.label ?? system.filter.size})`,
      intervalMonths: filterIntervalMonths(system.filter),
      note: system.filter.quantity > 1 ? `${system.filter.quantity} filters needed.` : undefined,
    });
  }
  return templates;
}

/** Last completion date per task key from the completion log. */
export function lastCompletions(completions) {
  const map = new Map();
  for (const c of completions) {
    const key = taskKey(c.systemId, c.taskId);
    if (!map.has(key) || c.date > map.get(key)) map.set(key, c.date);
  }
  return map;
}

/**
 * @typedef {Object} Reminder
 * @property {string} key
 * @property {string} systemId
 * @property {string} taskId
 * @property {string} title
 * @property {string} systemLabel
 * @property {string} icon
 * @property {number} intervalMonths
 * @property {string|null} lastDone
 * @property {string} dueDate
 * @property {number} daysUntil
 * @property {'overdue'|'due-soon'|'upcoming'|'unrecorded'} status
 * @property {string} [note]
 */

/** @returns {Reminder[]} sorted by urgency, then due date */
export function buildSchedule(systems, completions = [], now = new Date()) {
  const done = lastCompletions(completions);
  const start = today(now);
  const reminders = [];
  for (const system of systems) {
    const kind = getKind(system.kind);
    for (const t of taskTemplatesFor(system)) {
      const key = taskKey(system.id, t.id);
      const fallback = t.id === FILTER_TASK ? system.filter?.lastChanged
        : SERVICE_TASKS.has(t.id) ? system.lastServiceDate : null;
      const last = latestDate(done.get(key), fallback);
      const due = last ? addMonths(last, t.intervalMonths) : start;
      const daysUntil = daysBetween(start, due);
      const status = !last ? 'unrecorded'
        : daysUntil < 0 ? 'overdue'
          : daysUntil <= DUE_SOON_DAYS ? 'due-soon' : 'upcoming';
      reminders.push({
        key, systemId: system.id, taskId: t.id, title: t.title, note: t.note,
        systemLabel: systemName(system), icon: kind.icon, intervalMonths: t.intervalMonths,
        lastDone: last ? toISODate(last) : null, dueDate: toISODate(due), daysUntil, status,
      });
    }
  }
  const rank = { overdue: 0, 'due-soon': 1, unrecorded: 2, upcoming: 3 };
  return reminders.sort((a, b) => rank[a.status] - rank[b.status] || a.dueDate.localeCompare(b.dueDate));
}

export function countOverdue(reminders) {
  return reminders.filter((r) => r.status === 'overdue').length;
}

function icsEscape(text) {
  return String(text).replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\r?\n/g, '\\n');
}

/** RFC 5545 calendar with one all-day event per reminder (overdue ones land today). */
export function remindersToICS(reminders, now = new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const start = toISODate(today(now));
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Homeowner Health//Maintenance//EN', 'CALSCALE:GREGORIAN'];
  for (const r of reminders) {
    const day = (r.dueDate < start ? start : r.dueDate).replace(/-/g, '');
    lines.push(
      'BEGIN:VEVENT',
      `UID:${icsEscape(r.key)}-${day}@homeowner-health`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${day}`,
      `SUMMARY:${icsEscape(`${r.icon} ${r.title}`)}`,
      `DESCRIPTION:${icsEscape(`${r.systemLabel} — repeats every ${r.intervalMonths} months.${r.note ? ` ${r.note}` : ''}`)}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
