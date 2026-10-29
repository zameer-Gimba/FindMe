import { checkKey } from '../lib/postcode.js';
import { storage } from '../lib/store.js';

// Open /api/health after adding the key to check it works.
export default async function handler(req, res) {
  res.status(200).json({ postcodeApi: await checkKey(), storage });
}
