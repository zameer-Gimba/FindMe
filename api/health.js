import { checkKey } from '../lib/postcode.js';
import { persistent } from '../lib/store.js';

// Open /api/health after adding the key to check it works.
export default async function handler(req, res) {
  res.status(200).json({ postcodeApi: await checkKey(), storage: persistent ? 'netlify-blobs' : 'memory' });
}
