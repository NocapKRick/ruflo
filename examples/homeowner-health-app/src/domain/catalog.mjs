/**
 * Reference data for the major systems of a home.
 *
 * Lifespans and replacement costs are typical US ranges for planning only —
 * actual life depends on climate, usage, install quality and maintenance, and
 * prices vary by region and home size. The UI always labels them "typical".
 */

/** @typedef {{ id: string, label: string, lifespan: [number, number], cost: [number, number] }} Variant */
/**
 * @typedef {{ id: string, title: string, intervalMonths: number, note?: string, appliesTo?: string[] }} TaskTemplate
 * `appliesTo` limits a task to specific variant ids; omitted means every variant.
 */
/**
 * @typedef {Object} SystemKind
 * @property {string} id
 * @property {string} label
 * @property {string} icon
 * @property {string} group          Trade a quote request is routed to.
 * @property {Variant[]} variants
 * @property {TaskTemplate[]} tasks
 * @property {Record<string, string>} [hazards]  variant id → warning shown regardless of age
 */

/** @type {Record<string, SystemKind>} */
export const SYSTEM_KINDS = {
  ac: {
    id: 'ac',
    label: 'Air conditioner',
    icon: '❄️',
    group: 'hvac',
    variants: [
      { id: 'central-ac', label: 'Central AC (split system)', lifespan: [12, 17], cost: [4000, 8000] },
      { id: 'heat-pump', label: 'Heat pump', lifespan: [10, 15], cost: [5000, 12000] },
      { id: 'mini-split', label: 'Ductless mini-split', lifespan: [15, 20], cost: [3000, 10000] },
    ],
    tasks: [
      { id: 'ac-tuneup', title: 'Professional AC tune-up', intervalMonths: 12, note: 'Best scheduled in spring.' },
      { id: 'ac-coil-clean', title: 'Clear debris around outdoor condenser', intervalMonths: 6 },
    ],
  },
  furnace: {
    id: 'furnace',
    label: 'Furnace',
    icon: '🔥',
    group: 'hvac',
    variants: [
      { id: 'gas-furnace', label: 'Gas furnace', lifespan: [15, 20], cost: [3000, 7000] },
      { id: 'electric-furnace', label: 'Electric furnace', lifespan: [20, 30], cost: [2000, 5000] },
      { id: 'oil-furnace', label: 'Oil furnace', lifespan: [15, 20], cost: [4000, 8000] },
      { id: 'boiler', label: 'Boiler', lifespan: [15, 30], cost: [5000, 12000] },
    ],
    tasks: [
      { id: 'furnace-tuneup', title: 'Professional furnace tune-up & safety check', intervalMonths: 12, note: 'Best scheduled in early fall.' },
    ],
  },
  'water-heater': {
    id: 'water-heater',
    label: 'Water heater',
    icon: '💧',
    group: 'plumbing',
    variants: [
      { id: 'tank-gas', label: 'Tank — gas', lifespan: [8, 12], cost: [1200, 3000] },
      { id: 'tank-electric', label: 'Tank — electric', lifespan: [10, 15], cost: [1000, 2500] },
      { id: 'tankless', label: 'Tankless', lifespan: [18, 20], cost: [2500, 5000] },
      { id: 'heat-pump-wh', label: 'Heat-pump water heater', lifespan: [10, 15], cost: [2500, 5500] },
    ],
    tasks: [
      { id: 'wh-flush', title: 'Flush water heater / descale', intervalMonths: 12 },
      { id: 'wh-anode', title: 'Inspect anode rod', intervalMonths: 36, appliesTo: ['tank-gas', 'tank-electric', 'heat-pump-wh'] },
      { id: 'wh-tpr', title: 'Test temperature & pressure relief valve', intervalMonths: 12 },
    ],
  },
  roof: {
    id: 'roof',
    label: 'Roof',
    icon: '🏚️',
    group: 'roofing',
    variants: [
      { id: 'asphalt', label: 'Asphalt shingle', lifespan: [20, 25], cost: [8000, 18000] },
      { id: 'architectural', label: 'Architectural shingle', lifespan: [25, 30], cost: [10000, 22000] },
      { id: 'metal', label: 'Metal', lifespan: [40, 70], cost: [15000, 35000] },
      { id: 'tile', label: 'Clay / concrete tile', lifespan: [50, 100], cost: [20000, 45000] },
      { id: 'wood-shake', label: 'Wood shake', lifespan: [25, 30], cost: [15000, 30000] },
      { id: 'flat', label: 'Flat / membrane', lifespan: [15, 25], cost: [8000, 20000] },
    ],
    tasks: [
      { id: 'roof-inspect', title: 'Roof inspection (shingles, flashing, attic for leaks)', intervalMonths: 12 },
      { id: 'gutters', title: 'Clean gutters & downspouts', intervalMonths: 6 },
    ],
  },
  plumbing: {
    id: 'plumbing',
    label: 'Plumbing',
    icon: '🚰',
    group: 'plumbing',
    variants: [
      { id: 'copper', label: 'Copper supply lines', lifespan: [50, 70], cost: [6000, 15000] },
      { id: 'pex', label: 'PEX supply lines', lifespan: [40, 50], cost: [4000, 10000] },
      { id: 'cpvc', label: 'CPVC supply lines', lifespan: [50, 75], cost: [4000, 10000] },
      { id: 'galvanized', label: 'Galvanized steel', lifespan: [40, 50], cost: [6000, 15000] },
      { id: 'polybutylene', label: 'Polybutylene (gray plastic)', lifespan: [10, 25], cost: [4000, 12000] },
    ],
    tasks: [
      { id: 'plumbing-leaks', title: 'Check under sinks, toilets & appliances for leaks', intervalMonths: 6 },
      { id: 'plumbing-shutoff', title: 'Exercise main & fixture shutoff valves', intervalMonths: 12 },
    ],
    hazards: {
      polybutylene: 'Polybutylene pipe is prone to sudden failure and some insurers will not cover it. Get a plumber’s assessment.',
      galvanized: 'Galvanized pipe corrodes from the inside and can restrict flow or leak as it ages.',
    },
  },
  electrical: {
    id: 'electrical',
    label: 'Electrical panel',
    icon: '⚡',
    group: 'electrical',
    variants: [
      { id: 'breaker-panel', label: 'Breaker panel', lifespan: [25, 40], cost: [1500, 4000] },
      { id: 'fuse-box', label: 'Fuse box', lifespan: [25, 40], cost: [2000, 5000] },
      { id: 'fpe-zinsco', label: 'Federal Pacific / Zinsco panel', lifespan: [25, 40], cost: [2000, 5000] },
    ],
    tasks: [
      { id: 'detectors', title: 'Test smoke & CO detectors; replace batteries', intervalMonths: 6 },
      { id: 'gfci', title: 'Test GFCI and AFCI outlets/breakers', intervalMonths: 6 },
      { id: 'electrical-inspect', title: 'Licensed electrician safety inspection', intervalMonths: 60 },
    ],
    hazards: {
      'fpe-zinsco': 'Federal Pacific and Zinsco panels have a documented history of breakers failing to trip. Have an electrician evaluate it.',
      'fuse-box': 'Fuse boxes often lack capacity for modern loads and may affect insurance. Consider an evaluation.',
    },
  },
};

/** Default filter-change interval in months, by filter thickness in inches. */
export const FILTER_INTERVAL_BY_DEPTH = { 1: 3, 2: 4, 4: 6, 5: 9 };

/** Fraction of typical lifespan at which a system is "approaching" replacement. */
export const APPROACHING_RATIO = 0.75;

export function getKind(kindId) {
  return SYSTEM_KINDS[kindId] ?? null;
}

export function getVariant(kindId, variantId) {
  const kind = getKind(kindId);
  if (!kind) return null;
  return kind.variants.find((v) => v.id === variantId) ?? kind.variants[0];
}
