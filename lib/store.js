// Alert and home-postcode storage. On Netlify it uses Netlify Blobs (free, built
// in), so every function instance sees the same alerts; locally it uses memory.

import { getStore } from '@netlify/blobs';

const MAX_ALERTS = 100;

// Pre-registered for the demo: a keypad-phone user whose home postcode a
// community health worker saved for them.
const DEMO_HOMES = {
  '+2348000000001': {
    name: 'Mama Aisha',
    postcode: 'FC-01-A01-KP-27',
    landmark: 'Blue gate behind the Juma\'at mosque, opposite the borehole',
    registeredBy: 'Community health worker',
    registeredAt: '2026-10-01T09:00:00.000Z',
    status: 'confirmed',
  },
};

function blobs(name) {
  try {
    return getStore({ name, consistency: 'strong' });
  } catch {
    return null; // not running on Netlify
  }
}

export const persistent = Boolean(blobs('findme-alerts'));

const mem = globalThis.__findme || (globalThis.__findme = { alerts: [], status: {}, homes: {} });

// Keys sort newest-first: inverted timestamp, then the alert id.
const alertKey = (a) => `${String(9e15 - Date.parse(a.createdAt)).padStart(16, '0')}_${a.id}`;

export async function saveAlert(alert) {
  const store = blobs('findme-alerts');
  if (!store) {
    mem.alerts.unshift(alert);
    mem.alerts.length = Math.min(mem.alerts.length, MAX_ALERTS);
    return;
  }
  await store.setJSON(alertKey(alert), alert);
  // Keep only the newest alerts so the dashboard stays quick.
  const { blobs: items } = await store.list();
  const old = items.map((b) => b.key).sort().slice(MAX_ALERTS);
  await Promise.all(old.map((key) => store.delete(key)));
}

export async function listAlerts() {
  const store = blobs('findme-alerts');
  if (!store) return mem.alerts.map((a) => ({ ...a, ...mem.status[a.id] }));
  const { blobs: items } = await store.list();
  const keys = items.map((b) => b.key).sort().slice(0, MAX_ALERTS);
  const patches = blobs('findme-status');
  return Promise.all(
    keys.map(async (key) => {
      const a = await store.get(key, { type: 'json' });
      return { ...a, ...parsePatch(await patches.get(a.id)) };
    }),
  );
}

// Older deploys stored a bare status string; newer ones store a JSON patch.
function parsePatch(raw) {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { status: raw };
  }
}

// Later changes to an alert (status, or the type sent in a follow-up SMS).
export async function updateAlert(id, patch) {
  const store = blobs('findme-status');
  if (!store) {
    mem.status[id] = { ...mem.status[id], ...patch };
    return;
  }
  const current = parsePatch(await store.get(id));
  await store.setJSON(id, { ...current, ...patch });
}

export async function clearAlerts() {
  if (!persistent) {
    mem.alerts = [];
    mem.status = {};
    return;
  }
  for (const name of ['findme-alerts', 'findme-status']) {
    const store = blobs(name);
    const { blobs: items } = await store.list();
    await Promise.all(items.map((b) => store.delete(b.key)));
  }
}

// Homes start as 'pending' until the phone's owner replies YES by SMS; only
// confirmed homes are shown to responders.
export async function getHome(phone, { includePending = false } = {}) {
  if (!phone) return null;
  const store = blobs('findme-homes');
  const saved = (store ? await store.get(phone.replace(/\D/g, ''), { type: 'json' }) : mem.homes[phone]) || DEMO_HOMES[phone];
  if (!saved) return null;
  if (saved.status === 'pending' && !includePending) return null;
  return saved;
}

export async function saveHome(phone, record) {
  const store = blobs('findme-homes');
  if (!store) mem.homes[phone] = record;
  else await store.setJSON(phone.replace(/\D/g, ''), record);
}

export async function deleteHome(phone) {
  const store = blobs('findme-homes');
  if (!store) delete mem.homes[phone];
  else await store.delete(phone.replace(/\D/g, ''));
}
