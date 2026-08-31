const functions = require('firebase-functions');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

if (!admin.apps.length) {
  admin.initializeApp();
}

const RESET_PAGE = 'https://ecobantay-18061.web.app/reset-password';
const VERCEL_LOGIN = 'https://capstone-ecru-kappa.vercel.app/';

async function sendResetEmail(to, link) {
  const subject = 'Reset your EcoBantay password';
  const text = [
    'Hello,',
    '',
    'Follow this link to reset your EcoBantay password:',
    link,
    '',
    "If you didn't ask to reset your password, you can ignore this email.",
    '',
    'Thanks,',
    'Your EcoBantay team',
  ].join('\n');
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #1d2b1e;">
      <h2 style="color: #145c1e;">EcoBantay password reset</h2>
      <p>Hello,</p>
      <p>Follow this link to reset your EcoBantay password:</p>
      <p><a href="${link}" style="color: #34733b; font-weight: 700;">Reset your password</a></p>
      <p style="word-break: break-all; font-size: 12px; color: #5c6b5d;">${link}</p>
      <p>If you didn't ask to reset your password, you can ignore this email.</p>
      <p>Thanks,<br/>Your EcoBantay team</p>
    </div>
  `;

  const resendKey = process.env.RESEND_API_KEY || '';
  if (resendKey) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || 'EcoBantay <onboarding@resend.dev>',
        to: [to],
        subject,
        html,
        text,
      }),
    });
    if (!response.ok) throw new Error(`Resend failed: ${await response.text()}`);
    return 'resend';
  }

  const user = process.env.GMAIL_USER || '';
  const pass = process.env.GMAIL_APP_PASSWORD || '';
  if (user && pass) {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
    });
    await transporter.sendMail({
      from: `EcoBantay <${user}>`,
      to,
      subject,
      html,
      text,
    });
    return 'gmail';
  }

  // Temporary delivery path (no SMTP keys configured yet).
  const response = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(to)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Origin: 'https://ecobantay-18061.web.app',
      Referer: 'https://ecobantay-18061.web.app/',
    },
    body: JSON.stringify({
      _subject: subject,
      _template: 'table',
      _captcha: 'false',
      message: text,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  const success = String(payload.success) === 'true';
  if (!response.ok || !success) {
    const detail = String(payload.message || `HTTP ${response.status}`);
    if (/activation/i.test(detail)) {
      throw new Error(
        'Check your inbox/spam for an email from FormSubmit titled "Activate Form", click Activate once, then request reset again.',
      );
    }
    throw new Error(`Email provider failed: ${detail}`);
  }
  return 'formsubmit';
}

exports.requestPasswordReset = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    res.status(400).json({ error: 'Valid email is required.' });
    return;
  }

  try {
    const firebaseLink = await admin.auth().generatePasswordResetLink(email, {
      url: VERCEL_LOGIN,
    });
    const oobCode = new URL(firebaseLink).searchParams.get('oobCode');
    if (!oobCode) throw new Error('Password reset code was not generated.');

    const customLink = `${RESET_PAGE}?mode=resetPassword&oobCode=${encodeURIComponent(oobCode)}`;
    const via = await sendResetEmail(email, customLink);
    res.status(200).json({ ok: true, via });
  } catch (error) {
    const code = String(error?.code || '');
    const message = String(error?.message || error);
    if (code.includes('user-not-found') || message.toLowerCase().includes('user-not-found')) {
      res.status(200).json({ ok: true });
      return;
    }
    console.error('requestPasswordReset failed', error);
    res.status(500).json({ error: message || 'Unable to send password reset email.' });
  }
});
