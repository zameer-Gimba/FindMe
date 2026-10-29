// Thin client for the NIPOST Postcode API (https://docs.postcode.gov.ng).
// Without POSTCODE_API_KEY the app runs in demo mode on the public sandbox postcodes.

const BASE = process.env.POSTCODE_API_BASE || 'https://api.postcode.gov.ng';
const KEY = (process.env.POSTCODE_API_KEY || '').trim();

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

// Used when no key is set or the API is unreachable, so names still show.
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

// Short timeout: an alert makes up to three calls and Netlify stops a
// function after 10 seconds. Alerts are always saved, with or without names.
const TIMEOUT_MS = 3000;

async function call(path, params = {}) {
  const url = new URL(path, BASE);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, {
    headers: { 'X-API-Key': KEY, Accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
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

// For /api/health: NIPOST's raw replies for one sandbox postcode, to check the
// response shapes (the key itself is never included).
export async function probe(code = SAMPLE_POINTS[0].code, q = code.slice(0, 9), near = null) {
  if (demoMode) return null;
  const raw = async (path, params) => {
    const url = new URL(path, BASE);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    try {
      const res = await fetch(url, { headers: { 'X-API-Key': KEY, Accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
      return { status: res.status, body: await res.json().catch(() => null) };
    } catch (e) {
      return { error: e.message };
    }
  };
  const [lookup, autocomplete, nearby] = await Promise.all([
    raw('/v1/lookup', { code, level: 1 }),
    raw('/v1/search/autocomplete', { q }),
    near ? raw('/v1/search/nearby', { lat: near.lat, lng: near.lng, radius: 300 }) : null,
  ]);
  return { code, q, lookup, autocomplete, ...(nearby && { nearby }) };
}

// Reference lists rarely change, so they are cached. After a failure we skip
// them for a minute instead of making every alert wait on a broken call.
const cache = { states: null, lgas: {}, failedUntil: 0 };

async function cached(load) {
  if (Date.now() < cache.failedUntil) return null;
  try {
    return await load();
  } catch (e) {
    cache.failedUntil = Date.now() + 60_000;
    console.error('reference lookup failed:', e.message);
    return null;
  }
}

const pad2 = (c) => String(c).padStart(2, '0');

async function stateName(code) {
  if (demoMode) return DEMO_STATE_NAMES[code] || null;
  const states = await cached(async () => {
    if (!cache.states) {
      const data = await call('/v1/reference/states');
      cache.states = Object.fromEntries(data.states.map((s) => [s.code.toUpperCase(), s.name]));
    }
    return cache.states;
  });
  return states?.[code] || DEMO_STATE_NAMES[code] || null;
}

async function lgaName(state, lga) {
  if (demoMode) return null;
  const lgas = await cached(async () => {
    if (!cache.lgas[state]) {
      const data = await call('/v1/reference/lgas', { state });
      cache.lgas[state] = Object.fromEntries(data.lgas.map((l) => [pad2(l.code), l.name]));
    }
    return cache.lgas[state];
  });
  return lgas?.[pad2(lga)] || null;
}

// State and LGA names come from the free reference lists, so this works on an L1 key.
export async function names({ state, lga } = {}) {
  const [s, l] = await Promise.all([
    state ? stateName(state) : null,
    state && lga ? lgaName(state, lga) : null,
  ]);
  return { state: s, lga: l };
}

// For /api/health: is the key accepted, and what can it do?
export async function checkKey() {
  if (demoMode) return { ok: false, mode: 'demo', message: 'No POSTCODE_API_KEY set: running on demo data.' };
  try {
    const data = await call('/v1/reference/states');
    const env = KEY.startsWith('nipost_live_') ? 'live' : KEY.startsWith('nipost_test_') ? 'test' : 'unknown';
    return { ok: true, mode: env, states: data.states.length };
  } catch (e) {
    return { ok: false, mode: 'error', status: e.status || null, code: e.code || null, message: e.message };
  }
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
    const u = d?.found ? d.unit : null;
    const parsed = u && parse(u.postcode);
    if (!parsed) return null;
    return {
      ...parsed,
      distance_m: u.distance_m ?? null,
      confidence: u.confidence ?? null,
      // Present only on L2+ keys; otherwise filled from the reference lists.
      apiNames: { state: u.state_name, lga: u.lga_name, locality: u.locality_name },
      address: u.address || null,
    };
  } catch (e) {
    console.error('reverse geocode failed:', e.message);
    return null;
  }
}

// Lookup level 1 (free): is this an active NIPOST postcode? true, false, or
// null when it could not be checked (no key for a non-sandbox code, API down).
export async function verify(code) {
  if (demoMode) return null; // never claim a NIPOST check that did not happen
  try {
    const d = await call('/v1/lookup', { code, level: 1 });
    return Boolean(d?.valid);
  } catch (e) {
    if (e.status === 404 || e.status === 422) return false;
    console.error('postcode lookup failed:', e.message);
    return null;
  }
}

// Fills names for a parsed postcode or prefix, and verifies full postcodes.
export async function describe(parsed) {
  if (!parsed?.segments) return null;
  const [n, verified] = await Promise.all([
    names(parsed.segments),
    parsed.segments.unit ? verify(parsed.code) : null,
  ]);
  const api = parsed.apiNames || {};
  return {
    code: parsed.code,
    display: parsed.display,
    distance_m: parsed.distance_m ?? null,
    confidence: parsed.confidence ?? null,
    address: parsed.address ?? null,
    verified,
    // Demo postcodes NIPOST could not confirm (its test data is empty for our
    // key) are labelled "Verified (demo)", never shown as NIPOST-verified.
    demoVerified: verified !== true && SAMPLE_POINTS.some((p) => p.code === parsed.code),
    names: {
      state: api.state || n.state,
      lga: api.lga || n.lga,
      locality: api.locality || null,
    },
  };
}
