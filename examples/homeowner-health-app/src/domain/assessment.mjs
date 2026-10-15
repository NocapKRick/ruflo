/**
 * Turns a home's recorded systems into statuses, plain-language insights,
 * a 0–100 health score and a replacement-cost forecast. Pure functions:
 * every one takes `now` so results are deterministic and testable.
 */

import { APPROACHING_RATIO, getKind, getVariant } from './catalog.mjs';
import { daysBetween, formatDate, parseDate, today } from './dates.mjs';

export const WARRANTY_EXPIRING_DAYS = 90;
export const SERVICE_INTERVAL_MONTHS = { ac: 12, furnace: 12, 'water-heater': 12 };

/** @typedef {'unknown'|'healthy'|'approaching'|'due'|'past'} LifeStatus */

export function ageYears(installYear, now = new Date()) {
  if (!Number.isInteger(installYear)) return null;
  return Math.max(0, now.getUTCFullYear() - installYear);
}

/**
 * Where a system sits in its typical life.
 * - approaching: age ≥ 75% of the low end of the typical lifespan
 * - due:         age within the typical lifespan range (replacement window)
 * - past:        age beyond the high end
 */
export function lifeStatus(system, now = new Date()) {
  const variant = getVariant(system.kind, system.variant);
  const age = ageYears(system.installYear, now);
  if (!variant || age === null) return { status: 'unknown', age, variant };
  const [min, max] = variant.lifespan;
  /** @type {LifeStatus} */
  let status = 'healthy';
  if (age > max) status = 'past';
  else if (age >= min) status = 'due';
  else if (age >= min * APPROACHING_RATIO) status = 'approaching';
  return {
    status,
    age,
    variant,
    lifespan: [min, max],
    percentUsed: Math.min(100, Math.round((age / max) * 100)),
    yearsLeft: Math.max(0, min - age),
    window: [system.installYear + min, system.installYear + max],
  };
}

/** @returns {{ status: 'none'|'active'|'expiring'|'expired', daysLeft?: number }} */
export function warrantyStatus(warranty, now = new Date()) {
  const expires = parseDate(warranty?.expires);
  if (!expires) return { status: 'none' };
  const daysLeft = daysBetween(today(now), expires);
  if (daysLeft < 0) return { status: 'expired', daysLeft };
  if (daysLeft <= WARRANTY_EXPIRING_DAYS) return { status: 'expiring', daysLeft };
  return { status: 'active', daysLeft };
}

/** Months since the last professional service, or null if never recorded. */
export function monthsSinceService(system, now = new Date()) {
  const last = parseDate(system.lastServiceDate);
  if (!last) return null;
  return Math.floor(daysBetween(last, today(now)) / 30.44);
}

export function systemName(system) {
  const kind = getKind(system.kind);
  if (system.name) return system.name;
  if (kind?.group === 'hvac') return `HVAC system (${kind.label.toLowerCase()})`;
  return kind ? kind.label.toLowerCase() : 'system';
}

function warrantyAdvice(system, w) {
  const provider = system.warranty?.provider ? ` with ${system.warranty.provider}` : '';
  if (w.status === 'active') return `Your warranty${provider} runs until ${formatDate(system.warranty.expires)} — check what it covers and schedule an inspection.`;
  if (w.status === 'expiring') return `Your warranty${provider} expires in ${w.daysLeft} days — schedule an inspection while it still applies.`;
  if (w.status === 'expired') return `Your warranty${provider} has expired. Schedule an inspection and start budgeting for replacement.`;
  return 'Check your warranty and schedule an inspection.';
}

/**
 * @typedef {Object} Insight
 * @property {'critical'|'warning'|'info'} severity
 * @property {string} systemId
 * @property {string} code
 * @property {string} title
 * @property {string} message
 * @property {Array<'check-warranty'|'schedule-inspection'|'get-quote'|'log-service'>} actions
 */

