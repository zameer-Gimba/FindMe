import { checkKey, probe } from '../lib/postcode.js';
import { storage } from '../lib/store.js';

// Diagnostics only: ?probe=1[&code=FC-01-A01-KP-27][&q=FC][&lat=..&lng=..]
function probeArgs(q) {
  const code = /^[A-Za-z0-9-]{2,20}$/.test(q.code || '') ? q.code : undefined;
  const text = /^[A-Za-z0-9 -]{1,20}$/.test(q.q || '') ? q.q : undefined;
  const near = Number.isFinite(Number(q.lat)) && Number.isFinite(Number(q.lng)) && q.lat && q.lng ? { lat: Number(q.lat), lng: Number(q.lng) } : null;
  return [code, text ?? (code ? code.slice(0, 9) : undefined), near];
}

// Open /api/health after adding the key to check it works.
export default async function handler(req, res) {
  const [postcodeApi, sample] = await Promise.all([checkKey(), req.query?.probe ? probe(...probeArgs(req.query)) : null]);
  res.status(200).json({ postcodeApi, storage, ...(sample && { sample }) });
}
