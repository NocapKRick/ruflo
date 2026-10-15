/**
 * Calendar-date helpers. Dates are stored as ISO `YYYY-MM-DD` strings and
 * handled in UTC so results never shift with the viewer's time zone.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

/** @returns {Date|null} */
export function parseDate(value) {
  if (typeof value !== 'string') return null;
  const m = ISO_DATE.exec(value);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  // Reject rollovers such as 2026-02-31.
  return d.getUTCMonth() === +m[2] - 1 ? d : null;
}

export function toISODate(date) {
  return date.toISOString().slice(0, 10);
}

/** Today's calendar date in UTC, as a Date at midnight. */
export function today(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Adds whole months, clamping to the last day of the target month. */
export function addMonths(date, months) {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(date.getUTCDate(), lastDay)));
}

export function daysBetween(from, to) {
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

/** Latest of several ISO date strings, ignoring blanks and invalid values. */
export function latestDate(...values) {
  let best = null;
  for (const v of values) {
    const d = parseDate(v);
    if (d && (!best || d > best)) best = d;
  }
  return best;
}

export function formatDate(value) {
  const d = typeof value === 'string' ? parseDate(value) : value;
  if (!d) return '—';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}
