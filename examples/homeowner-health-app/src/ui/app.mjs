/** Browser controller: hash routing, rendering, and DOM event wiring. */

import { createStore } from '../domain/store.mjs';
import { costForecast, healthScore, homeInsights } from '../domain/assessment.mjs';
import { buildSchedule, countOverdue, remindersToICS } from '../domain/reminders.mjs';
import { buildQuoteRequest, localQuoteProvider, quoteRequestToText } from '../domain/quotes.mjs';
import { toISODate, today } from '../domain/dates.mjs';
import { compressImage, download, formToObject, showErrors } from './dom.mjs';
import { quoteForm, systemForm } from './forms.mjs';
import * as views from './views.mjs';

const storage = (() => {
  try {
    const probe = '__hh_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return null; // private mode / blocked storage — the app still works for this session
  }
})();

const store = createStore({ storage });
const quoteProvider = localQuoteProvider;
const main = document.querySelector('#main');
const dialog = document.querySelector('#dialog');
const dialogBody = document.querySelector('#dialog-body');
const toastEl = document.querySelector('#toast');

function viewModel() {
  const state = store.getState();
  const now = new Date();
  const reminders = buildSchedule(state.systems, state.completions, now);
  return {
    state,
    now,
    todayIso: toISODate(today(now)),
    reminders,
    insights: homeInsights(state.systems, now),
    health: healthScore(state.systems, countOverdue(reminders), now),
    forecast: costForecast(state.systems, now),
    saveError: store.getSaveError(),
  };
}

function route() {
  const [, page = 'overview', id] = (location.hash || '#/overview').split('/');
  return { page, id };
}

function render() {
  const vm = viewModel();
  const { page, id } = route();
  document.querySelector('#home-title').textContent = views.headerTitle(vm.state);
  document.querySelector('#home-address').textContent = vm.state.home
    ? `${vm.state.home.street}, ${vm.state.home.city}, ${vm.state.home.state} ${vm.state.home.zip}` : 'Add your address to get started';
  document.querySelector('#header-score').innerHTML = vm.state.home ? views.scoreRing(vm.health) : '';
  document.querySelector('nav').hidden = !vm.state.home;
  document.querySelectorAll('nav a').forEach((a) => a.setAttribute('aria-current', a.getAttribute('href') === `#/${page}` ? 'page' : 'false'));
  const overdue = countOverdue(vm.reminders);
  document.querySelector('#reminder-badge').textContent = overdue ? String(overdue) : '';

  if (!vm.state.home) {
    main.innerHTML = views.onboarding();
    return;
  }
  const system = page === 'systems' && id ? store.getSystem(id) : null;
  const pages = {
    overview: () => views.overview(vm),
    systems: () => (system ? views.systemDetail(vm, system) : views.systemsPage(vm)),
    reminders: () => views.remindersPage(vm),
    costs: () => views.costsPage(vm),
    quotes: () => views.quotesPage(vm),
    home: () => views.homePage(vm),
  };
  main.innerHTML = (pages[page] ?? pages.overview)();
}

