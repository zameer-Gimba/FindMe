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

export async function getHome(phone) {
  if (!phone) return null;
  const store = blobs('findme-homes');
  const saved = store ? await store.get(phone.replace(/\D/g, ''), { type: 'json' }) : mem.homes[phone];
  return saved || DEMO_HOMES[phone] || null;
}

export async function saveHome(phone, record) {
  const store = blobs('findme-homes');
  if (!store) mem.homes[phone] = record;
  else await store.setJSON(phone.replace(/\D/g, ''), record);
}
