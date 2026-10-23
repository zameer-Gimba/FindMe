import { TOWERS } from '../lib/towers.js';
import { demoMode } from '../lib/postcode.js';
import { persistent } from '../lib/store.js';

// Simulator setup data plus whether a real key / shared storage is configured.
export default function handler(req, res) {
  res.status(200).json({ towers: TOWERS, demoMode, persistent });
}