function toast(message, tone = 'good') {
  toastEl.textContent = message;
  toastEl.className = `toast show ${tone}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { toastEl.className = 'toast'; }, 3500);
}

function afterWrite(message) {
  const err = store.getSaveError();
  if (err) toast(err, 'bad');
  else if (message) toast(message);
}

function openDialog(html) {
  dialogBody.innerHTML = html;
  dialog.showModal();
  dialogBody.querySelector('input:not([type=hidden]), select, textarea')?.focus();
}

function openQuote(systemId, requestType) {
  const system = store.getSystem(systemId);
  if (!system) return;
  const last = store.getState().quotes[0]?.contact;
  openDialog(quoteForm(system, requestType, last ? { name: last.name, email: last.email, phone: last.phone } : {}));
}

const actions = {
  'add-system': (el) => openDialog(systemForm({}, el.dataset.kind)),
  'edit-system': (el) => openDialog(systemForm(store.getSystem(el.dataset.system))),
  'close-dialog': () => dialog.close(),
  'remove-system': (el) => {
    if (!confirm('Remove this system and its photos, costs and history?')) return;
    store.removeSystem(el.dataset.system);
    location.hash = '#/systems';
    afterWrite('System removed');
  },
  'complete-task': (el) => {
    const dateInput = main.querySelector(`[data-done-date="${CSS.escape(el.dataset.key)}"]`);
    const res = store.completeTask(el.dataset.system, el.dataset.task, dateInput?.value || undefined);
    if (res.ok) afterWrite('Nice work — reminder updated');
    else toast(Object.values(res.errors)[0], 'bad');
  },
  'remove-cost': (el) => { store.removeCost(el.dataset.system, el.dataset.cost); afterWrite(); },
  'remove-photo': (el) => {
    if (confirm('Remove this photo?')) { store.removePhoto(el.dataset.system, el.dataset.photo); afterWrite(); }
  },
  'insight-check-warranty': (el) => {
    location.hash = `#/systems/${el.dataset.system}`;
    requestAnimationFrame(() => document.querySelector('#warranty')?.scrollIntoView({ behavior: 'smooth' }));
  },
  'insight-schedule-inspection': (el) => openQuote(el.dataset.system, 'inspection'),
  'insight-get-quote': (el) => openQuote(el.dataset.system, 'replacement'),
  'insight-log-service': (el) => openDialog(systemForm(store.getSystem(el.dataset.system))),
  'download-ics': () => {
    download('home-maintenance.ics', remindersToICS(buildSchedule(store.getState().systems, store.getState().completions)), 'text/calendar');
  },
  'export-json': () => download(`homeowner-health-${toISODate(today())}.json`, store.exportJSON(), 'application/json'),
  'copy-quote': async (el) => {
    const quote = store.getState().quotes.find((q) => q.id === el.dataset.quote);
    try {
      await navigator.clipboard.writeText(quoteRequestToText(quote));
      toast('Copied to clipboard');
    } catch {
      toast('Copy failed — select the text instead', 'bad');
    }
  },
  reset: () => {
    if (confirm('Delete all homes, systems, photos and history from this browser? Export a backup first if you might need it.')) {
      store.reset();
      location.hash = '#/overview';
      afterWrite('All data cleared');
    }
  },
};

const forms = {
  home(form) {
    const res = store.saveHome(formToObject(form));
    if (!res.ok) return showErrors(form, res.errors);
    afterWrite('Home saved');
    if (route().page === 'home') return;
    location.hash = '#/overview';
  },
  system(form) {
    const res = store.saveSystem(formToObject(form));
    if (!res.ok) return showErrors(form, res.errors);
    dialog.close();
    afterWrite('System saved');
    location.hash = `#/systems/${res.id}`;
  },
  cost(form) {
    const res = store.addCost(form.dataset.system, formToObject(form));
    if (!res.ok) return showErrors(form, res.errors);
    afterWrite('Cost logged');
  },
  async photo(form) {
    const file = form.elements.file.files[0];
    if (!file) return showErrors(form, { file: 'Choose a photo first.' });
    try {
      const dataUrl = await compressImage(file);
      const res = store.addPhoto(form.dataset.system, { dataUrl, caption: form.elements.caption.value });
      if (!res.ok) return showErrors(form, { file: Object.values(res.errors)[0] });
      afterWrite('Photo added');
    } catch (err) {
      showErrors(form, { file: err.message });
    }
  },
  async quote(form) {
    const data = formToObject(form);
    const state = store.getState();
    const built = buildQuoteRequest({
      home: state.home,
      system: store.getSystem(form.dataset.system),
      contact: data,
      requestType: data.requestType,
      id: crypto.randomUUID?.() ?? String(Date.now()),
    });
    if (!built.ok) return showErrors(form, built.errors);
    const result = await quoteProvider.submit(built.request);
    store.recordQuote({ ...built.request, status: result.status, provider: quoteProvider.id, message: result.message, reference: result.reference });
    dialog.close();
    location.hash = '#/quotes';
    afterWrite(result.status === 'sent' ? 'Quote request sent' : 'Quote request saved');
  },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.tagName === 'SELECT' || el.tagName === 'INPUT') return;
  const fn = actions[el.dataset.action];
  if (fn) { e.preventDefault(); fn(el); }
});

document.addEventListener('submit', (e) => {
  const form = e.target.closest('form[data-form]');
  if (!form) return;
  e.preventDefault();
  forms[form.dataset.form]?.(form);
});

document.addEventListener('change', async (e) => {
  const el = e.target;
  if (el.dataset.action === 'change-kind') {
    // Re-render the system form for the new type, keeping what was typed.
    const values = formToObject(el.form);
    dialogBody.innerHTML = systemForm({ ...values, variant: undefined }, el.value);
  }
  if (el.dataset.action === 'import-json' && el.files[0]) {
    const res = store.importData(await el.files[0].text());
    if (res.ok) afterWrite('Backup imported');
    else toast(res.errors.file, 'bad');
  }
});

dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });
store.subscribe(render);
render();
