// Alert and home-postcode storage, shared by every serverless instance:
//   - Upstash Redis when KV_REST_API_URL/TOKEN (or UPSTASH_REDIS_REST_*) are set
//     (Vercel: Storage → Upstash for Redis, free tier),
//   - otherwise Netlify Blobs when running on Netlify,
//   - otherwise memory (local development).

import { getStore } from '@netlify/blobs';

const MAX_ALERTS = 100;
// Retention (see the privacy notice): alerts are deleted after 30 days, and a
// home registration nobody confirmed by SMS is dropped after 7 days.
export const ALERT_RETENTION_DAYS = 30;
const PENDING_HOME_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

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

// Each backend stores JSON values under keys, grouped in namespaces.
// Values saved by older deploys may be plain strings rather than JSON.
const parse = (raw) => {
  if (raw == null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
};

function redisBackend(url, token) {
  async function cmd(...args) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    const body = await res.json();
    if (body.error) throw new Error(body.error);
    return body.result;
  }
  return {
    name: 'upstash-redis',
    async get(ns, key) {
      return parse(await cmd('HGET', `findme:${ns}`, key));
    },
    set: (ns, key, value) => cmd('HSET', `findme:${ns}`, key, JSON.stringify(value)),
    async delete(ns, ...keys) {
      if (keys.length) await cmd('HDEL', `findme:${ns}`, ...keys);
    },
    keys: (ns) => cmd('HKEYS', `findme:${ns}`),
    async all(ns) {
      const flat = (await cmd('HGETALL', `findme:${ns}`)) || [];
      const out = {};
      for (let i = 0; i < flat.length; i += 2) out[flat[i]] = parse(flat[i + 1]);
      return out;
    },
    clear: (ns) => cmd('DEL', `findme:${ns}`),
  };
}

function netlifyBackend() {
  const store = (ns) => getStore({ name: `findme-${ns}`, consistency: 'strong' });
  store('alerts'); // throws when not running on Netlify
  const keys = async (ns) => (await store(ns).list()).blobs.map((b) => b.key);
  return {
    name: 'netlify-blobs',
    get: async (ns, key) => parse(await store(ns).get(key)),
    set: (ns, key, value) => store(ns).setJSON(key, value),
    delete: (ns, ...ks) => Promise.all(ks.map((k) => store(ns).delete(k))),
    keys,
    async all(ns) {
      const ks = await keys(ns);
      const values = await Promise.all(ks.map(async (k) => parse(await store(ns).get(k))));
      return Object.fromEntries(ks.map((k, i) => [k, values[i]]));
    },
    async clear(ns) {
      const ks = await keys(ns);
      await Promise.all(ks.map((k) => store(ns).delete(k)));
    },
  };
}

function memoryBackend() {
  const data = globalThis.__findme || (globalThis.__findme = {});
  const ns = (n) => (data[n] ||= {});
  return {
    name: 'memory',
    get: async (n, key) => ns(n)[key] ?? null,
    set: async (n, key, value) => { ns(n)[key] = value; },
    delete: async (n, ...keys) => keys.forEach((k) => delete ns(n)[k]),
    keys: async (n) => Object.keys(ns(n)),
    all: async (n) => ({ ...ns(n) }),
    clear: async (n) => { data[n] = {}; },
  };
}

function pickBackend() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return redisBackend(url, token);
  try {
    return netlifyBackend();
  } catch {
    return memoryBackend();
  }
}

const db = pickBackend();
export const storage = db.name;
export const persistent = db.name !== 'memory';

// Keys sort newest-first: inverted timestamp, then the alert id.
const alertKey = (a) => `${String(9e15 - Date.parse(a.createdAt)).padStart(16, '0')}_${a.id}`;
const keyTime = (key) => 9e15 - Number(key.split('_')[0]);
const expired = (time) => Date.now() - time > ALERT_RETENTION_DAYS * DAY_MS;
const phoneKey = (phone) => phone.replace(/\D/g, '');

export async function saveAlert(alert) {
  await db.set('alerts', alertKey(alert), alert);
  // Delete expired alerts, and keep only the newest so the dashboard stays quick.
  const keys = (await db.keys('alerts')).sort();
  const old = keys.filter((key, i) => i >= MAX_ALERTS || expired(keyTime(key)));
  await db.delete('alerts', ...old);
}

export async function listAlerts() {
  const [alerts, patches] = await Promise.all([db.all('alerts'), db.all('status')]);
  return Object.keys(alerts)
    .filter((key) => !expired(keyTime(key)))
    .sort()
    .slice(0, MAX_ALERTS)
    .map((key) => ({ ...alerts[key], ...patches[alerts[key].id] }));
}

// Later changes to an alert (status, or the type sent in a follow-up SMS).
export async function updateAlert(id, patch) {
  const current = await db.get('status', id);
  // Older deploys stored a bare status string.
  const base = typeof current === 'string' ? { status: current } : current;
  await db.set('status', id, { ...base, ...patch });
}

export async function clearAlerts() {
  await Promise.all([db.clear('alerts'), db.clear('status')]);
}

// Homes start as 'pending' until the phone's owner replies YES by SMS; only
// confirmed homes are shown to responders.
export async function getHome(phone, { includePending = false } = {}) {
  if (!phone) return null;
  const saved = (await db.get('homes', phoneKey(phone))) || DEMO_HOMES[phone];
  if (!saved) return null;
  if (saved.status === 'pending') {
    if (Date.now() - Date.parse(saved.registeredAt) > PENDING_HOME_DAYS * DAY_MS) {
      await deleteHome(phone);
      return null;
    }
    if (!includePending) return null;
  }
  return saved;
}

export async function saveHome(phone, record) {
  await db.set('homes', phoneKey(phone), record);
}

export async function deleteHome(phone) {
  await db.delete('homes', phoneKey(phone));
}
