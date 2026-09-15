import { auth, db } from '../firebaseAdmin.js';

export async function verifyUser(req, res, next) {
  // Provides one failure boundary for asynchronous Firebase token verification.
  try {
    // Authentication accepts only the conventional Bearer token header format.
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;

    // Stops unauthenticated access before protected route logic can execute.
    if (!token) {
      return res.status(401).json({ error: 'Missing authorization token.' });
    }

    // Firebase validates the token before its UID and email claims are trusted.
    const decoded = await auth.verifyIdToken(token);
    // Transforms verified claims into the minimal identity needed by downstream routes.
    req.user = { uid: decoded.uid, email: decoded.email || '' };
    next();
  } catch {
    // Uses a uniform response for invalid, malformed, and expired credentials.
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

export async function verifyUserOrAdmin(req, res, next) {
  // Contains asynchronous identity and role discovery within a controlled error response.
  try {
    // Authentication accepts only the conventional Bearer token header format.
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;

    // Rejects anonymous requests before accessing Firebase services.
    if (!token) {
      return res.status(401).json({ error: 'Missing authorization token.' });
    }

    // Verifies identity first so the UID used for profile lookup cannot be forged.
    const decoded = await auth.verifyIdToken(token);
    // Reads current administrative status from the server-owned Firestore collection.
    const adminDoc = await db.collection('admins').doc(decoded.uid).get();
    // Derives authorization state only from an existing, active administrator profile.
    const isAdmin = adminDoc.exists && adminDoc.data().status === 'active';

    // Normalizes citizen and administrator claims into one downstream request shape.
    req.user = { uid: decoded.uid, email: decoded.email || '', isAdmin };
    next();
  } catch {
    // Avoids exposing internal verification details for invalid or expired tokens.
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}
