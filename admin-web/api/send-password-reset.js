/**
 * Admin forgot-password → EcoBantay custom reset UI (not Firebase default page).
 * Proxies to the Cloud Function that emails a link to /reset-password on Hosting.
 */
module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.end('');
    return;
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Allow', 'POST');
    res.end('Method not allowed');
    return;
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }

  const email = String(body?.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: 'Valid email is required.' }));
    return;
  }

  try {
    const upstream = await fetch(
      'https://us-central1-ecobantay-18061.cloudfunctions.net/requestPasswordReset',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      },
    );
    const text = await upstream.text();
    res.statusCode = upstream.status;
    res.end(text || JSON.stringify({ ok: upstream.ok }));
  } catch (error) {
    res.statusCode = 500;
    res.end(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unable to send password reset email.',
      }),
    );
  }
};
