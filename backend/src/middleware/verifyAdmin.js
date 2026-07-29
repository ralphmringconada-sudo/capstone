/**
 * Administrator Authorization Middleware Module
 *
 * Purpose:
 * Supplies reusable Express guards for active administrator and super-administrator routes.
 *
 * How it works:
 * 1. Accepts protected requests from Express routes.
 * 2. Verifies Firebase bearer-token identities.
 * 3. Reads current role and status records from Firestore.
 * 4. Attaches trusted administrator context or returns an access error.
 *
 * Technologies Used:
 * Express middleware conventions, Firebase Admin Authentication, and Cloud Firestore.
 *
 * Why this implementation:
 * Shared middleware applies one server-controlled authorization policy consistently across
 * sensitive EcoBantay endpoints.
 */
import { auth, db } from '../firebaseAdmin.js';

/**
 * Purpose:
 * Protects high-privilege Express routes so only authenticated, active EcoBantay
 * administrators with the `super_admin` role can continue.
 *
 * How it works:
 * 1. Extracts the bearer token from the HTTP Authorization header.
 * 2. Rejects requests that do not provide a token.
 * 3. Verifies the token with Firebase Authentication.
 * 4. Retrieves the matching administrator profile from Firestore.
 * 5. Checks that the account is active and has the super-admin role.
 * 6. Attaches verified administrator data to the request and calls the next middleware.
 *
 * Technologies Used:
 * Express middleware conventions, Firebase Admin Authentication, and Cloud Firestore.
 *
 * Why this implementation:
 * Token verification proves identity, while the Firestore profile provides current
 * role and status information that can be changed without issuing a new token.
 */
export async function verifySuperAdmin(req, res, next) {
  // Contains all asynchronous identity and database checks so failures become a safe 401 response.
  try {
    // Authentication begins by accepting only the standard Bearer token format.
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;

    // Rejects unauthenticated requests before any privileged Firebase lookup occurs.
    if (!token) {
      return res.status(401).json({ error: 'Missing authorization token.' });
    }

    // Firebase Auth validates token integrity and expiry before revealing the caller UID.
    const decoded = await auth.verifyIdToken(token);
    // Firestore supplies the latest server-controlled role and account status.
    const adminDoc = await db.collection('admins').doc(decoded.uid).get();

    // A valid Firebase user is not automatically an EcoBantay administrator.
    if (!adminDoc.exists) {
      return res.status(403).json({ error: 'Admin account not found.' });
    }

    // Converts the verified snapshot into authorization data for subsequent checks.
    const adminData = adminDoc.data();
    // Disabled administrators must lose backend access even if their token remains valid.
    if (adminData.status !== 'active') {
      return res.status(403).json({ error: 'Admin account is inactive.' });
    }

    // Limits sensitive administrator-management actions to the highest assigned role.
    if (adminData.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only super admins can perform this action.' });
    }

    // Makes the trusted identity available to downstream route handlers and audit logs.
    req.admin = { uid: decoded.uid, ...adminData };
    next();
  } catch (error) {
    // Prevents token-verification details from leaking while returning a clear authentication result.
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

/**
 * Purpose:
 * Protects general administrator routes by requiring a verified Firebase identity
 * with a corresponding active administrator profile.
 *
 * How it works:
 * 1. Reads and parses the bearer token from the request header.
 * 2. Stops requests that do not include authentication.
 * 3. Verifies the token through Firebase Authentication.
 * 4. Loads the administrator record from Firestore.
 * 5. Rejects missing or inactive administrator profiles.
 * 6. Adds trusted administrator context to the request and continues the pipeline.
 *
 * Technologies Used:
 * Express middleware conventions, Firebase Admin Authentication, and Cloud Firestore.
 *
 * Why this implementation:
 * Combining Firebase identity verification with a live Firestore status check supports
 * immediate administrative deactivation and reusable route-level authorization.
 */
export async function verifyAdmin(req, res, next) {
  // Wraps asynchronous authentication and profile access in one controlled failure boundary.
  try {
    // Authentication begins by accepting only the standard Bearer token format.
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;

    // Rejects missing credentials before querying any administrative information.
    if (!token) {
      return res.status(401).json({ error: 'Missing authorization token.' });
    }

    // Verifies token authenticity and obtains the Firebase UID used as the document key.
    const decoded = await auth.verifyIdToken(token);
    // Reads the current administrator profile rather than trusting client-supplied role data.
    const adminDoc = await db.collection('admins').doc(decoded.uid).get();

    // Denies ordinary Firebase accounts that have no administrator profile.
    if (!adminDoc.exists) {
      return res.status(403).json({ error: 'Admin account not found.' });
    }

    // Transforms the Firestore snapshot into data used by authorization and downstream routes.
    const adminData = adminDoc.data();
    // Enforces immediate access revocation for administrators marked inactive.
    if (adminData.status !== 'active') {
      return res.status(403).json({ error: 'Admin account is inactive.' });
    }

    // Shares only server-verified administrator context with the protected handler.
    req.admin = { uid: decoded.uid, ...adminData };
    next();
  } catch (error) {
    // Treats malformed, expired, and unverifiable tokens as authentication failures.
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}
