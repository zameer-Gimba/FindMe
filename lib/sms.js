// Sends an SMS through Africa's Talking when AT_USERNAME and AT_API_KEY are set.
// Without them (the demo), messages are only shown in the keypad simulator.
export async function sendSms(to, message) {
  const { AT_USERNAME, AT_API_KEY } = process.env;
  if (!AT_USERNAME || !AT_API_KEY || !to) return false;
  const host = AT_USERNAME === 'sandbox' ? 'api.sandbox.africastalking.com' : 'api.africastalking.com';
  try {
    const res = await fetch(`https://${host}/version1/messaging`, {
      method: 'POST',
      headers: { apiKey: AT_API_KEY, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username: AT_USERNAME, to, message }),
    });
    return res.ok;
  } catch (e) {
    console.error('SMS failed:', e.message);
    return false;
  }
}
