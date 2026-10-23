// Thin client for the NIPOST Postcode API (https://docs.postcode.gov.ng).
// Without POSTCODE_API_KEY the app runs in demo mode on the public sandbox postcodes.

const BASE = process.env.POSTCODE_API_BASE || 'https://api.postcode.gov.ng';
const KEY = process.env.POSTCODE_API_KEY || '';

export const demoMode = !KEY;

// The sandbox postcodes from the NIPOST docs (public buildings in the FCT).
// Coordinates are placeholders around Abuja's Central Area until the sandbox
// geometry is confirmed with a key.
export const SAMPLE_POINTS = [
  { code: 'FC-01-A01-KP-27', lat: 9.0579, lng: 7.4951 },
  { code: 'FC-01-A01-LR-01', lat: 9.0532, lng: 7.4890 },
  { code: 'FC-01-A01-MH-01', lat: 9.0610, lng: 7.4855 },
  { code: 'FC-01-A01-MV-01', lat: 9.0495, lng: 7.4980 },
  { code: 'FC-01-A01-MW-01', lat: 9.0650, lng: 7.5010 },
];

// Used only when no key is set, so the demo still shows readable names.
const DEMO_STATE_NAMES = { FC: 'Federal Capital Territory' };

const PATTERN = /^([A-Z]{2})(\d{2})([A-Z0-9]{3})([A-Z]{2})(\d{2})$/;
const PREFIX = /^([A-Z]{2})(\d{2})?([A-Z0-9]{3})?([A-Z]{2})?$/;

// Accepts any of "FC-01-A01-KP-27", "fc 01 a01 kp 27", "FC01A01KP27".
export function parse(input) {
  const compact = String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const m = compact.match(PATTERN);
  if (!m) return null;
  const [, state, lga, district, area, unit] = m;
  return {
    code: `${state}-${lga}-${district}-${area}-${unit}`,
    display: `${state} ${lga} ${district} ${area} ${unit}`,
    compact,
    segments: { state, lga, district, area, unit },
  };
}

// Partial codes such as "FC-01-A01" (a postcode district) for coarse locations.
export function parsePrefix(input) {
  const compact = String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const m = compact.match(PREFIX);
  if (!m) return null;
  const parts = m.slice(1).filter(Boolean);
  const [state, lga, district, area] = m.slice(1);
  return { code: parts.join('-'), display: parts.join(' '), segments: { state, lga, district, area } };
}

async function call(path, params = {}) {
  const url = new URL(path, BASE);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, {
    headers: { 'X-API-Key': KEY, Accept: 'application/json' },
    signal: AbortSignal.timeout(6000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body?.error?.message || `Postcode API ${res.status}`);
    err.status = res.status;
    err.code = body?.error?.code;
    throw err;
  }
  return body.data;
}

const cache = { states: null, lgas: {} };

async function stateName(code) {
  if (demoMode) return DEMO_STATE_NAMES[code] || null;
  if (!cache.states) {
    const data = await call('/v1/reference/states');
    cache.states = Object.fromEntries(data.states.map((s) => [s.code, s.name]));
  }
  return cache.states[code] || null;
}

async function lgaName(state, lga) {
  if (demoMode) return null;
  if (!cache.lgas[state]) {
    const data = await call('/v1/reference/lgas', { state });
    cache.lgas[state] = Object.fromEntries(data.lgas.map((l) => [l.code, l.name]));
  }
  return cache.lgas[state][lga] || null;
}

// State and LGA names come from the free reference lists, so this works on an L1 key.
export async function names({ state, lga }) {
  const out = { state: null, lga: null };
  try {
    if (state) out.state = await stateName(state);
    if (state && lga) out.lga = await lgaName(state, lga);
  } catch (e) {
    console.error('reference lookup failed:', e.message);
  }
  return out;
}

function distanceM(a, b) {
  const R = 6371000;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function nearestSample(lat, lng) {
  let best = null;
  for (const p of SAMPLE_POINTS) {
    const d = distanceM({ lat, lng }, p);
    if (!best || d < best.distance_m) best = { ...p, distance_m: Math.round(d) };
  }
  return best;
}

// GPS coordinate -> nearest postcode (within 250m), or null.
export async function reverse(lat, lng) {
  if (demoMode) {
    const s = nearestSample(lat, lng);
    if (s.distance_m > 50000) return null;
    return { ...parse(s.code), distance_m: s.distance_m, confidence: 'demo' };
  }
  try {
    const d = await call('/v1/search/reverse', { lat, lng, max_distance_m: 250 });
    if (!d?.found) return null;
    const u = d.unit;
    return {
      ...parse(u.postcode),
      distance_m: u.distance_m,
      confidence: u.confidence,
      // Present only on L2+ keys; otherwise filled from the reference lists.
      apiNames: { state: u.state_name, lga: u.lga_name, locality: u.locality_name },
      address: u.address || null,
    };
  } catch (e) {
    console.error('reverse geocode failed:', e.message);
    return null;
  }
}

// L1 lookup: is this a real, active postcode? null means "could not check".
export async function isValid(code) {
  if (demoMode) return SAMPLE_POINTS.some((p) => p.code === code) ? true : null;
  try {
    const d = await call('/v1/lookup', { code, level: 1 });
    return Boolean(d?.valid);
  } catch (e) {
    console.error('lookup failed:', e.message);
    return null;
  }
}

// Fills names for a parsed postcode or prefix.
export async function describe(parsed) {
  if (!parsed) return null;
  const n = await names(parsed.segments);
  const api = parsed.apiNames || {};
  return {
    code: parsed.code,
    display: parsed.display,
    distance_m: parsed.distance_m ?? null,
    confidence: parsed.confidence ?? null,
    address: parsed.address ?? null,
    names: {
      state: api.state || n.state,
      lga: api.lga || n.lga,
      locality: api.locality || null,
    },
  };
}
