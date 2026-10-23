// Netlify entry point: routes /api/* to the handlers in api/, which are written
// in the familiar (req, res) style so they also run under dev-server.js.

import alert from '../../api/alert.js';
import alerts from '../../api/alerts.js';
import health from '../../api/health.js';
import register from '../../api/register.js';
import sms from '../../api/sms.js';
import towers from '../../api/towers.js';
import ussd from '../../api/ussd.js';

const ROUTES = { alert, alerts, health, register, sms, towers, ussd };

async function readBody(request) {
  const type = request.headers.get('content-type') || '';
  if (type.includes('application/json')) return request.json().catch(() => ({}));
  if (type.includes('application/x-www-form-urlencoded')) return Object.fromEntries(new URLSearchParams(await request.text()));
  return request.text();
}

export default async (request) => {
  const url = new URL(request.url);
  const handler = ROUTES[url.pathname.replace(/^\/api\//, '').replace(/\/$/, '')];
  if (!handler) return new Response('Not found', { status: 404 });

  const req = {
    method: request.method,
    headers: Object.fromEntries(request.headers),
    query: Object.fromEntries(url.searchParams),
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : await readBody(request),
  };

  let status = 200;
  const headers = new Headers();
  let body = '';
  const res = {
    status(code) { status = code; return res; },
    setHeader(name, value) { headers.set(name, value); return res; },
    json(data) { headers.set('Content-Type', 'application/json'); body = JSON.stringify(data); return res; },
    send(data) { body = typeof data === 'string' ? data : JSON.stringify(data); return res; },
  };

  await handler(req, res);
  return new Response(body, { status, headers });
};

export const config = { path: '/api/*' };
