/** HTML templates for the forms shown in pages and dialogs. */

import { SYSTEM_KINDS, getKind } from '../domain/catalog.mjs';
import { COST_TYPES } from '../domain/validation.mjs';
import { REQUEST_TYPES, TRADE_LABELS } from '../domain/quotes.mjs';
import { filterIntervalMonths } from '../domain/reminders.mjs';
import { esc } from './dom.mjs';

const field = (label, name, value, attrs = '') =>
  `<label>${esc(label)}<input name="${name}" value="${esc(value ?? '')}" ${attrs}></label>`;

export function homeForm(home = {}) {
  return `
  <form data-form="home" class="card form" novalidate>
    <h2>Your home</h2>
    ${field('Nickname (optional)', 'nickname', home.nickname, 'placeholder="e.g. Maple Street house" maxlength="60"')}
    ${field('Street address', 'street', home.street, 'autocomplete="street-address" required')}
    <div class="row-3">
      ${field('City', 'city', home.city, 'autocomplete="address-level2" required')}
      ${field('State', 'state', home.state, 'autocomplete="address-level1" maxlength="2" placeholder="TX" required')}
      ${field('ZIP', 'zip', home.zip, 'autocomplete="postal-code" inputmode="numeric" required')}
    </div>
    <div class="row-2">
      ${field('Year built', 'yearBuilt', home.yearBuilt, 'type="number" inputmode="numeric" min="1800"')}
      ${field('Square feet', 'squareFeet', home.squareFeet, 'type="number" inputmode="numeric" min="100"')}
    </div>
    <div class="form-actions"><button class="btn primary" type="submit">Save home</button></div>
  </form>`;
}

function variantOptions(kindId, selected) {
  const kind = getKind(kindId);
  return (kind?.variants ?? []).map((v) =>
    `<option value="${v.id}" ${v.id === selected ? 'selected' : ''}>${esc(v.label)} — typical life ${v.lifespan[0]}–${v.lifespan[1]} yrs</option>`).join('');
}

export function systemForm(system = {}, kindId = system.kind ?? 'ac') {
  const kind = getKind(kindId);
  const hasFilter = kind?.group === 'hvac';
  const w = system.warranty ?? {};
  const f = system.filter ?? {};
  return `
  <form data-form="system" class="form" novalidate>
    <h2>${system.id ? 'Edit' : 'Add'} ${esc(kind?.label.toLowerCase() ?? 'system')}</h2>
    <input type="hidden" name="id" value="${esc(system.id ?? '')}">
    <div class="row-2">
      <label>System type
        <select name="kind" data-action="change-kind">
          ${Object.values(SYSTEM_KINDS).map((k) => `<option value="${k.id}" ${k.id === kindId ? 'selected' : ''}>${k.icon} ${esc(k.label)}</option>`).join('')}
        </select>
      </label>
      <label>Kind<select name="variant">${variantOptions(kindId, system.variant)}</select></label>
    </div>
    <div class="row-2">
      ${field('Name (optional)', 'name', system.name, 'placeholder="e.g. Upstairs AC" maxlength="60"')}
      ${field('Year installed', 'installYear', system.installYear, 'type="number" inputmode="numeric" placeholder="e.g. 2012"')}
    </div>
    <div class="row-3">
      ${field('Brand', 'brand', system.brand, 'maxlength="60"')}
      ${field('Model #', 'model', system.model, 'maxlength="60"')}
      ${field('Serial #', 'serial', system.serial, 'maxlength="60"')}
    </div>
    <div class="row-2">
      ${field('Last professional service', 'lastServiceDate', system.lastServiceDate, 'type="date"')}
      ${field('Your replacement quote ($, optional)', 'replacementEstimate', system.replacementEstimate, 'type="number" min="0" step="100"')}
    </div>
    ${hasFilter ? `
    <fieldset>
      <legend>🧹 Air filter</legend>
      <div class="row-3">
        ${field('Size (W x H x D)', 'filter.size', f.size, 'placeholder="16x25x1"')}
        ${field('Replace every (months)', 'filter.intervalMonths', f.intervalMonths, `type="number" min="1" max="24" placeholder="${f.size ? filterIntervalMonths(f) : 3}"`)}
        ${field('How many', 'filter.quantity', f.quantity ?? 1, 'type="number" min="1" max="10"')}
      </div>
      ${field('Last replaced', 'filter.lastChanged', f.lastChanged, 'type="date"')}
      <p class="hint">Leave the interval blank to use the default for the filter thickness (1″ every 3 months, 4″ every 6).</p>
    </fieldset>` : ''}
    <fieldset>
      <legend>📄 Warranty</legend>
      <div class="row-3">
        ${field('Provider', 'warranty.provider', w.provider, 'placeholder="Manufacturer or home warranty"')}
        ${field('Policy / registration #', 'warranty.policyNumber', w.policyNumber)}
        ${field('Expires', 'warranty.expires', w.expires, 'type="date"')}
      </div>
      ${field('What it covers', 'warranty.coverage', w.coverage, 'placeholder="e.g. Parts 10 yrs, labor 1 yr"')}
    </fieldset>
    <label>Notes<textarea name="notes" rows="3" maxlength="1000">${esc(system.notes ?? '')}</textarea></label>
    <div class="form-actions">
      <button class="btn" type="button" data-action="close-dialog">Cancel</button>
      <button class="btn primary" type="submit">Save</button>
    </div>
  </form>`;
}

