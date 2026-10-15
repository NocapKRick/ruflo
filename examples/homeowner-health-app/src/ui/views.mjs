/** Page templates. Each takes a precomputed view model and returns HTML. */

import { SYSTEM_KINDS, getKind } from '../domain/catalog.mjs';
import { lifeStatus, warrantyStatus } from '../domain/assessment.mjs';
import { formatDate } from '../domain/dates.mjs';
import { quoteRequestToText } from '../domain/quotes.mjs';
import { costForm, homeForm, photoForm } from './forms.mjs';
import { esc, money, moneyRange } from './dom.mjs';

const LIFE_LABEL = { unknown: 'Age unknown', healthy: 'Healthy', approaching: 'Approaching window', due: 'Replacement window', past: 'Past typical life' };
const LIFE_TONE = { unknown: 'muted', healthy: 'good', approaching: 'info', due: 'warn', past: 'bad' };
const WARRANTY_LABEL = { none: 'No warranty on file', active: 'Warranty active', expiring: 'Warranty expiring', expired: 'Warranty expired' };
const WARRANTY_TONE = { none: 'muted', active: 'good', expiring: 'warn', expired: 'bad' };
const REMINDER_LABEL = { overdue: 'Overdue', 'due-soon': 'Due soon', unrecorded: 'Not yet recorded', upcoming: 'Upcoming' };
const REMINDER_TONE = { overdue: 'bad', 'due-soon': 'warn', unrecorded: 'info', upcoming: 'muted' };
const ACTION_LABEL = { 'check-warranty': '📄 Check warranty', 'schedule-inspection': '🔧 Schedule inspection', 'get-quote': '💰 Get a quote', 'log-service': '✅ Log service' };

const chip = (tone, text) => `<span class="chip ${tone}">${esc(text)}</span>`;

export function scoreRing(health) {
  const pct = health.score ?? 0;
  return `
  <div class="score ${health.tone}" role="img" aria-label="Home health score ${health.score ?? 'not available'}">
    <svg viewBox="0 0 36 36" aria-hidden="true">
      <circle class="track" cx="18" cy="18" r="15.9" />
      <circle class="value" cx="18" cy="18" r="15.9" stroke-dasharray="${pct} 100" />
    </svg>
    <div class="score-text"><strong>${health.score ?? '—'}</strong><span>${esc(health.grade)}</span></div>
  </div>`;
}

function lifeBar(life) {
  if (life.status === 'unknown') return '<p class="muted small">Add the install year to see where this system is in its life.</p>';
  const [min, max] = life.lifespan;
  const minPct = Math.round((min / max) * 100);
  return `
  <div class="lifebar ${LIFE_TONE[life.status]}" title="Typical life ${min}–${max} years">
    <div class="lifebar-window" style="left:${minPct}%"></div>
    <div class="lifebar-fill" style="width:${life.percentUsed}%"></div>
  </div>
  <p class="small muted">${life.age} yrs old · typical life ${min}–${max} yrs · window ${life.window[0]}–${life.window[1]}</p>`;
}

export function onboarding() {
  return `
  <section class="hero card">
    <h1>🏠 Know the health of your home</h1>
    <p>Enter your address and the major systems in your home. We’ll track their age, service history, filters and warranties — and tell you when something needs attention.</p>
  </section>
  ${homeForm()}`;
}

function insightCard(insight) {
  return `
  <article class="insight ${insight.severity}">
    <h3>${esc(insight.title)}</h3>
    <p>${esc(insight.message)}</p>
    <div class="actions">
      ${insight.actions.map((a) => `<button class="btn small" data-action="insight-${a}" data-system="${esc(insight.systemId)}">${ACTION_LABEL[a]}</button>`).join('')}
    </div>
  </article>`;
}

function systemCard(system, now) {
  const kind = getKind(system.kind);
  const life = lifeStatus(system, now);
  const w = warrantyStatus(system.warranty, now);
  return `
  <a class="card system-card" href="#/systems/${esc(system.id)}">
    <div class="system-head"><span class="icon">${kind.icon}</span><div><h3>${esc(system.name || kind.label)}</h3><p class="small muted">${esc(life.variant?.label ?? '')}</p></div></div>
    ${lifeBar(life)}
    <div class="chips">${chip(LIFE_TONE[life.status], LIFE_LABEL[life.status])}${chip(WARRANTY_TONE[w.status], WARRANTY_LABEL[w.status])}</div>
  </a>`;
}

