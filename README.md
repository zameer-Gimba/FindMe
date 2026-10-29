# FindMe

Live prototype: **https://findme-psi-three.vercel.app**

**Emergency alerts that arrive with an exact Nigerian postcode, from any phone.**

Built on NIPOST's National Digital Alphanumeric Postcode API. When someone is
attacked, kidnapped, injured or caught in a fire, responders get a postcode
they can act on, not a vague "somewhere near the market".

FindMe works for everyone:

| Who | How they ask for help | How we locate them |
| - | - | - |
| Smartphone user (city or village) | Tap the big **HELP** button | Phone GPS → postcode (reverse geocode) |
| Keypad phone, no data | Dial `*347*112#` and choose 1–5, or add the number to go at once (`*347*112*2#` = fire) | Cell tower from the network operator → postcode area |
| Keypad phone, SMS | Text `HELP`, `TAIMAKO`, `EGBA MI` or `NYEM AKA` to **112** (free), then reply 1–5 for the kind of emergency | Cell tower → postcode area |
| Anyone, ahead of time | A family member, ward head, health worker or NIPOST agent stands at the house and registers it at `/register`. GPS finds the postcode, so nobody needs to know it. The phone gets an SMS and replies YES to confirm | Home postcode and directions shown to responders, only when that number sends an alert |

Responders see every alert live on a map at `/dashboard`: the kind of emergency,
postcode, LGA and state, who is calling (registered or unknown) and, for
registered callers, their home postcode and directions.

## Pages

- `/`: smartphone HELP button (3-second countdown so it is never sent by accident)
- `/keypad`: keypad-phone simulator for USSD and SMS, with simulated cell towers in FCT, Zamfara, Borno and Kogi
- `/register`: register a home for emergencies from GPS: check it's the right house, then the phone confirms by replying YES to an SMS
- `/dashboard`: responder dashboard with map, sound alert and Respond/Resolve
- `/privacy`: privacy notice under the Nigeria Data Protection Act 2023

## How it uses the Postcode API

- `GET /v1/search/reverse`: GPS → nearest postcode
- `GET /v1/lookup?level=1`: validates every postcode before a home is saved and on every alert (alert and home), shown as "✓ NIPOST verified" on the dashboard
- `GET /v1/reference/states` and `/v1/reference/lgas`: state and LGA names from the code segments, so names show even on an L1 key
- Postcode segments (`FC-01-A01-…`) give a postcode *area* for tower-based locations

Without a key the app runs in **demo mode** on the public sandbox postcodes, so it can be shown anywhere.

## Data protection (NDPA 2023)

- Home registration needs explicit consent (tick box linked to the privacy notice) **and** a YES reply by SMS from the phone itself
- Text `DELETE` to 112 to erase your home record and your details on past alerts
- Alerts are deleted after 30 days; unconfirmed registrations after 7 days
- NIPOST's API only receives coordinates, never names or phone numbers
- The prototype dashboard is open for evaluation, so only test data should be used

## Run it locally

Needs Node.js 20 or newer.

```bash
npm install
cp .env.example .env   # optional: add POSTCODE_API_KEY
npm run dev            # http://localhost:3000
```

## Deploy to Vercel (free)

1. On Vercel: **Add New → Project**, import this repo from GitHub. Framework preset: **Other**. Leave the build command empty; `vercel.json` serves `public/` and turns `api/` into functions.
2. **Storage → Create → Upstash for Redis** (free), and connect it to the project. This adds `KV_REST_API_URL` and `KV_REST_API_TOKEN`, so every alert reaches the dashboard.
3. **Settings → Environment Variables**: add `POSTCODE_API_KEY` (your NIPOST *secret* key).
4. Redeploy, then open `/api/health`: it should show `"storage": "upstash-redis"`.

## Deploy to Netlify (alternative)

Import the repo on Netlify; `netlify.toml` does the rest. Alerts are stored in Netlify Blobs automatically. Add `POSTCODE_API_KEY` under **Project configuration → Environment variables** and redeploy.

## Real USSD and SMS (optional)

With an [Africa's Talking](https://africastalking.com) sandbox account:

- USSD callback URL: `https://findme-psi-three.vercel.app/api/ussd`
- Incoming SMS callback URL: `https://findme-psi-three.vercel.app/api/sms`
- Set `AT_USERNAME=sandbox` and `AT_API_KEY` to send SMS replies.

Africa's Talking does not send the caller's tower, so real calls use `DEFAULT_TOWER`.
In production the network operator would supply it.

## Roadmap

- **Network operator partnership (MTN, Airtel, Glo, 9mobile), approved by the NCC**: real cell-tower location for keypad phones, and the free SMS short code 112
- **Live postcode data** for every state, starting with Zamfara, Borno and Kogi
- **Android app** with a hidden trigger (press the volume button 3 times) that works with the screen locked
- Voice menu in Hausa, Yoruba, Igbo and Pidgin for people who cannot read
- Responder dashboard behind agency login (police, NSCDC, fire service), so registered homes stay private
- Hand-off to police, NSCDC, fire service, hospitals and the 112 centres by postcode area

## Project layout

```
api/        Request handlers, also Vercel functions (alert, alerts, health, register, ussd, sms, towers)
netlify/    Netlify function that routes /api/* to the same handlers
lib/        Postcode API client, alert logic, storage, simulated towers
public/     The pages (plain HTML, CSS and JavaScript)
dev-server.js  Local stand-in for Vercel/Netlify
```