export function costForm(systemId, todayIso) {
  return `
  <form data-form="cost" data-system="${esc(systemId)}" class="form inline-form" novalidate>
    <div class="row-4">
      <label>Type<select name="type">${COST_TYPES.map((t) => `<option value="${t}">${t[0].toUpperCase() + t.slice(1)}</option>`).join('')}</select></label>
      ${field('Date', 'date', todayIso, 'type="date"')}
      ${field('Amount ($)', 'amount', '', 'type="number" min="0" step="0.01" required')}
      ${field('Vendor', 'vendor', '', 'maxlength="80"')}
    </div>
    ${field('Description', 'description', '', 'maxlength="200" placeholder="e.g. Replaced capacitor"')}
    <div class="form-actions"><button class="btn" type="submit">Add cost</button></div>
  </form>`;
}

export function photoForm(systemId) {
  return `
  <form data-form="photo" data-system="${esc(systemId)}" class="form inline-form" novalidate>
    <div class="row-2">
      <label>Photo<input type="file" name="file" accept="image/*" capture="environment"></label>
      ${field('Caption', 'caption', '', 'placeholder="e.g. Data plate / model sticker" maxlength="120"')}
    </div>
    <p class="hint">Tip: photograph the manufacturer’s data plate — it has the model, serial and often the install date.</p>
    <div class="form-actions"><button class="btn" type="submit">Upload photo</button></div>
  </form>`;
}

export function quoteForm(system, requestType = 'inspection', contact = {}) {
  const trade = TRADE_LABELS[getKind(system.kind)?.group] ?? 'Contractor';
  return `
  <form data-form="quote" data-system="${esc(system.id)}" class="form" novalidate>
    <h2>💰 Get a quote — ${esc(trade)}</h2>
    <p class="muted">We’ll include your equipment’s age, model, service history and warranty so contractors can quote accurately.</p>
    <label>I need
      <select name="requestType">${REQUEST_TYPES.map((t) => `<option value="${t}" ${t === requestType ? 'selected' : ''}>${t[0].toUpperCase() + t.slice(1)}</option>`).join('')}</select>
    </label>
    <div class="row-2">
      ${field('Your name', 'name', contact.name, 'autocomplete="name" required')}
      ${field('Email', 'email', contact.email, 'type="email" autocomplete="email" required')}
    </div>
    <div class="row-2">
      ${field('Phone (optional)', 'phone', contact.phone, 'type="tel" autocomplete="tel"')}
      ${field('Best time to reach you', 'preferredTime', contact.preferredTime, 'placeholder="e.g. Weekday mornings"')}
    </div>
    <label>What’s going on?<textarea name="details" rows="3" maxlength="1000" placeholder="e.g. AC is 14 years old and struggling to keep up on hot days.">${esc(contact.details ?? '')}</textarea></label>
    <label class="check"><input type="checkbox" name="consent"> I agree to be contacted by local contractors about this request.</label>
    <div class="form-actions">
      <button class="btn" type="button" data-action="close-dialog">Cancel</button>
      <button class="btn primary" type="submit">Request quote</button>
    </div>
  </form>`;
}

export { variantOptions };
