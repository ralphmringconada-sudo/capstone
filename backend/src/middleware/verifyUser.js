/**
 * User Authentication Middleware Module
 *
 * Purpose:
 * Provides reusable Express authentication for citizen-only and shared citizen/admin routes.
 *
 * How it works:
 * 1. Receives protected requests from feature routers.
 * 2. Verifies Firebase bearer tokens.
 * 3. Optionally checks active administrator status in Firestore.
 * 4. Attaches a trusted, normalized caller identity for downstream authorization.
 *
 * Technologies Used:
 * Express middleware conventions, Firebase Admin Authentication, and Cloud Firestore.
 *
 * Why this implementation:
 * Centralized identity handling prevents feature routes from trusting caller-supplied UIDs
 * and supports consistent access decisions for shared report resources.
 */
import { auth, db } from '../firebaseAdmin.js';

/**
 * Purpose:
 * Authenticates an EcoBantay citizen request and supplies a trusted Firebase identity
 * to the route handlers that follow this middleware.
 *
 * How it works:
 * 1. Extracts a bearer token from the Authorization header.
 * 2. Rejects requests with no usable token.
 * 3. Verifies token validity and expiry through Firebase Authentication.
 * 4. Builds a minimal request identity from verified token claims.
 * 5. Continues to the protected Express route.
 *
 * Technologies Used:
 * Express middleware conventions and Firebase Admin Authentication.
 *
 * Why this implementation:
 * Centralized token verification keeps citizen routes consistent and prevents handlers
 * from trusting user identifiers or email addresses supplied in request bodies.
 */
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

/**
 * Purpose:
 * Authenticates either a citizen or administrator and identifies whether the verified
 * caller has an active EcoBantay administrator profile.
 *
 * How it works:
 * 1. Reads the bearer token from the Authorization header.
 * 2. Rejects requests that have no token.
 * 3. Verifies the token with Firebase Authentication.
 * 4. Queries Firestore for an administrator profile using the verified UID.
 * 5. Derives an administrator flag from profile existence and active status.
 * 6. Attaches the unified identity to the request and continues.
 *
 * Technologies Used:
 * Express middleware conventions, Firebase Admin Authentication, and Cloud Firestore.
 *
 * Why this implementation:
 * Shared report resources serve both citizens and administrators; a single middleware
 * authenticates both groups while retaining server-controlled authorization information.
 */
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
