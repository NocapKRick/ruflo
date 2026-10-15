import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  costForecast, healthScore, homeInsights, insightsFor, lifeStatus, warrantyStatus,
} from '../src/domain/assessment.mjs';

const NOW = new Date('2026-10-15T12:00:00Z');
const ac = (installYear, extra = {}) => ({ id: 'ac1', kind: 'ac', variant: 'central-ac', installYear, lastServiceDate: '2026-05-01', ...extra });

test('lifeStatus classifies against the typical lifespan (central AC: 12–17 yrs)', () => {
  assert.equal(lifeStatus(ac(2020), NOW).status, 'healthy'); // 6 yrs
  assert.equal(lifeStatus(ac(2017), NOW).status, 'approaching'); // 9 yrs ≥ 0.75 × 12
  assert.equal(lifeStatus(ac(2013), NOW).status, 'due'); // 13 yrs
  assert.equal(lifeStatus(ac(2008), NOW).status, 'past'); // 18 yrs
  assert.equal(lifeStatus(ac(undefined), NOW).status, 'unknown');
  assert.deepEqual(lifeStatus(ac(2013), NOW).window, [2025, 2030]);
});

test('warrantyStatus reports active, expiring (≤90 days), expired and none', () => {
  assert.equal(warrantyStatus({ expires: '2030-01-01' }, NOW).status, 'active');
  const expiring = warrantyStatus({ expires: '2026-11-14' }, NOW);
  assert.equal(expiring.status, 'expiring');
  assert.equal(expiring.daysLeft, 30);
  assert.equal(warrantyStatus({ expires: '2025-01-01' }, NOW).status, 'expired');
  assert.equal(warrantyStatus({}, NOW).status, 'none');
  assert.equal(warrantyStatus({ expires: 'not-a-date' }, NOW).status, 'none');
});

test('approaching HVAC produces the replacement-window message with warranty + inspection advice', () => {
  const [insight] = insightsFor(ac(2017), NOW);
  assert.equal(insight.code, 'life-approaching');
  assert.match(insight.message, /^Your HVAC system \(air conditioner\) is approaching the typical replacement window/);
  assert.match(insight.message, /Check your warranty and schedule an inspection\.$/);
  assert.deepEqual(insight.actions, ['check-warranty', 'schedule-inspection']);
});

test('warranty advice names the provider and expiry when one is on file', () => {
  const [insight] = insightsFor(ac(2013, { warranty: { provider: 'Carrier', expires: '2028-03-01' } }), NOW);
  assert.equal(insight.code, 'life-due');
  assert.match(insight.message, /warranty with Carrier runs until Mar 1, 2028/);
});

test('hazardous variants are flagged regardless of age', () => {
  const panel = { id: 'p1', kind: 'electrical', variant: 'fpe-zinsco', installYear: 2024 };
  const insights = insightsFor(panel, NOW);
  assert.equal(insights[0].severity, 'critical');
  assert.equal(insights[0].code, 'hazard');
});

test('service is flagged overdue after 12 months and unknown when never logged', () => {
  const overdue = insightsFor(ac(2022, { lastServiceDate: '2025-06-01' }), NOW);
  assert.ok(overdue.some((i) => i.code === 'service-overdue'));
  const unknown = insightsFor(ac(2022, { lastServiceDate: '' }), NOW);
  assert.ok(unknown.some((i) => i.code === 'service-unknown'));
});

test('homeInsights sorts critical before warning before info', () => {
  const systems = [ac(2017), { id: 'r1', kind: 'roof', variant: 'asphalt', installYear: 2000 }];
  const severities = homeInsights(systems, NOW).map((i) => i.severity);
  assert.deepEqual(severities, [...severities].sort((a, b) => ['critical', 'warning', 'info'].indexOf(a) - ['critical', 'warning', 'info'].indexOf(b)));
  assert.equal(severities[0], 'critical');
});

test('healthScore is null with no systems and drops with age, hazards and overdue tasks', () => {
  assert.equal(healthScore([], 0, NOW).score, null);
  const fresh = healthScore([ac(2024)], 0, NOW);
  assert.equal(fresh.score, 100);
  assert.equal(fresh.grade, 'Excellent');
  const old = healthScore([ac(2005, { lastServiceDate: '2020-01-01' })], 3, NOW);
  assert.equal(old.score, 100 - 20 - 4 - 6);
  assert.equal(healthScore([ac(2024)], 50, NOW).score, 80, 'overdue-task penalty is capped at 20');
});

test('costForecast budgets replacements inside the horizon and sums spend (excluding estimates)', () => {
  const systems = [
    ac(2013, { costs: [{ amount: 300, type: 'repair' }, { amount: 7000, type: 'estimate' }] }),
    { id: 'r1', kind: 'roof', variant: 'metal', installYear: 2020, costs: [] },
    { id: 'w1', kind: 'water-heater', variant: 'tank-gas', installYear: 2019, replacementEstimate: 2100, costs: [] },
  ];
  const f = costForecast(systems, NOW, 5);
  assert.deepEqual(f.nearTerm, [4000 + 2100, 8000 + 2100]);
  assert.equal(f.spent, 300);
  assert.equal(f.rows[0].systemId, 'ac1', 'sorted by expected replacement year');
  assert.equal(f.rows.find((r) => r.systemId === 'r1').inHorizon, false);
});
