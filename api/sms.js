import { createAlert, normalizePhone, summary, TYPES } from '../lib/alerts.js';
import { listAlerts, updateAlert } from '../lib/store.js';

// Africa's Talking incoming-SMS callback (from, to, text). People text the
// free short code 112 from any phone, in English, Pidgin, Hausa, Yoruba or Igbo:
//   "HELP", "SOS", "TAIMAKO", "EGBA MI", "NYEM AKA"  -> alert
//   add FIRE / MEDICAL / ACCIDENT / ATTACK to say what kind, or
//   reply with 1–5 afterwards to set the kind of emergency.

const HELP_WORDS = ['HELP', 'SOS', 'TAIMAKO', 'EGBA MI', 'EGBAMI', 'NYEM AKA', 'NYEMAKA', 'EMERGENCY'];
const TYPE_WORDS = {
  attack: ['ATTACK', 'KIDNAP', 'GUN', 'BANDIT', 'BANDITS', 'THIEF', 'ROBBER', 'ROBBERS'],
  fire: ['FIRE', 'WUTA', 'INA', 'OKU'],
  medical: ['MEDICAL', 'SICK', 'BLEED', 'BLEEDING', 'PREGNANT', 'LABOUR', 'BABY'],
  accident: ['ACCIDENT', 'CRASH'],
};
const BY_NUMBER = ['attack', 'fire', 'medical', 'accident', 'other'];
const ASK_TYPE = 'Reply 1 Attack/Kidnap, 2 Fire, 3 Medical, 4 Accident, 5 Other.';
const FOLLOW_UP_MS = 30 * 60 * 1000;

function detectType(text) {
  const tokens = text.split(/[^A-Z]+/);
  for (const [type, words] of Object.entries(TYPE_WORDS)) {
    if (words.some((w) => tokens.includes(w))) return type;
  }
  return null;
}

export async function respond({ from, text, towerId }) {
  const t = String(text || '').toUpperCase().trim();

  // A lone number right after an alert says what kind of emergency it is.
  if (/^[1-5]$/.test(t)) {
    const phone = normalizePhone(from);
    const recent = (await listAlerts()).find(
      (a) => a.phone === phone && Date.now() - Date.parse(a.createdAt) < FOLLOW_UP_MS,
    );
    if (recent) {
      const type = BY_NUMBER[Number(t) - 1];
      await updateAlert(recent.id, { type, typeLabel: TYPES[type] });
      return `FindMe: alert ${recent.id} updated to ${TYPES[type]}. Help is coming.`;
    }
  }

  const type = detectType(t);
  if (!type && !HELP_WORDS.some((w) => t.includes(w))) {
    return 'FindMe: to ask for help, send HELP (or TAIMAKO, EGBA MI, NYEM AKA) to 112.';
  }
  const alert = await createAlert({ source: 'sms', type: type || 'unknown', phone: from, towerId, note: text });
  const reply = `FindMe: help is coming. Alert ${alert.id}. ${summary(alert)}.`;
  return type ? `${reply} Stay safe.` : `${reply} ${ASK_TYPE}`;
}

// Optional: reply by SMS when Africa's Talking credentials are configured.
async function sendSms(to, message) {
  const { AT_USERNAME, AT_API_KEY } = process.env;
  if (!AT_USERNAME || !AT_API_KEY || !to) return;
  const host = AT_USERNAME === 'sandbox' ? 'api.sandbox.africastalking.com' : 'api.africastalking.com';
  await fetch(`https://${host}/version1/messaging`, {
    method: 'POST',
    headers: { apiKey: AT_API_KEY, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username: AT_USERNAME, to, message }),
  }).catch((e) => console.error('SMS reply failed:', e.message));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const b = req.body || {};
    const reply = await respond(b);
    await sendSms(b.from, reply);
    res.status(200).json({ reply });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not process SMS' });
  }
}
