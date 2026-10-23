import { clearAlerts, listAlerts, setStatus } from '../lib/store.js';

const STATUSES = ['new', 'acknowledged', 'resolved'];

// Responder dashboard: list alerts, update their status, or clear the demo.
export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      return res.status(200).json({ alerts: await listAlerts() });
    }
    if (req.method === 'PATCH') {
      const { id, status } = req.body || {};
      if (!id || !STATUSES.includes(status)) return res.status(400).json({ error: 'id and a valid status are required' });
      await setStatus(id, status);
      return res.status(200).json({ ok: true });
    }
    if (req.method === 'DELETE') {
      await clearAlerts();
      return res.status(200).json({ ok: true });
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Storage error' });
  }
}
