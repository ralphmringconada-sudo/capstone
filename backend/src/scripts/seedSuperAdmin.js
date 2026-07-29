/**
 * Firebase Admin Super-Administrator Seed Module
 *
 * Purpose:
 * Provides a repeatable setup script for the initial EcoBantay super-administrator.
 *
 * How it works:
 * 1. Loads seed identity values from environment configuration.
 * 2. Uses Firebase Admin Authentication to create or refresh the privileged identity.
 * 3. Builds and merges the matching authorization profile in Firestore.
 * 4. Reports completion and exits with a success or failure process status.
 *
 * Technologies Used:
 * Firebase Admin Authentication, Cloud Firestore, dotenv, and Node.js.
 *
 * Why this implementation:
 * A dedicated trusted seed creates the first authorization anchor without exposing
 * privileged account creation through an unauthenticated public endpoint.
 */
import dotenv from 'dotenv';
import { auth, db } from '../firebaseAdmin.js';

dotenv.config();

const email = process.env.SUPER_ADMIN_EMAIL || 'superadmin@gmail.com';
const password = process.env.SUPER_ADMIN_PASSWORD || '_Rover1231';
const fullName = process.env.SUPER_ADMIN_NAME || 'Super Admin';

/**
 * Purpose:
 * Creates or refreshes the initial EcoBantay super-administrator identity and profile
 * by using trusted Firebase Admin services.
 *
 * How it works:
 * 1. Searches Firebase Authentication for the configured email address.
 * 2. Updates the existing identity or creates one when no account is found.
 * 3. Builds the required super-administrator profile and authorization fields.
 * 4. Merges the profile into the matching Firestore administrator document.
 * 5. Prints operational confirmation for the person running the seed.
 *
 * Technologies Used:
 * Firebase Admin Authentication, Cloud Firestore, dotenv, and Node.js.
 *
 * Why this implementation:
 * An idempotent seed supports repeatable capstone setup while keeping credentials in
 * Firebase Authentication and application roles in the Firestore data model.
 */
async function seedSuperAdmin() {
  let userRecord;
  // Attempts asynchronous identity reuse so repeated seed runs remain idempotent.
  try {
    // Retrieves and refreshes the existing Firebase Auth account with configured values.
    userRecord = await auth.getUserByEmail(email);
    await auth.updateUser(userRecord.uid, {
      password,
      displayName: fullName,
    });
    console.log(`Updated Firebase Auth user for ${email}`);
  } catch {
    // Creates the privileged Firebase Auth identity when no reusable account is available.
    userRecord = await auth.createUser({
      email,
      password,
      displayName: fullName,
    });
    console.log(`Created Firebase Auth user for ${email}`);
  }

  // Transforms the verified Auth UID and seed configuration into the administrator schema.
  const profile = {
    uid: userRecord.uid,
    fullName,
    email,
    contactNumber: '',
    username: 'admin',
    role: 'super_admin',
    status: 'active',
    createdAt: new Date().toISOString(),
    createdBy: 'system',
  };

  // Persists authorization data while preserving any additional profile fields created elsewhere.
  await db.collection('admins').doc(userRecord.uid).set(profile, { merge: true });

  console.log('Super admin profile saved to Firestore.');
  console.log(`Email: ${email}`);
  console.log(`Password: ${password}`);
}

// Runs the asynchronous seed and exits with a process status suitable for scripts or CI.
seedSuperAdmin()
  .then(() => process.exit(0))
  .catch((error) => {
    // Reports startup or Firebase failures and signals an unsuccessful seed execution.
    console.error(error);
    process.exit(1);
  });
