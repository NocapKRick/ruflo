/**
 * Input validation at the system boundary. Every validator returns
 * `{ ok, value, errors }` where `value` is a trimmed, normalised copy that is
 * safe to store, and `errors` maps field name → human-readable message.
 */

import { getKind } from './catalog.mjs';
import { parseDate } from './dates.mjs';
import { parseFilterSize } from './reminders.mjs';

export const MAX_PHOTO_BYTES = 600_000;
export const COST_TYPES = ['repair', 'service', 'replacement', 'estimate'];
const PHOTO_DATA_URL = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ZIP = /^\d{5}(-\d{4})?$/;
export const US_STATES = new Set(('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH '
  + 'NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY PR GU VI AS MP').split(' '));

function text(v, max = 200) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function optionalInt(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : NaN;
}

function optionalNumber(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function result(value, errors) {
  return { ok: Object.keys(errors).length === 0, value, errors };
}

function checkYear(errors, field, year, now) {
  if (year === null) return;
  if (Number.isNaN(year) || year < 1800 || year > now.getUTCFullYear()) {
    errors[field] = `Enter a year between 1800 and ${now.getUTCFullYear()}.`;
  }
}

function checkDate(errors, field, value, { notFuture = false, now } = {}) {
  if (!value) return;
  const d = parseDate(value);
  if (!d) errors[field] = 'Enter a valid date (YYYY-MM-DD).';
  else if (notFuture && d > now) errors[field] = 'Date cannot be in the future.';
}

export function validateHome(input, now = new Date()) {
  const errors = {};
  const value = {
    nickname: text(input.nickname, 60),
    street: text(input.street, 120),
    city: text(input.city, 80),
    state: text(input.state, 20).toUpperCase(),
    zip: text(input.zip, 10),
    yearBuilt: optionalInt(input.yearBuilt),
    squareFeet: optionalInt(input.squareFeet),
  };
  if (!value.street) errors.street = 'Street address is required.';
  if (!value.city) errors.city = 'City is required.';
  if (!US_STATES.has(value.state)) errors.state = 'Use the two-letter state code, e.g. TX.';
  if (!ZIP.test(value.zip)) errors.zip = 'Enter a 5-digit ZIP code.';
  checkYear(errors, 'yearBuilt', value.yearBuilt, now);
  if (value.squareFeet !== null && (Number.isNaN(value.squareFeet) || value.squareFeet < 100 || value.squareFeet > 50_000)) {
    errors.squareFeet = 'Square footage should be between 100 and 50,000.';
  }
  return result(value, errors);
}

export function validateSystem(input, now = new Date()) {
  const errors = {};
  const kind = getKind(input.kind);
  const value = {
    id: text(input.id, 40) || undefined,
    kind: kind?.id ?? '',
    variant: text(input.variant, 40),
    name: text(input.name, 60),
    brand: text(input.brand, 60),
    model: text(input.model, 60),
    serial: text(input.serial, 60),
    installYear: optionalInt(input.installYear),
    lastServiceDate: text(input.lastServiceDate, 10),
    replacementEstimate: optionalNumber(input.replacementEstimate),
    notes: text(input.notes, 1000),
    warranty: {
      provider: text(input.warranty?.provider, 80),
      policyNumber: text(input.warranty?.policyNumber, 60),
      expires: text(input.warranty?.expires, 10),
      coverage: text(input.warranty?.coverage, 300),
    },
    filter: null,
  };
  if (!kind) errors.kind = 'Choose a system type.';
  else if (!kind.variants.some((v) => v.id === value.variant)) value.variant = kind.variants[0].id;
  checkYear(errors, 'installYear', value.installYear, now);
  checkDate(errors, 'lastServiceDate', value.lastServiceDate, { notFuture: true, now });
  checkDate(errors, 'warranty.expires', value.warranty.expires);
  if (value.replacementEstimate !== null && (Number.isNaN(value.replacementEstimate) || value.replacementEstimate < 0)) {
    errors.replacementEstimate = 'Enter a positive dollar amount.';
  }

  const filterSize = text(input.filter?.size, 20);
  if (filterSize) {
    const parsed = parseFilterSize(filterSize);
    if (!parsed) errors['filter.size'] = 'Use W x H x D, e.g. 16x25x1.';
    const intervalMonths = optionalInt(input.filter?.intervalMonths);
    if (intervalMonths !== null && (Number.isNaN(intervalMonths) || intervalMonths < 1 || intervalMonths > 24)) {
      errors['filter.intervalMonths'] = 'Interval should be 1–24 months.';
    }
    const quantity = optionalInt(input.filter?.quantity);
    const lastChanged = text(input.filter?.lastChanged, 10);
    checkDate(errors, 'filter.lastChanged', lastChanged, { notFuture: true, now });
    value.filter = {
      size: parsed?.label ?? filterSize,
      intervalMonths,
      quantity: Number.isInteger(quantity) && quantity > 0 ? Math.min(quantity, 10) : 1,
      lastChanged,
    };
  }
  return result(value, errors);
}

export function validateCost(input, now = new Date()) {
  const errors = {};
  const value = {
    date: text(input.date, 10),
    type: COST_TYPES.includes(input.type) ? input.type : '',
    amount: optionalNumber(input.amount),
    description: text(input.description, 200),
    vendor: text(input.vendor, 80),
  };
  if (!value.type) errors.type = 'Choose a cost type.';
  if (value.amount === null || Number.isNaN(value.amount) || value.amount < 0 || value.amount > 1_000_000) {
    errors.amount = 'Enter an amount between $0 and $1,000,000.';
  } else {
    value.amount = Math.round(value.amount * 100) / 100;
  }
  if (!value.date) errors.date = 'Date is required.';
  else checkDate(errors, 'date', value.date, { notFuture: value.type !== 'estimate', now });
  return result(value, errors);
}

export function validatePhoto(input) {
  const errors = {};
  const value = { dataUrl: typeof input.dataUrl === 'string' ? input.dataUrl : '', caption: text(input.caption, 120) };
  if (!PHOTO_DATA_URL.test(value.dataUrl)) errors.dataUrl = 'Photo must be a PNG, JPEG or WebP image.';
  else if (value.dataUrl.length > MAX_PHOTO_BYTES) errors.dataUrl = 'Photo is too large after compression.';
  return result(value, errors);
}

export function validateQuoteContact(input) {
  const errors = {};
  const value = {
    name: text(input.name, 80),
    email: text(input.email, 120),
    phone: text(input.phone, 30),
    preferredTime: text(input.preferredTime, 40),
    details: text(input.details, 1000),
    consent: input.consent === true,
  };
  if (!value.name) errors.name = 'Name is required.';
  if (!EMAIL.test(value.email)) errors.email = 'Enter a valid email address.';
  if (value.phone && !/^[\d\s()+.-]{7,30}$/.test(value.phone)) errors.phone = 'Enter a valid phone number.';
  if (!value.consent) errors.consent = 'Please agree to be contacted about this request.';
  return result(value, errors);
}
