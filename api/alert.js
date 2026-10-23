import { createAlert, summary } from '../lib/alerts.js';

// Smartphone HELP button: GPS coordinates in, alert with postcode out.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const b = req.body || {};
  try {
    const alert = await createAlert({
      source: 'app',
      type: b.type,
      phone: b.phone,
      lat: Number(b.lat),
      lng: Number(b.lng),
      accuracy_m: Number(b.accuracy),
      demo: Boolean(b.demo),
      note: b.note,
    });
    res.status(201).json({ alert, summary: summary(alert) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not send alert' });
  }
}
