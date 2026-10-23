import { createAlert, normalizePhone, summary } from '../lib/alerts.js';
import { saveHome } from '../lib/store.js';
import { isValid, parse } from '../lib/postcode.js';

// Africa's Talking incoming-SMS callback (from, to, text). Works on any phone,
// in English, Pidgin, Hausa, Yoruba or Igbo:
//   "HELP", "SOS", "TAIMAKO", "EGBA MI", "NYEM AKA"  -> alert
//   add FIRE / MEDICAL / ACCIDENT / ATTACK to say what kind
//   "HOME FC01A01KP27"                               -> save home postcode

const HELP_WORDS = ['HELP', 'SOS', 'TAIMAKO', 'EGBA MI', 'EGBAMI', 'NYEM AKA', 'NYEMAKA', 'EMERGENCY'];
const TYPE_WORDS = {
  attack: ['ATTACK', 'KIDNAP', 'GUN', 'BANDIT', 'THIEF', 'ROBBER'],
  fire: ['FIRE', 'WUTA', 'INA', 'OKU'],
  medical: ['MEDICAL', 'SICK', 'BLEED', 'PREGNANT', 'LABOUR', 'BABY'],
  accident: ['ACCIDENT', 'CRASH'],
};

function detectType(text) {
  const tokens = text.split(/[^A-Z]+/);
  for (const [type, words] of Object.entries(TYPE_WORDS)) {
    if (words.some((w) => tokens.includes(w))) return type;
  }
  return null;
}

export async function respond({ from, text, towerId }) {
  const t = String(text || '').toUpperCase().trim();

  if (t.startsWith('HOME')) {
    const p = parse(t.slice(4));
    if (!p) return 'FindMe: send HOME then your postcode, e.g. HOME FC01A01KP27';
    if ((await isValid(p.code)) === false) return `FindMe: ${p.display} was not found. Please check it.`;
    await saveHome(normalizePhone(from), { postcode: p.code, registeredBy: 'Self (SMS)', registeredAt: new Date().toISOString() });
    return `FindMe: home postcode ${p.display} saved.`;
  }

  const type = detectType(t);
  if (!type && !HELP_WORDS.some((w) => t.includes(w))) {
    return 'FindMe: to ask for help, send HELP (or TAIMAKO, EGBA MI, NYEM AKA).';
  }
  const alert = await createAlert({ source: 'sms', type: type || 'other', phone: from, towerId, note: text });
  return `FindMe: help is coming. Alert ${alert.id}. ${summary(alert)}. Stay safe.`;
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
