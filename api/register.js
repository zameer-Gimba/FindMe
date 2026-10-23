import { normalizePhone } from '../lib/alerts.js';
import { describe, nearestSample, parse, reverse } from '../lib/postcode.js';
import { saveHome } from '../lib/store.js';

// Home registration, done standing at the house (by the owner, a family member,
// a ward head or a health worker). The postcode comes from the phone's GPS, so
// nobody needs to know their postcode. Records are only shown to responders
// when that phone number asks for help.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const b = req.body || {};
  const phone = normalizePhone(b.phone);
  if (!phone || phone.length < 12) return res.status(400).json({ error: 'Enter a valid phone number.' });
  if (!b.consent) return res.status(400).json({ error: 'The owner must agree before their home is saved.' });

  let found;
  if (b.demo) {
    found = { ...parse(nearestSample(9.0579, 7.4951).code), confidence: 'demo' };
  } else if (Number.isFinite(Number(b.lat)) && Number.isFinite(Number(b.lng)) && b.lat !== '' && b.lng !== '') {
    found = await reverse(Number(b.lat), Number(b.lng));
  }
  if (!found) {
    return res.status(422).json({ error: 'No postcode was found at this spot. Move closer to the house and try again.' });
  }

  const home = {
    name: String(b.name || '').trim().slice(0, 80) || null,
    postcode: found.code,
    landmark: String(b.landmark || '').trim().slice(0, 200) || null,
    registeredBy: String(b.registeredBy || 'Owner').slice(0, 60),
    registeredAt: new Date().toISOString(),
  };
  try {
    await saveHome(phone, home);
    res.status(201).json({ home: { ...home, ...(await describe(found)) }, phone });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not save. Please try again.' });
  }
}
