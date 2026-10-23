import { createAlert } from '../lib/alerts.js';

// Africa's Talking USSD callback. It posts sessionId, serviceCode, phoneNumber
// and text (all answers so far joined by "*"); we reply with "CON ..." to keep
// the session open or "END ..." to close it. Dialling *CODE*1# jumps straight
// to option 1. towerId is only sent by our simulator: in production the
// network operator supplies the caller's tower.

const MENU = ['attack', 'fire', 'medical', 'accident', 'other'];

const MAIN =
  'CON FindMe Emergency\n' +
  '1. Attack / Kidnap\n' +
  '2. Fire\n' +
  '3. Medical\n' +
  '4. Accident\n' +
  '5. Other';

export async function respond({ phoneNumber, text, towerId }) {
  const parts = String(text || '').split('*').filter((p) => p !== '');
  const choice = parts[0];

  if (!choice) return MAIN;

  const n = Number(choice);
  if (n >= 1 && n <= 5) {
    const alert = await createAlert({ source: 'ussd', type: MENU[n - 1], phone: phoneNumber, towerId });
    return `END HELP IS COMING.\nAlert ${alert.id} sent with your location.\nStay safe. Keep your phone on.`;
  }

  return 'END Invalid choice. Dial again.';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('POST only');
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  try {
    res.status(200).send(await respond(req.body || {}));
  } catch (e) {
    console.error(e);
    res.status(200).send('END Network busy. Please dial again.');
  }
}
