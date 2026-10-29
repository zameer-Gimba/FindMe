import { normalizePhone } from '../lib/alerts.js';
import { describe, nearestSample, parse, reverse } from '../lib/postcode.js';
import { saveHome } from '../lib/store.js';
import { sendSms } from '../lib/sms.js';

// Home registration, done standing at the house (by the owner, a family member,
// a ward head or a health worker). The postcode comes from the phone's GPS, so
// nobody needs to know their postcode.
//   preview: true -> just find and verify the postcode, so the person can check it's their house
//   otherwise     -> save as pending and text the phone; it is confirmed when
//                    the owner replies YES (see api/sms.js)
// Records are only shown to responders when that phone number asks for help.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const b = req.body || {};
  const phone = normalizePhone(b.phone);
  if (!phone || phone.length < 12) return res.status(400).json({ error: 'Enter a valid phone number.' });
  if (!b.consent) return res.status(400).json({ error: 'The owner must agree before their home is saved.' });

  let found;
  if (b.demo) {
    found = { ...parse(nearestSample(9.0579, 7.4951).code), distance_m: 4, confidence: 'demo' };
  } else if (b.lat !== '' && b.lng !== '' && Number.isFinite(Number(b.lat)) && Number.isFinite(Number(b.lng))) {
    found = await reverse(Number(b.lat), Number(b.lng));
  }
  if (!found) {
    return res.status(422).json({ error: 'No postcode was found at this spot. Stand right at the house, outside if you can, and try again.' });
  }
  const described = await describe(found);
  // A simulated demo location is not checked against NIPOST data.
  if (!b.demo && described.verified === false) {
    return res.status(422).json({ error: 'NIPOST says this is not an active postcode. Move closer to the house and try again.' });
  }
  if (b.preview) return res.status(200).json({ home: described });

  const home = {
    name: String(b.name || '').trim().slice(0, 80) || null,
    postcode: found.code,
    landmark: String(b.landmark || '').trim().slice(0, 200) || null,
    registeredBy: String(b.registeredBy || 'Owner').slice(0, 60),
    registeredAt: new Date().toISOString(),
    status: 'pending',
  };
  const sms =
    `FindMe: ${home.name || 'Someone'} wants to register your home (postcode ${found.display}) for emergencies. ` +
    'Only responders will see it. Reply YES to 112 to confirm, or NO to cancel.';
  try {
    await saveHome(phone, home);
    const sent = await sendSms(phone, sms);
    res.status(201).json({ home: { ...home, ...described }, phone, sms, sent });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not save. Please try again.' });
  }
}
