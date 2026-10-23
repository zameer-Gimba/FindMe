# FindMe

**Emergency alerts that arrive with an exact Nigerian postcode, from any phone.**

Built on NIPOST's National Digital Alphanumeric Postcode API. When someone is
attacked, kidnapped, injured or caught in a fire, responders get a postcode
they can act on, not a vague "somewhere near the market".

FindMe works for everyone:

| Who | How they ask for help | How we locate them |
| - | - | - |
| Smartphone user (city or village) | Tap the big **HELP** button | Phone GPS → postcode (reverse geocode) |
| Keypad phone, no data | Dial `*347*112#` and press 1–5 (or `*347*112*1#` in one go) | Cell tower from the network operator → postcode area |
| Keypad phone, SMS | Text `HELP`, `TAIMAKO`, `EGBA MI` or `NYEM AKA` | Cell tower → postcode area |
| Anyone, ahead of time | Save a home postcode once (USSD option 6 or SMS `HOME FC01A01KP27`), or have a family member, village head or health worker do it | Shown to responders on every alert |

Responders see every alert live on a map at `/dashboard`, with the postcode,
LGA and state, the caller's phone number and their saved home postcode.

## Pages

- `/`: smartphone HELP button (3-second countdown so it is never sent by accident)
- `/keypad`: keypad-phone simulator for USSD and SMS, with simulated cell towers in FCT, Zamfara, Borno and Kogi
- `/dashboard`: responder dashboard with map, sound alert and Respond/Resolve

## How it uses the Postcode API

- `GET /v1/search/reverse`: GPS → nearest postcode
- `GET /v1/lookup?level=1`: checks a saved home postcode is real (free, L1)
- `GET /v1/reference/states` and `/v1/reference/lgas`: state and LGA names from the code segments, so names show even on an L1 key
- Postcode segments (`FC-01-A01-…`) give a postcode *area* for tower-based locations

Without a key the app runs in **demo mode** on the public sandbox postcodes, so it can be shown anywhere.

## Run it locally

Needs Node.js 20 or newer.

```bash
npm install
cp .env.example .env   # optional: add POSTCODE_API_KEY
npm run dev            # http://localhost:3000
```

## Deploy to Netlify (free)

1. On Netlify: **Add new project → Import an existing project → GitHub** and pick this repo.
   The settings come from `netlify.toml`, so leave the build command empty and click **Deploy**.
2. **Project configuration → Environment variables**: add `POSTCODE_API_KEY` (your NIPOST *secret* key), then redeploy.

Alerts are stored in Netlify Blobs, which is built in and free, so there's nothing else to set up.

## Real USSD and SMS (optional)

With an [Africa's Talking](https://africastalking.com) sandbox account:

- USSD callback URL: `https://YOUR-SITE.netlify.app/api/ussd`
- Incoming SMS callback URL: `https://YOUR-SITE.netlify.app/api/sms`
- Set `AT_USERNAME=sandbox` and `AT_API_KEY` to send SMS replies.

Africa's Talking does not send the caller's tower, so real calls use `DEFAULT_TOWER`.
In production the network operator would supply it.

## Roadmap

- **Network operator partnership (MTN, Airtel, Glo, 9mobile), approved by the NCC**: real cell-tower location for keypad phones
- **Live postcode data** for every state, starting with Zamfara, Borno and Kogi
- **Android app** with a hidden trigger (press the volume button 3 times) that works with the screen locked
- Voice menu in Hausa, Yoruba, Igbo and Pidgin for people who cannot read
- Hand-off to police, NSCDC, fire service, hospitals and the 112 centres by postcode area

## Project layout

```
api/        Request handlers (alert, alerts, ussd, sms, towers)
netlify/    Netlify function that routes /api/* to the handlers
lib/        Postcode API client, alert logic, storage, simulated towers
public/     The three pages (plain HTML, CSS and JavaScript)
dev-server.js  Local stand-in for Netlify
```
