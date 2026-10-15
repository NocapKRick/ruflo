/**
 * "Get a Quote" — packages a system's context into a request a local
 * contractor can act on, and hands it to a QuoteProvider.
 *
 * Only a local provider ships today: it keeps the request on this device so
 * the homeowner can export or email it. A marketplace provider (matching the
 * request to vetted local HVAC, plumbing, roofing and electrical companies by
 * ZIP and trade, with a referral fee or subscription paid by the contractor)
 * plugs in by implementing the same `submit()` contract.
 */

import { getKind } from './catalog.mjs';
import { lifeStatus, systemName, warrantyStatus } from './assessment.mjs';
import { validateQuoteContact } from './validation.mjs';

export const TRADE_LABELS = { hvac: 'HVAC', plumbing: 'Plumbing', roofing: 'Roofing', electrical: 'Electrical' };
export const REQUEST_TYPES = ['inspection', 'repair', 'replacement'];

/**
 * @typedef {Object} QuoteProvider
 * @property {string} id
 * @property {string} label
 * @property {(request: Object) => Promise<{ status: 'saved'|'sent'|'failed', reference?: string, message: string }>} submit
 */

/** @type {QuoteProvider} */
export const localQuoteProvider = {
  id: 'local',
  label: 'Saved on this device',
  async submit() {
    return {
      status: 'saved',
      message: 'Request saved. Contractor matching isn’t available in your area yet — export or email this request to a local company.',
    };
  },
};

/**
 * Builds a quote request from validated contact details plus the system's
 * recorded facts, so the contractor gets age, equipment and warranty context.
 * @returns {{ ok: true, request: Object } | { ok: false, errors: Record<string,string> }}
 */
export function buildQuoteRequest({ home, system, contact, requestType = 'inspection', now = new Date(), id }) {
  const errors = {};
  if (!home?.zip) errors.home = 'Add your home address before requesting a quote.';
  if (!system) errors.system = 'Choose a system.';
  if (!REQUEST_TYPES.includes(requestType)) errors.requestType = 'Choose inspection, repair or replacement.';
  const c = validateQuoteContact(contact ?? {});
  Object.assign(errors, c.errors);
  if (Object.keys(errors).length) return { ok: false, errors };

  const kind = getKind(system.kind);
  const life = lifeStatus(system, now);
  const warranty = warrantyStatus(system.warranty, now);
  return {
    ok: true,
    request: {
      id,
      createdAt: now.toISOString(),
      trade: kind.group,
      tradeLabel: TRADE_LABELS[kind.group] ?? kind.group,
      requestType,
      systemId: system.id,
      systemLabel: systemName(system),
      location: { city: home.city, state: home.state, zip: home.zip },
      equipment: {
        type: life.variant?.label ?? kind.label,
        brand: system.brand || null,
        model: system.model || null,
        installYear: system.installYear ?? null,
        ageYears: life.age,
        lifeStatus: life.status,
        lastServiceDate: system.lastServiceDate || null,
        filterSize: system.filter?.size ?? null,
        warranty: warranty.status === 'none' ? null : { provider: system.warranty.provider || null, expires: system.warranty.expires, status: warranty.status },
      },
      contact: c.value,
    },
  };
}

/** Plain-text version for email or copy/paste to a contractor. */
export function quoteRequestToText(r) {
  const e = r.equipment;
  return [
    `${r.tradeLabel} ${r.requestType} request — ${r.systemLabel}`,
    `Location: ${r.location.city}, ${r.location.state} ${r.location.zip}`,
    `Equipment: ${e.type}${e.brand ? `, ${e.brand}` : ''}${e.model ? ` ${e.model}` : ''}`,
    e.installYear ? `Installed: ${e.installYear} (${e.ageYears} years old)` : 'Installed: unknown',
    e.lastServiceDate ? `Last service: ${e.lastServiceDate}` : null,
    e.filterSize ? `Filter size: ${e.filterSize}` : null,
    e.warranty ? `Warranty: ${e.warranty.provider ?? 'on file'}, ${e.warranty.status}, expires ${e.warranty.expires}` : 'Warranty: none on file',
    r.contact.details ? `Details: ${r.contact.details}` : null,
    `Contact: ${r.contact.name} · ${r.contact.email}${r.contact.phone ? ` · ${r.contact.phone}` : ''}`,
    r.contact.preferredTime ? `Best time: ${r.contact.preferredTime}` : null,
  ].filter(Boolean).join('\n');
}
