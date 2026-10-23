import { describe, parse, parsePrefix, reverse, nearestSample, SAMPLE_POINTS, demoMode } from './postcode.js';
import { getHome, saveAlert } from './store.js';
import { findTower } from './towers.js';

export const TYPES = {
  attack: 'Kidnapping / attack',
  fire: 'Fire',
  medical: 'Medical',
  accident: 'Accident',
  other: 'Other emergency',
  unknown: 'Type not stated yet',
};

// "08012345678", "2348012345678", "+234 801 234 5678" -> "+2348012345678"
export function normalizePhone(input) {
  const digits = String(input || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('234')) return `+${digits}`;
  if (digits.startsWith('0') && digits.length === 11) return `+234${digits.slice(1)}`;
  return `+${digits}`;
}

function newId() {
  return `FM-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

async function homeFor(phone) {
  const home = await getHome(phone);
  if (!home) return null;
  return { ...home, ...(await describe(parse(home.postcode))) };
}

// source: 'app' (smartphone GPS), 'ussd' or 'sms' (keypad phone, located by tower).
export async function createAlert({ type, source, phone, lat, lng, accuracy_m, towerId, demo, note }) {
  phone = normalizePhone(phone);
  let location;
  let postcode = null;

  if (source === 'app' && !demo && Number.isFinite(lat) && Number.isFinite(lng)) {
    location = { method: 'gps', lat, lng, accuracy_m: Math.round(accuracy_m || 0) || null };
    postcode = await describe(await reverse(lat, lng));
  } else if (source === 'app') {
    // Demo location: one of the sandbox postcodes, so the pitch works anywhere.
    const s = Number.isFinite(lat) && Number.isFinite(lng) ? nearestSample(lat, lng) : SAMPLE_POINTS[0];
    location = { method: 'gps', lat: s.lat, lng: s.lng, accuracy_m: 10, simulated: true };
    postcode = await describe({ ...parse(s.code), confidence: 'demo' });
  } else {
    const t = findTower(towerId);
    location = { method: 'tower', lat: t.lat, lng: t.lng, accuracy_m: t.radius_m, tower: t.label };
    const area = parsePrefix(t.area || t.state);
    const described = area ? await describe(area) : null;
    postcode = {
      // Only a district-level area is worth showing as a postcode, not a bare state code.
      code: t.area ? described?.code : null,
      display: t.area ? described?.display : null,
      confidence: 'approximate',
      names: {
        state: described?.names.state || t.stateName,
        lga: described?.names.lga || t.lgaName,
        locality: null,
      },
    };
  }

  const alert = {
    id: newId(),
    type: TYPES[type] ? type : 'other',
    typeLabel: TYPES[type] || TYPES.other,
    source,
    phone,
    note: note ? String(note).slice(0, 280) : null,
    location,
    postcode,
    home: await homeFor(phone),
    demoMode,
    status: 'new',
    createdAt: new Date().toISOString(),
  };
  await saveAlert(alert);
  return alert;
}

// One line a responder (or a family member by SMS) can act on.
export function summary(alert) {
  const p = alert.postcode;
  const place = [p?.names?.lga, p?.names?.state].filter(Boolean).join(', ');
  const where = [p?.display && `Postcode ${p.display}`, place].filter(Boolean).join(', ');
  return `${alert.typeLabel}: ${where || 'location sent'}`;
}
