// Alert and home-postcode storage. Uses Upstash Redis (Vercel Marketplace) when
// configured, so every serverless instance sees the same alerts; otherwise memory.

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const MAX_ALERTS = 200;
const K = { alerts: 'findme:alerts', status: 'findme:status', homes: 'findme:homes' };

export const persistent = Boolean(URL_ && TOKEN);

// Pre-registered for the demo: a keypad-phone user whose home postcode a
// community health worker saved for them.
const DEMO_HOMES = {
  '+2348000000001': {
    name: 'Mama Aisha',
    postcode: 'FC-01-A01-KP-27',
    registeredBy: 'Community health worker',
    registeredAt: '2026-10-01T09:00:00.000Z',
  },
};

const mem = globalThis.__findme || (globalThis.__findme = { alerts: [], status: {}, homes: {} });

async function redis(...cmd) {
  const res = await fetch(URL_, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  const body = await res.json();
  if (body.error) throw new Error(body.error);
  return body.result;
}

function pairs(flat) {
  const out = {};
  for (let i = 0; i < (flat || []).length; i += 2) out[flat[i]] = flat[i + 1];
  return out;
}

export async function saveAlert(alert) {
  if (!persistent) {
    mem.alerts.unshift(alert);
    mem.alerts.length = Math.min(mem.alerts.length, MAX_ALERTS);
    return;
  }
  await redis('LPUSH', K.alerts, JSON.stringify(alert));
  await redis('LTRIM', K.alerts, 0, MAX_ALERTS - 1);
}

export async function listAlerts() {
  const alerts = persistent
    ? (await redis('LRANGE', K.alerts, 0, MAX_ALERTS - 1)).map((s) => JSON.parse(s))
    : mem.alerts;
  const status = persistent ? pairs(await redis('HGETALL', K.status)) : mem.status;
  return alerts.map((a) => ({ ...a, status: status[a.id] || a.status }));
}

export async function setStatus(id, status) {
  if (!persistent) mem.status[id] = status;
  else await redis('HSET', K.status, id, status);
}

export async function clearAlerts() {
  if (!persistent) {
    mem.alerts = [];
    mem.status = {};
  } else {
    await redis('DEL', K.alerts, K.status);
  }
}

export async function getHome(phone) {
  if (!phone) return null;
  const saved = persistent ? await redis('HGET', K.homes, phone) : mem.homes[phone];
  if (saved) return typeof saved === 'string' ? JSON.parse(saved) : saved;
  return DEMO_HOMES[phone] || null;
}

export async function saveHome(phone, record) {
  if (!persistent) mem.homes[phone] = record;
  else await redis('HSET', K.homes, phone, JSON.stringify(record));
}