function addSystemButtons(existing) {
  return `
  <div class="add-grid">
    ${Object.values(SYSTEM_KINDS).map((k) => {
      const count = existing.filter((s) => s.kind === k.id).length;
      return `<button class="add-tile" data-action="add-system" data-kind="${k.id}"><span class="icon">${k.icon}</span>${esc(k.label)}${count ? `<small>${count} added</small>` : '<small>+ Add</small>'}</button>`;
    }).join('')}
  </div>`;
}

function reminderRow(r, todayIso, compact = false) {
  return `
  <li class="reminder">
    <span class="icon">${r.icon}</span>
    <div class="grow">
      <strong>${esc(r.title)}</strong>
      <p class="small muted">${esc(r.systemLabel)} · every ${r.intervalMonths} mo · ${r.lastDone ? `last done ${formatDate(r.lastDone)}` : 'never logged'}${r.note ? ` · ${esc(r.note)}` : ''}</p>
    </div>
    <div class="reminder-due">
      ${chip(REMINDER_TONE[r.status], r.status === 'unrecorded' ? REMINDER_LABEL.unrecorded : `${REMINDER_LABEL[r.status]} · ${formatDate(r.dueDate)}`)}
      ${compact ? '' : `<input type="date" aria-label="Date completed" value="${todayIso}" max="${todayIso}" data-done-date="${esc(r.key)}">`}
      <button class="btn small" data-action="complete-task" data-system="${esc(r.systemId)}" data-task="${esc(r.taskId)}" data-key="${esc(r.key)}">Mark done</button>
    </div>
  </li>`;
}

export function overview(vm) {
  const { state, health, insights, reminders, forecast, now, todayIso } = vm;
  const due = reminders.filter((r) => r.status !== 'upcoming');
  return `
  <section class="summary">
    <div class="card score-card">${scoreRing(health)}<div><h2>Home health</h2><p class="muted">${state.systems.length} system${state.systems.length === 1 ? '' : 's'} tracked</p></div></div>
    <div class="card stat"><span class="stat-value">${reminders.filter((r) => r.status === 'overdue').length}</span><span class="muted">overdue tasks</span></div>
    <div class="card stat"><span class="stat-value">${moneyRange(forecast.nearTerm)}</span><span class="muted">likely replacements in the next ${forecast.horizonYears} years</span></div>
  </section>
  ${state.systems.length === 0 ? `<section class="card"><h2>Add your home’s systems</h2><p class="muted">Start with what you know — you can add the install year, filters and warranties later.</p>${addSystemButtons([])}</section>` : ''}
  ${insights.length ? `<section><h2>🔔 What needs attention</h2><div class="insights">${insights.map(insightCard).join('')}</div></section>` : state.systems.length ? '<section class="card good-news"><h2>✅ All clear</h2><p>Nothing needs attention right now. We’ll let you know when something does.</p></section>' : ''}
  ${due.length ? `<section><h2>🧹 Maintenance to do</h2><ul class="reminders card">${due.slice(0, 6).map((r) => reminderRow(r, todayIso, true)).join('')}</ul>${due.length > 6 ? '<p><a href="#/reminders">See all reminders →</a></p>' : ''}</section>` : ''}
  ${state.systems.length ? `<section><h2>🏠 Your systems</h2><div class="system-grid">${state.systems.map((s) => systemCard(s, now)).join('')}</div></section>` : ''}`;
}

export function systemsPage(vm) {
  return `
  <section><h1>Systems</h1>${addSystemButtons(vm.state.systems)}</section>
  <section class="system-grid">${vm.state.systems.map((s) => systemCard(s, vm.now)).join('') || '<p class="muted">No systems yet — pick one above.</p>'}</section>`;
}

function detailRow(label, value) {
  return value ? `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>` : '';
}

