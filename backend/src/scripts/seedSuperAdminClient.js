/**
 * Firebase Client-Based Super-Administrator Seed Module
 *
 * Purpose:
 * Creates the initial EcoBantay super-administrator through Firebase REST endpoints
 * when a Firebase Admin service-account file is not available.
 *
 * How it works:
 * 1. Loads the Firebase web API key from the environment or administrator web configuration.
 * 2. Creates the configured Auth account or signs in when it already exists.
 * 3. Converts administrator values to the Firestore REST field representation.
 * 4. Creates or updates the authenticated administrator profile document.
 * 5. Prints setup details and exits with an error status if any stage fails.
 *
 * Technologies Used:
 * Firebase Identity Toolkit REST API, Cloud Firestore REST API, Node.js Fetch API,
 * Node.js File System API, Node.js Path API, and Node.js URL API.
 *
 * Why this implementation:
 * The REST-based alternative supports initial capstone setup without a service-account
 * key while still authenticating Firestore requests with a Firebase ID token.
 *
 * Prerequisite:
 * Publish EcoBantay/firestore.rules in Firebase Console before running
 * `node src/scripts/seedSuperAdminClient.js`.
 */
import { readFileSync, existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const email = process.env.SUPER_ADMIN_EMAIL || 'superadmin@gmail.com';
const password = process.env.SUPER_ADMIN_PASSWORD || '_Rover1231';
const fullName = process.env.SUPER_ADMIN_NAME || 'Super Admin';
const projectId = process.env.FIREBASE_PROJECT_ID || 'ecobantay-18061';

/**
 * Purpose:
 * Locates the Firebase web API key required by Identity Toolkit REST requests.
 *
 * How it works:
 * 1. Returns the dedicated backend environment value when present.
 * 2. Resolves the administrator web application's environment file.
 * 3. Reads the file and extracts its public Firebase API-key assignment.
 * 4. Throws an actionable configuration error when neither source is available.
 *
 * Technologies Used:
 * Node.js File System API, Node.js Path API, and JavaScript regular expressions.
 *
 * Why this implementation:
 * Supporting both sources reduces duplicate setup while preferring an explicit backend
 * environment variable for deployed or automated environments.
 */
function loadApiKey() {
  // Prefers the explicit process environment so deployments do not depend on another project folder.
  if (process.env.FIREBASE_API_KEY) return process.env.FIREBASE_API_KEY;

  const adminEnvPath = resolve(__dirname, '../../../admin-web/.env');
  // Reads the administrator app configuration only when the expected file exists.
  if (existsSync(adminEnvPath)) {
    const content = readFileSync(adminEnvPath, 'utf8');
    // Extracts and trims the public API-key value from the environment-file text.
    const match = content.match(/EXPO_PUBLIC_FIREBASE_API_KEY=(.+)/);
    if (match?.[1]) return match[1].trim();
  }

  // Stops the seed before any network work when authentication configuration is incomplete.
  throw new Error('Missing Firebase API key. Set FIREBASE_API_KEY or use admin-web/.env');
}

/**
 * Purpose:
 * Obtains an authenticated Firebase session for the configured super-administrator,
 * creating the identity when it does not yet exist.
 *
 * How it works:
 * 1. Sends the configured credentials to the Identity Toolkit sign-up endpoint.
 * 2. Returns the new account response when creation succeeds.
 * 3. Detects Firebase's existing-email response.
 * 4. Signs in through the password endpoint for an existing account.
 * 5. Returns token data or throws the Firebase REST error.
 *
 * Technologies Used:
 * Firebase Identity Toolkit REST API and Node.js Fetch API.
 *
 * Why this implementation:
 * The create-or-sign-in flow makes the seed repeatable and supplies the ID token required
 * to write the protected Firestore administrator document.
 */
async function signUpOrSignIn(apiKey) {
  // Performs the initial asynchronous Firebase Auth account-creation request.
  const signUpRes = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  // Parses Firebase's JSON response before branching on its HTTP success status.
  const signUpData = await signUpRes.json();

  // Returns the newly issued local ID and ID token when account creation succeeds.
  if (signUpRes.ok) {
    return signUpData;
  }

  // Reuses the configured identity when Firebase reports that its email already exists.
  if (signUpData.error?.message === 'EMAIL_EXISTS') {
    // Authenticates the existing account to obtain a fresh ID token for Firestore.
    const signInRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
      },
    );
    const signInData = await signInRes.json();
    // Converts a failed sign-in response into a clear seed failure.
    if (!signInRes.ok) {
      throw new Error(signInData.error?.message || 'Failed to sign in existing super admin.');
    }
    return signInData;
  }

  // Propagates account-creation errors other than the expected existing-email case.
  throw new Error(signUpData.error?.message || 'Failed to create super admin auth user.');
}

