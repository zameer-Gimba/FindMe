import { checkKey, probe } from '../lib/postcode.js';
import { storage } from '../lib/store.js';

// Open /api/health after adding the key to check it works.
export default async function handler(req, res) {
  const [postcodeApi, sample] = await Promise.all([checkKey(), req.query?.probe ? probe() : null]);
  res.status(200).json({ postcodeApi, storage, ...(sample && { sample }) });
}