export function systemDetail(vm, system) {
  const { now, todayIso, reminders } = vm;
  const kind = getKind(system.kind);
  const life = lifeStatus(system, now);
  const w = warrantyStatus(system.warranty, now);
  const tasks = reminders.filter((r) => r.systemId === system.id);
  const insights = vm.insights.filter((i) => i.systemId === system.id);
  const costs = [...(system.costs ?? [])].sort((a, b) => b.date.localeCompare(a.date));
  const total = costs.reduce((sum, c) => sum + (c.type === 'estimate' ? 0 : c.amount), 0);
  return `
  <p><a href="#/systems">← All systems</a></p>
  <section class="card">
    <div class="system-head big"><span class="icon">${kind.icon}</span><div class="grow"><h1>${esc(system.name || kind.label)}</h1><p class="muted">${esc(life.variant?.label ?? '')}</p></div>
      <div class="actions"><button class="btn" data-action="edit-system" data-system="${esc(system.id)}">Edit</button><button class="btn primary" data-action="insight-get-quote" data-system="${esc(system.id)}">💰 Get a quote</button></div></div>
    ${lifeBar(life)}
    <div class="chips">${chip(LIFE_TONE[life.status], LIFE_LABEL[life.status])}${chip(WARRANTY_TONE[w.status], WARRANTY_LABEL[w.status])}</div>
    <dl class="details">
      ${detailRow('Installed', system.installYear ? `${system.installYear} (${life.age} years ago)` : 'Unknown')}
      ${detailRow('Brand / model', [system.brand, system.model].filter(Boolean).join(' '))}
      ${detailRow('Serial #', system.serial)}
      ${detailRow('Last service', system.lastServiceDate ? formatDate(system.lastServiceDate) : (SYSTEM_KINDS[system.kind].group === 'hvac' ? 'Not recorded' : ''))}
      ${detailRow('Filter', system.filter ? `${system.filter.size}${system.filter.quantity > 1 ? ` ×${system.filter.quantity}` : ''}, last replaced ${formatDate(system.filter.lastChanged)}` : '')}
      ${detailRow('Typical replacement cost', life.variant ? moneyRange(system.replacementEstimate > 0 ? [system.replacementEstimate, system.replacementEstimate] : life.variant.cost) : '')}
      ${detailRow('Notes', system.notes)}
    </dl>
  </section>
  ${insights.length ? `<section class="insights">${insights.map(insightCard).join('')}</section>` : ''}
  <section class="card" id="warranty">
    <h2>📄 Warranty</h2>
    ${w.status === 'none' ? '<p class="muted">No warranty on file. Check the manufacturer’s site with your model and serial number — many offer 10-year parts warranties when registered.</p>' : `
    <dl class="details">
      ${detailRow('Provider', system.warranty.provider)}
      ${detailRow('Policy #', system.warranty.policyNumber)}
      ${detailRow('Expires', `${formatDate(system.warranty.expires)}${w.daysLeft >= 0 ? ` (${w.daysLeft} days left)` : ' (expired)'}`)}
      ${detailRow('Coverage', system.warranty.coverage)}
    </dl>`}
  </section>
  <section class="card"><h2>🔔 Maintenance</h2><ul class="reminders">${tasks.map((r) => reminderRow(r, todayIso)).join('') || '<li class="muted">No recurring tasks for this system.</li>'}</ul></section>
  <section class="card">
    <h2>📸 Photos</h2>
    <div class="photos">${(system.photos ?? []).map((p) => `
      <figure><img src="${esc(p.dataUrl)}" alt="${esc(p.caption || 'Equipment photo')}" loading="lazy"><figcaption>${esc(p.caption)}<button class="link danger" data-action="remove-photo" data-system="${esc(system.id)}" data-photo="${esc(p.id)}">Remove</button></figcaption></figure>`).join('') || '<p class="muted">No photos yet.</p>'}</div>
    ${photoForm(system.id)}
  </section>
  <section class="card">
    <h2>💰 Repair & replacement costs</h2>
    ${costs.length ? `<table class="table"><thead><tr><th>Date</th><th>Type</th><th>Description</th><th class="num">Amount</th><th></th></tr></thead><tbody>
      ${costs.map((c) => `<tr><td>${formatDate(c.date)}</td><td>${esc(c.type)}</td><td>${esc(c.description)}${c.vendor ? ` <span class="muted">· ${esc(c.vendor)}</span>` : ''}</td><td class="num">${money(c.amount)}</td><td><button class="link danger" data-action="remove-cost" data-system="${esc(system.id)}" data-cost="${esc(c.id)}" aria-label="Remove cost">✕</button></td></tr>`).join('')}
    </tbody><tfoot><tr><td colspan="3">Total spent (excl. estimates)</td><td class="num">${money(total)}</td><td></td></tr></tfoot></table>` : '<p class="muted">No costs logged yet.</p>'}
    ${costForm(system.id, todayIso)}
  </section>
  <p><button class="btn danger" data-action="remove-system" data-system="${esc(system.id)}">Remove this system</button></p>`;
}