/**
 * Purpose:
 * Converts a JavaScript value into the typed string-field structure expected by the
 * Cloud Firestore REST document format.
 *
 * How it works:
 * 1. Receives a profile value.
 * 2. Wraps it under Firestore's `stringValue` type key.
 * 3. Returns the encoded field object for document assembly.
 *
 * Technologies Used:
 * Cloud Firestore REST API field format.
 *
 * Why this implementation:
 * A focused converter keeps repeated REST field encoding consistent and makes the
 * administrator document definition easier to audit.
 */
function toFirestoreString(value) {
  return { stringValue: value };
}

/**
 * Purpose:
 * Persists the configured super-administrator profile through an authenticated
 * Cloud Firestore REST request.
 *
 * How it works:
 * 1. Encodes profile values using Firestore's typed REST field format.
 * 2. Attempts to create the UID-keyed administrator document.
 * 3. Returns immediately when document creation succeeds.
 * 4. Distinguishes an existing document from other Firestore errors.
 * 5. Updates the existing document through PATCH when necessary.
 * 6. Throws an actionable error if creation or update fails.
 *
 * Technologies Used:
 * Cloud Firestore REST API and Node.js Fetch API.
 *
 * Why this implementation:
 * A create-then-update strategy keeps reruns idempotent while preserving a stable UID-based
 * administrator document required by backend authorization middleware.
 */
async function saveAdminProfile(apiKey, idToken, uid) {
  // Transforms seed values into the explicit typed representation required by Firestore REST.
  const fields = {
    uid: toFirestoreString(uid),
    email: toFirestoreString(email),
    fullName: toFirestoreString(fullName),
    username: toFirestoreString('superadmin'),
    role: toFirestoreString('super_admin'),
    status: toFirestoreString('active'),
    contactNumber: toFirestoreString(''),
    createdAt: toFirestoreString(new Date().toISOString()),
    createdBy: toFirestoreString('system'),
  };

  const createUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/admins?documentId=${uid}`;
  // Authenticates the asynchronous document-creation request with the Firebase ID token.
  const createRes = await fetch(createUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ fields }),
  });

  // Completes the persistence operation when the administrator document is newly created.
  if (createRes.ok) return;

  // Parses the Firestore error payload to decide whether an update fallback is appropriate.
  const createData = await createRes.json();
  // Normalizes status and message variants returned for an already-existing document.
  const alreadyExists = String(createData.error?.status || '').includes('ALREADY_EXISTS')
    || String(createData.error?.message || '').toLowerCase().includes('already exists');

  // Treats every create failure except an existing document as a terminal configuration/data error.
  if (!alreadyExists) {
    throw new Error(
      createData.error?.message ||
        'Failed to save admin profile. Publish firestore.rules in Firebase Console, then run this again.',
    );
  }

  // Falls back to PATCH so rerunning the seed refreshes an existing profile.
  const patchUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/admins/${uid}`;
  // Sends the same authenticated profile fields to the existing UID-keyed document.
  const patchRes = await fetch(patchUrl, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ fields }),
  });

  // Parses the update response so Firestore can provide a meaningful failure reason.
  const patchData = await patchRes.json();
  // Stops the seed when the existing profile cannot be refreshed.
  if (!patchRes.ok) {
    throw new Error(
      patchData.error?.message ||
        'Failed to update admin profile. Publish firestore.rules in Firebase Console, then run this again.',
    );
  }
}

/**
 * Purpose:
 * Coordinates the complete client-based super-administrator seeding workflow.
 *
 * How it works:
 * 1. Loads the Firebase API key and reports the target account.
 * 2. Creates or authenticates the configured Firebase user.
 * 3. Extracts the trusted UID and ID token from the Auth response.
 * 4. Saves the super-administrator profile through Firestore REST.
 * 5. Prints completion and login information for the setup operator.
 *
 * Technologies Used:
 * Firebase Identity Toolkit REST API, Cloud Firestore REST API, and Node.js.
 *
 * Why this implementation:
 * A single asynchronous coordinator keeps setup stages sequential, makes failures
 * observable, and leaves helper functions focused on one external-service concern.
 */
async function main() {
  const apiKey = loadApiKey();
  console.log(`Seeding super admin: ${email}`);

  // Waits for Firebase Authentication before using its UID and token for Firestore authorization.
  const authData = await signUpOrSignIn(apiKey);
  // Extracts the identifiers required to key and authorize the administrator profile write.
  const uid = authData.localId;
  const idToken = authData.idToken;

  console.log(`Auth UID: ${uid}`);
  // Persists the role profile only after the authenticated session has been established.
  await saveAdminProfile(apiKey, idToken, uid);

  console.log('Super admin ready.');
  console.log(`Email: ${email}`);
  console.log(`Password: ${password}`);
  console.log('Log in on the admin web with these credentials.');
}

// Executes the asynchronous seed and converts any rejected stage into a failed process exit.
main().catch((error) => {
  // Reports the most useful available error text for setup diagnosis.
  console.error(error.message || error);
  process.exit(1);
});
