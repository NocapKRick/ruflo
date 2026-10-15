import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSchedule, filterIntervalMonths, parseFilterSize, remindersToICS, taskTemplatesFor,
} from '../src/domain/reminders.mjs';
import { addMonths, parseDate } from '../src/domain/dates.mjs';

const NOW = new Date('2026-10-15T12:00:00Z');

test('parseFilterSize accepts common spellings and rejects junk', () => {
  assert.deepEqual(parseFilterSize('16x25x1'), { width: 16, height: 25, depth: 1, label: '16x25x1' });
  assert.equal(parseFilterSize(' 20 X 20 x 4 ').depth, 4);
  assert.equal(parseFilterSize('16×25×1').label, '16x25x1');
  assert.equal(parseFilterSize('16x25'), null);
  assert.equal(parseFilterSize(''), null);
});

test('filter interval defaults by thickness unless overridden', () => {
  assert.equal(filterIntervalMonths({ size: '16x25x1' }), 3);
  assert.equal(filterIntervalMonths({ size: '20x25x4' }), 6);
  assert.equal(filterIntervalMonths({ size: '20x25x4', intervalMonths: 2 }), 2);
  assert.equal(filterIntervalMonths({ size: 'odd' }), 3);
});

test('addMonths clamps to month end', () => {
  assert.equal(addMonths(parseDate('2026-01-31'), 1).toISOString().slice(0, 10), '2026-02-28');
});

test('anode-rod task only applies to tank water heaters', () => {
  const ids = (variant) => taskTemplatesFor({ kind: 'water-heater', variant }).map((t) => t.id);
  assert.ok(ids('tank-gas').includes('wh-anode'));
  assert.ok(!ids('tankless').includes('wh-anode'));
});

test('filter reminder becomes overdue after its interval and counts completions', () => {
  const furnace = { id: 'f1', kind: 'furnace', variant: 'gas-furnace', lastServiceDate: '2026-09-01', filter: { size: '16x25x1', lastChanged: '2026-06-01' } };
  const [filter] = buildSchedule([furnace], [], NOW).filter((r) => r.taskId === 'filter');
  assert.equal(filter.dueDate, '2026-09-01');
  assert.equal(filter.status, 'overdue');
  assert.match(filter.title, /16x25x1/);

  const after = buildSchedule([furnace], [{ systemId: 'f1', taskId: 'filter', date: '2026-10-10' }], NOW).find((r) => r.taskId === 'filter');
  assert.equal(after.status, 'upcoming');
  assert.equal(after.dueDate, '2027-01-10');
});

test('tune-up reminders use the last service date; unknown history is "unrecorded"', () => {
  const ac = { id: 'a1', kind: 'ac', variant: 'central-ac', lastServiceDate: '2025-11-01' };
  const tune = buildSchedule([ac], [], NOW).find((r) => r.taskId === 'ac-tuneup');
  assert.equal(tune.status, 'due-soon');
  assert.equal(tune.daysUntil, 17);
  const never = buildSchedule([{ ...ac, lastServiceDate: '' }], [], NOW).find((r) => r.taskId === 'ac-tuneup');
  assert.equal(never.status, 'unrecorded');
});

test('schedule is ordered overdue → due-soon → unrecorded → upcoming', () => {
  const systems = [
    { id: 'r1', kind: 'roof', variant: 'asphalt' },
    { id: 'f1', kind: 'furnace', variant: 'gas-furnace', lastServiceDate: '2026-10-01', filter: { size: '16x25x1', lastChanged: '2026-01-01' } },
  ];
  const order = buildSchedule(systems, [], NOW).map((r) => r.status);
  const rank = { overdue: 0, 'due-soon': 1, unrecorded: 2, upcoming: 3 };
  assert.deepEqual(order, [...order].sort((a, b) => rank[a] - rank[b]));
  assert.equal(order[0], 'overdue');
});

test('ICS export is a valid calendar and puts overdue items on today', () => {
  const furnace = { id: 'f1', kind: 'furnace', variant: 'gas-furnace', filter: { size: '16x25x1', lastChanged: '2026-01-01' } };
  const ics = remindersToICS(buildSchedule([furnace], [], NOW), NOW);
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /END:VCALENDAR\r\n$/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261015/);
  assert.equal((ics.match(/BEGIN:VEVENT/g) ?? []).length, 2);
  assert.ok(!/[^\r]\n/.test(ics), 'lines end with CRLF');
});
