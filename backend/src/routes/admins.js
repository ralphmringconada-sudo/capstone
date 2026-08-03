/**
 * Administrator Routes Module
 *
 * Purpose:
 * Defines protected HTTP operations for managing EcoBantay administrator accounts.
 *
 * How it works:
 * 1. Creates an isolated Express router.
 * 2. Applies super-administrator middleware to account provisioning.
 * 3. Coordinates Firebase Authentication, Firestore profiles, and activity logs.
 * 4. Exports the router for mounting by the backend entry module.
 *
 * Technologies Used:
 * Express, Firebase Admin Authentication, and Cloud Firestore.
 *
 * Why this implementation:
 * A dedicated router groups privileged account workflows and keeps their authorization
 * boundary explicit for maintenance and thesis review.
 */
import express from 'express';
import { auth, db } from '../firebaseAdmin.js';
import { verifySuperAdmin } from '../middleware/verifyAdmin.js';

const router = express.Router();

/**
 * POST /create
 *
 * Purpose:
 * Provisions a standard EcoBantay administrator after a super administrator has
 * been authenticated and authorized by route middleware.
 *
 * How it works:
 * 1. Receives and validates the required administrator profile fields.
 * 2. Normalizes the email and creates a Firebase Authentication identity.
 * 3. Builds the application-specific administrator profile.
 * 4. Stores authorization metadata in Cloud Firestore.
 * 5. Writes an administrator activity log for accountability.
 * 6. Returns the created profile or a suitable conflict/server response.
 *
 * Technologies Used:
 * Express, Firebase Admin Authentication, and Cloud Firestore.
 *
 * Why this implementation:
 * Firebase Authentication securely manages credentials while Firestore stores roles,
 * status, and audit information needed by EcoBantay's administrative workflows.
 */
router.post('/create', verifySuperAdmin, async (req, res) => {
  let createdUid = null;
  // Converts asynchronous Auth and Firestore failures into controlled HTTP responses.
  try {
    // Extracts only the profile fields accepted by this administrator-creation workflow.
    const {
      fullName,
      email,
      contactNumber,
      username,
      password,
      status = 'active',
    } = req.body;

    // Validates required identity fields before creating a persistent Auth account.
    if (!fullName?.trim() || !email?.trim() || !password) {
      return res.status(400).json({ error: 'Full name, email, and password are required.' });
    }

    // Normalizes identity data to prevent case and whitespace inconsistencies across services.
    const normalizedEmail = email.trim().toLowerCase();
    // Creates the credential-bearing identity in Firebase Authentication before profile storage.
    const userRecord = await auth.createUser({
      email: normalizedEmail,
      password,
      displayName: fullName.trim(),
    });
    createdUid = userRecord.uid;

    // Transforms request values and trusted creator context into the Firestore profile schema.
    const adminProfile = {
      uid: userRecord.uid,
      fullName: fullName.trim(),
      email: normalizedEmail,
      contactNumber: contactNumber?.trim() || '',
      username: username?.trim() || normalizedEmail.split('@')[0],
      role: 'admin',
      status,
      createdAt: new Date().toISOString(),
      createdBy: req.admin.uid,
    };

    // Stores role, status, and profile metadata separately from the Firebase Auth record.
    await db.collection('admins').doc(userRecord.uid).set(adminProfile);

    // Records who provisioned the administrator to support traceability and panel-auditable governance.
    await db.collection('admin_activity_logs').add({
      adminUid: req.admin.uid,
      adminName: req.admin.fullName || req.admin.email,
      action: 'Created Administrator',
      module: 'Users',
      recordId: userRecord.uid,
      details: `Created admin account for ${normalizedEmail}`,
      createdAt: new Date().toISOString(),
    });

    return res.status(201).json({ admin: adminProfile });
  } catch (error) {
    // Prevent an unusable Auth-only account when profile or activity persistence fails.
    if (createdUid) {
      await db.collection('admins').doc(createdUid).delete().catch(() => undefined);
      await auth.deleteUser(createdUid).catch(() => undefined);
    }
    // Maps Firebase's duplicate-email condition to an HTTP conflict instead of a generic failure.
    if (error.code === 'auth/email-already-exists') {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    // Returns unexpected Auth or Firestore failures without leaving the request unresolved.
    return res.status(500).json({ error: error.message || 'Failed to create administrator.' });
  }
});

export default router;
