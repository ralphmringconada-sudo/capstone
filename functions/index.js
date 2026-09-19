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

exports.issueGoogleLinkToken = functions.https.onRequest(async (req, res) => {
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

  const idToken = String(req.body?.idToken || '').trim();
  if (!idToken) {
    res.status(400).json({ error: 'Google sign-in token is required.' });
    return;
  }

  try {
    const tokenResponse = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
    );
    const payload = (await tokenResponse.json().catch(() => ({}))) || {};
    if (!tokenResponse.ok || !payload.email) {
      res.status(401).json({ error: 'Google sign-in could not be verified. Try again.' });
      return;
    }

    const verified = payload.email_verified === true || payload.email_verified === 'true';
    if (!verified) {
      res.status(403).json({ error: 'This Google email is not verified.' });
      return;
    }

    const email = String(payload.email).trim().toLowerCase();
    const snapshot = await admin.firestore().collection('users').where('email', '==', email).limit(1).get();
    if (snapshot.empty) {
      res.status(404).json({ error: 'Account does not exist. Please sign up first.' });
      return;
    }

    const uid = snapshot.docs[0].id;
    const userRecord = await admin.auth().getUser(uid);
    if (!userRecord.emailVerified) {
      res.status(403).json({
        error: 'Please verify your email before signing in with Google.',
      });
      return;
    }

    const token = await admin.auth().createCustomToken(uid);
    res.status(200).json({ token });
  } catch (error) {
    console.error('issueGoogleLinkToken failed', error);
    res.status(500).json({ error: 'Unable to complete Google sign-in for this email.' });
  }

  
});

exports.deleteUserAccount = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set(
    'Access-Control-Allow-Headers',
    'Authorization, Content-Type',
  );

  // Handle browser preflight request.
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  // Delete requests from the admin web use POST.
  if (req.method !== 'POST') {
    res.status(405).json({
      error: 'Method not allowed.',
    });
    return;
  }

  try {
    // ---------------------------------------------------------
    // 1. Get and verify the Firebase ID token.
    // ---------------------------------------------------------
    const authorization = String(
      req.headers.authorization || '',
    );

    const match = authorization.match(
      /^Bearer\s+(.+)$/i,
    );

    if (!match) {
      res.status(401).json({
        error: 'Missing authorization token.',
      });
      return;
    }

    const decoded = await admin
      .auth()
      .verifyIdToken(match[1], true);

    const db = admin.firestore();

    // ---------------------------------------------------------
    // 2. Verify that the caller is a Super Admin.
    // ---------------------------------------------------------
    const actorRef = db
      .collection('admins')
      .doc(decoded.uid);

    const actorSnap = await actorRef.get();

    if (!actorSnap.exists) {
      res.status(403).json({
        error: 'Administrator profile not found.',
      });
      return;
    }

    const actor = actorSnap.data() || {};

    if (actor.role !== 'super_admin') {
      res.status(403).json({
        error:
          'Only the Super Admin can delete accounts.',
      });
      return;
    }

    // ---------------------------------------------------------
    // 3. Read the target account UID.
    // ---------------------------------------------------------
    let body = req.body;

    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        body = {};
      }
    }

    const userId = String(
      body?.userId || '',
    ).trim();

    if (!userId) {
      res.status(400).json({
        error: 'User ID is required.',
      });
      return;
    }

    // Prevent the signed-in Super Admin from deleting themself.
    if (userId === decoded.uid) {
      res.status(400).json({
        error:
          'You cannot delete your own Super Admin account.',
      });
      return;
    }

    // ---------------------------------------------------------
    // 4. Check whether it is a citizen or admin account.
    // ---------------------------------------------------------
    const userRef = db
      .collection('users')
      .doc(userId);

    const adminRef = db
      .collection('admins')
      .doc(userId);

    const [userSnap, adminSnap] =
      await Promise.all([
        userRef.get(),
        adminRef.get(),
      ]);

    if (
      !userSnap.exists &&
      !adminSnap.exists
    ) {
      res.status(404).json({
        error: 'Account not found.',
      });
      return;
    }

    const accountType = adminSnap.exists
      ? 'admin'
      : 'user';

    const targetData = adminSnap.exists
      ? adminSnap.data() || {}
      : userSnap.data() || {};

    // Never allow another Super Admin account to be deleted.
    if (
      accountType === 'admin' &&
      targetData.role === 'super_admin'
    ) {
      res.status(403).json({
        error:
          'The Super Admin account cannot be deleted.',
      });
      return;
    }

    // ---------------------------------------------------------
    // 5. Build a readable name for the audit log.
    // ---------------------------------------------------------
    const targetName =
      accountType === 'admin'
        ? String(
            targetData.fullName ||
              targetData.email ||
              userId,
          )
        : `${String(
            targetData.firstName || '',
          ).trim()} ${String(
            targetData.lastName || '',
          ).trim()}`
            .trim() ||
          String(
            targetData.email || userId,
          );

    // ---------------------------------------------------------
    // 6. Delete the account from Firebase Authentication.
    // ---------------------------------------------------------
    try {
      await admin
        .auth()
        .deleteUser(userId);
    } catch (error) {
      // Continue if the Authentication account
      // was already removed.
      if (
        error?.code !==
        'auth/user-not-found'
      ) {
        throw error;
      }
    }

    // ---------------------------------------------------------
    // 7. Delete the Firestore account.
    // ---------------------------------------------------------
    const batch = db.batch();

    // Citizen account.
    if (userSnap.exists) {
      batch.delete(userRef);
    }

    // Administrator account.
    if (adminSnap.exists) {
      batch.delete(adminRef);

      // Remove the administrator username lookup document.
      const username = String(
        targetData.username || '',
      )
        .trim()
        .toLowerCase()
        .replace(/^@+/, '');

      if (username) {
        const usernameRef = db
          .collection('admin_usernames')
          .doc(username);

        batch.delete(usernameRef);
      }
    }

    // ---------------------------------------------------------
    // 8. Record the deletion in admin activity history.
    // ---------------------------------------------------------
    const activityRef = db
      .collection('admin_activity_logs')
      .doc();

    batch.set(activityRef, {
      adminUid: decoded.uid,

      adminName: String(
        actor.fullName ||
          actor.email ||
          decoded.email ||
          'Super Admin',
      ),

      action:
        accountType === 'admin'
          ? 'Deleted Admin Account'
          : 'Deleted User Account',

      module: 'Users',

      recordId: userId,

      details:
        `Permanently deleted ${accountType} account "${targetName}"`,

      createdAt: new Date().toISOString(),

      deletedAccountType: accountType,

      deletedAccountName: targetName,

      deletedAccountEmail: String(
        targetData.email || '',
      ),
    });

    await batch.commit();

    // ---------------------------------------------------------
    // 9. Return success to the admin dashboard.
    // ---------------------------------------------------------
    res.status(200).json({
      ok: true,
      userId,
      accountType,
      message:
        'Account deleted successfully.',
    });
  } catch (error) {
    console.error(
      'deleteUserAccount failed:',
      error,
    );

    const code = String(
      error?.code || '',
    );

    if (
      code.includes('id-token') ||
      code === 'auth/id-token-revoked'
    ) {
      res.status(401).json({
        error:
          'Invalid or expired administrator session.',
      });
      return;
    }

    res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : 'Failed to delete account.',
    });
  }
});