/** @returns {Insight[]} sorted most severe first */
export function insightsFor(system, now = new Date()) {
  const out = [];
  const kind = getKind(system.kind);
  if (!kind) return out;
  const name = systemName(system);
  const Name = name.charAt(0).toUpperCase() + name.slice(1);
  const life = lifeStatus(system, now);
  const w = warrantyStatus(system.warranty, now);
  const base = { systemId: system.id };

  if (life.status !== 'unknown' && life.status !== 'healthy') {
    const [min, max] = life.lifespan;
    const ageText = `${life.age} years old; typical life ${min}–${max} years`;
    if (life.status === 'past') {
      out.push({ ...base, severity: 'critical', code: 'life-past', title: `${Name} is past its typical lifespan`,
        message: `Your ${name} is beyond the typical replacement window (${ageText}). ${warrantyAdvice(system, w)} Getting replacement quotes now avoids an emergency purchase.`,
        actions: ['get-quote', 'schedule-inspection', 'check-warranty'] });
    } else if (life.status === 'due') {
      out.push({ ...base, severity: 'warning', code: 'life-due', title: `${Name} is in its replacement window`,
        message: `Your ${name} is within the typical replacement window (${ageText}). ${warrantyAdvice(system, w)}`,
        actions: ['schedule-inspection', 'check-warranty', 'get-quote'] });
    } else {
      out.push({ ...base, severity: 'info', code: 'life-approaching', title: `${Name} is approaching replacement age`,
        message: `Your ${name} is approaching the typical replacement window (${ageText}). ${warrantyAdvice(system, w)}`,
        actions: ['check-warranty', 'schedule-inspection'] });
    }
  }

  const hazard = kind.hazards?.[system.variant];
  if (hazard) {
    out.push({ ...base, severity: 'critical', code: 'hazard', title: `${Name}: known risk`, message: hazard,
      actions: ['schedule-inspection', 'get-quote'] });
  }

  if (w.status === 'expiring' && life.status === 'healthy') {
    out.push({ ...base, severity: 'info', code: 'warranty-expiring', title: `${Name} warranty expires soon`,
      message: `Your warranty expires in ${w.daysLeft} days. Book any covered repairs or a final inspection before ${formatDate(system.warranty.expires)}.`,
      actions: ['check-warranty', 'schedule-inspection'] });
  }

  const interval = SERVICE_INTERVAL_MONTHS[system.kind];
  if (interval) {
    const since = monthsSinceService(system, now);
    if (since === null) {
      out.push({ ...base, severity: 'info', code: 'service-unknown', title: `No service recorded for ${name}`,
        message: `Log the last professional service so reminders stay accurate. Annual service is recommended.`,
        actions: ['log-service', 'schedule-inspection'] });
    } else if (since >= interval) {
      out.push({ ...base, severity: 'warning', code: 'service-overdue', title: `${Name} service is overdue`,
        message: `It has been about ${since} months since the last service (recommended every ${interval}). Regular service extends equipment life and keeps warranties valid.`,
        actions: ['schedule-inspection', 'log-service'] });
    }
  }

  return out.sort(bySeverity);
}

const SEVERITY_RANK = { critical: 0, warning: 1, info: 2 };
function bySeverity(a, b) {
  return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
}

export function homeInsights(systems, now = new Date()) {
  return systems.flatMap((s) => insightsFor(s, now)).sort(bySeverity);
}

const LIFE_PENALTY = { unknown: 2, healthy: 0, approaching: 5, due: 12, past: 20 };

/**
 * 0–100 score. Starts at 100 and subtracts for age, hazards, overdue service
 * and overdue reminders. With nothing recorded the score is null (no data).
 */
export function healthScore(systems, overdueTaskCount = 0, now = new Date()) {
  if (!systems.length) return { score: null, grade: 'No data', tone: 'unknown' };
  let penalty = 0;
  for (const s of systems) {
    penalty += LIFE_PENALTY[lifeStatus(s, now).status];
    if (getKind(s.kind)?.hazards?.[s.variant]) penalty += 15;
    const interval = SERVICE_INTERVAL_MONTHS[s.kind];
    const since = monthsSinceService(s, now);
    if (interval && since !== null && since >= interval) penalty += 4;
  }
  penalty += Math.min(20, overdueTaskCount * 2);
  const score = Math.max(0, Math.min(100, 100 - penalty));
  if (score >= 85) return { score, grade: 'Excellent', tone: 'good' };
  if (score >= 70) return { score, grade: 'Good', tone: 'good' };
  if (score >= 50) return { score, grade: 'Needs attention', tone: 'warn' };
  return { score, grade: 'At risk', tone: 'bad' };
}

/**
 * Replacement forecast plus money already spent.
 * `horizonYears` bounds which replacements count toward the near-term budget.
 */
export function costForecast(systems, now = new Date(), horizonYears = 5) {
  const year = now.getUTCFullYear();
  const rows = [];
  let nearLow = 0;
  let nearHigh = 0;
  let spent = 0;
  for (const s of systems) {
    const life = lifeStatus(s, now);
    const variant = life.variant;
    const [low, high] = Number.isFinite(s.replacementEstimate) && s.replacementEstimate > 0
      ? [s.replacementEstimate, s.replacementEstimate]
      : variant?.cost ?? [0, 0];
    const expectedYear = life.window ? Math.max(year, life.window[0]) : null;
    const inHorizon = expectedYear !== null && expectedYear <= year + horizonYears;
    if (inHorizon) {
      nearLow += low;
      nearHigh += high;
    }
    const systemSpent = (s.costs ?? []).reduce((sum, c) => sum + (c.type === 'estimate' ? 0 : c.amount), 0);
    spent += systemSpent;
    rows.push({ systemId: s.id, name: systemName(s), status: life.status, expectedYear, cost: [low, high], inHorizon, spent: systemSpent });
  }
  rows.sort((a, b) => (a.expectedYear ?? Infinity) - (b.expectedYear ?? Infinity));
  return { rows, horizonYears, nearTerm: [nearLow, nearHigh], spent };
}