export function remindersPage(vm) {
  const { reminders, todayIso } = vm;
  const groups = ['overdue', 'due-soon', 'unrecorded', 'upcoming'];
  return `
  <section class="page-head"><h1>Maintenance reminders</h1>${reminders.length ? '<button class="btn" data-action="download-ics">📅 Add to calendar (.ics)</button>' : ''}</section>
  ${reminders.length ? groups.map((g) => {
    const items = reminders.filter((r) => r.status === g);
    return items.length ? `<section><h2>${REMINDER_LABEL[g]} <span class="muted">(${items.length})</span></h2><ul class="reminders card">${items.map((r) => reminderRow(r, todayIso)).join('')}</ul></section>` : '';
  }).join('') : '<p class="muted">Add a system to start getting reminders.</p>'}`;
}

export function costsPage(vm) {
  const { forecast } = vm;
  return `
  <h1>Costs & replacement forecast</h1>
  <section class="summary">
    <div class="card stat"><span class="stat-value">${moneyRange(forecast.nearTerm)}</span><span class="muted">likely replacements within ${forecast.horizonYears} years</span></div>
    <div class="card stat"><span class="stat-value">${money(forecast.spent)}</span><span class="muted">spent on repairs, service & replacements</span></div>
  </section>
  <section class="card">
    <h2>Replacement timeline</h2>
    ${forecast.rows.length ? `<table class="table"><thead><tr><th>System</th><th>Status</th><th>Expected</th><th class="num">Typical cost</th><th class="num">Spent</th></tr></thead><tbody>
      ${forecast.rows.map((r) => `<tr class="${r.inHorizon ? 'highlight' : ''}"><td><a href="#/systems/${esc(r.systemId)}">${esc(r.name)}</a></td><td>${chip(LIFE_TONE[r.status], LIFE_LABEL[r.status])}</td><td>${r.expectedYear ?? '—'}</td><td class="num">${moneyRange(r.cost)}</td><td class="num">${money(r.spent)}</td></tr>`).join('')}
    </tbody></table>
    <p class="hint">Costs are typical US ranges for planning only. Add your own quote on a system to replace the estimate.</p>` : '<p class="muted">Add systems to see a forecast.</p>'}
  </section>`;
}

export function quotesPage(vm) {
  const { state } = vm;
  return `
  <h1>Quote requests</h1>
  <section class="card info-card">
    <p>Request a quote from any system or alert. Each request includes the equipment’s age, model, service history and warranty status so contractors can price it accurately.</p>
  </section>
  ${state.quotes.length ? state.quotes.map((q) => `
  <article class="card quote">
    <div class="page-head"><h2>${esc(q.tradeLabel)} ${esc(q.requestType)} — ${esc(q.systemLabel)}</h2>${chip(q.status === 'sent' ? 'good' : 'info', q.status === 'sent' ? 'Sent' : 'Saved')}</div>
    <p class="small muted">${formatDate(q.createdAt.slice(0, 10))}${q.message ? ` · ${esc(q.message)}` : ''}</p>
    <pre class="quote-text">${esc(quoteRequestToText(q))}</pre>
    <div class="actions">
      <button class="btn small" data-action="copy-quote" data-quote="${esc(q.id)}">Copy text</button>
      <a class="btn small" href="mailto:?subject=${encodeURIComponent(`${q.tradeLabel} ${q.requestType} request`)}&body=${encodeURIComponent(quoteRequestToText(q))}">Email to a contractor</a>
    </div>
  </article>`).join('') : '<p class="muted">No quote requests yet.</p>'}`;
}

export function homePage(vm) {
  const { state, saveError } = vm;
  return `
  ${homeForm(state.home ?? {})}
  <section class="card">
    <h2>Your data</h2>
    <p class="muted">Everything is stored in this browser only. Export a backup to move it to another device.</p>
    ${saveError ? `<p class="field-error">${esc(saveError)}</p>` : ''}
    <div class="actions">
      <button class="btn" data-action="export-json">⬇️ Export backup</button>
      <label class="btn">⬆️ Import backup<input type="file" accept="application/json,.json" data-action="import-json" hidden></label>
      <button class="btn danger" data-action="reset">Clear all data</button>
    </div>
  </section>
  ${state.events.length ? `<section class="card"><h2>Activity</h2><ul class="activity">${state.events.slice(0, 15).map((e) => `<li><span class="muted small">${esc(new Date(e.at).toLocaleString())}</span> ${esc(e.summary)}</li>`).join('')}</ul></section>` : ''}`;
}

export function headerTitle(state) {
  if (!state.home) return 'Homeowner Health';
  return state.home.nickname || state.home.street;
}