exports.setAccountFlag = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set(
    'Access-Control-Allow-Headers',
    'Authorization, Content-Type',
  );

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({
      error: 'Method not allowed.',
    });
    return;
  }

  try {
    const authorization = String(
      req.headers.authorization || '',
    );

    const match = authorization.match(
      /^Bearer\s+(.+)$/i,
    );

    if (!match) {
      res.status(401).json({
        error: 'Missing authorization token.',
      });
      return;
    }

    const decoded = await admin
      .auth()
      .verifyIdToken(match[1], true);

    const db = admin.firestore();

    const actorRef = db
      .collection('admins')
      .doc(decoded.uid);

    const actorSnap = await actorRef.get();

    if (!actorSnap.exists) {
      res.status(403).json({
        error: 'Administrator profile not found.',
      });
      return;
    }

    const actor = actorSnap.data() || {};
    const actorRole = String(actor.role || '');

    if (
      actorRole !== 'admin' &&
      actorRole !== 'super_admin'
    ) {
      res.status(403).json({
        error: 'Administrator access is required.',
      });
      return;
    }

    let body = req.body;

    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        body = {};
      }
    }

    const accountId = String(
      body?.accountId || '',
    ).trim();

    const accountType = String(
      body?.accountType || '',
    ).trim();

    const isFlagged = body?.isFlagged === true;

    if (!accountId) {
      res.status(400).json({
        error: 'Account ID is required.',
      });
      return;
    }

    if (
      accountType !== 'user' &&
      accountType !== 'admin'
    ) {
      res.status(400).json({
        error: 'Invalid account type.',
      });
      return;
    }

    if (
      accountType === 'admin' &&
      actorRole !== 'super_admin'
    ) {
      res.status(403).json({
        error:
          'Only the Super Admin can flag administrator accounts.',
      });
      return;
    }

    const collectionName =
      accountType === 'admin'
        ? 'admins'
        : 'users';

    const accountRef = db
      .collection(collectionName)
      .doc(accountId);

    const accountSnap = await accountRef.get();

    if (!accountSnap.exists) {
      res.status(404).json({
        error: 'Account not found.',
      });
      return;
    }

    const accountData = accountSnap.data() || {};

    if (
      accountType === 'admin' &&
      accountData.role === 'super_admin'
    ) {
      res.status(403).json({
        error:
          'The Super Admin account cannot be flagged.',
      });
      return;
    }

    const now = new Date().toISOString();

    const batch = db.batch();

    batch.update(accountRef, {
      isFlagged,
      flaggedAt: isFlagged ? now : null,
      flaggedBy: isFlagged ? decoded.uid : null,
      updatedAt: now,
    });

    const activityRef = db
      .collection('admin_activity_logs')
      .doc();

    batch.set(activityRef, {
      adminUid: decoded.uid,

      adminName: String(
        actor.fullName ||
          actor.email ||
          decoded.email ||
          'Administrator',
      ),

      action: isFlagged
        ? 'Flagged Account'
        : 'Unflagged Account',

      module: 'Users',

      recordId: accountId,

      details: `${
        isFlagged ? 'Flagged' : 'Unflagged'
      } ${accountType} account`,

      createdAt: now,
    });

    await batch.commit();

    res.status(200).json({
      ok: true,
      accountId,
      accountType,
      isFlagged,
      message: isFlagged
        ? 'Account flagged successfully.'
        : 'Account unflagged successfully.',
    });
  } catch (error) {
    console.error(
      'setAccountFlag failed:',
      error,
    );

    const code = String(
      error?.code || '',
    );

    if (
      code.includes('id-token') ||
      code === 'auth/id-token-revoked'
    ) {
      res.status(401).json({
        error:
          'Invalid or expired administrator session.',
      });
      return;
    }

    res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : 'Failed to update account flag.',
    });
  }
});
