/**
 * User Account Routes Module
 *
 * Purpose:
 * Defines privileged HTTP operations that remove EcoBantay citizen or administrator accounts.
 *
 * How it works:
 * 1. Creates an Express router for account administration.
 * 2. Authenticates active administrators through middleware.
 * 3. Applies target-account and requester-role safeguards.
 * 4. Coordinates Firebase Auth deletion, Firestore cleanup, and audit logging.
 *
 * Technologies Used:
 * Express, Firebase Admin Authentication, and Cloud Firestore.
 *
 * Why this implementation:
 * Keeping destructive account operations in one protected module makes authorization,
 * cross-service cleanup, and administrative accountability easier to verify.
 */
import express from 'express';
import { auth, db } from '../firebaseAdmin.js';
import { verifyAdmin } from '../middleware/verifyAdmin.js';

const router = express.Router();

/**
 * DELETE /:userId
 *
 * Purpose:
 * Removes an EcoBantay citizen account for an authorized administrator, or a standard
 * administrator account when the requester has super-administrator privileges.
 *
 * How it works:
 * 1. Receives the target Firebase UID after administrator middleware authorization.
 * 2. Validates the identifier and prevents self-deletion through this endpoint.
 * 3. Checks Firestore to determine whether the target is an administrator.
 * 4. Enforces role restrictions and removes matching Firestore profiles.
 * 5. Deletes the Firebase Authentication identity when present.
 * 6. Records the destructive action in the administrator activity log.
 * 7. Returns success or a controlled server response.
 *
 * Technologies Used:
 * Express, Firebase Admin Authentication, and Cloud Firestore.
 *
 * Why this implementation:
 * Coordinating profile and Auth deletion prevents orphaned accounts, while role checks
 * and audit logging protect high-impact account-management operations.
 */
router.delete('/:userId', verifyAdmin, async (req, res) => {
  // Places all asynchronous identity, profile, and audit operations under one error boundary.
  try {
    const { userId } = req.params;

    // Validates the route identifier before attempting any privileged deletion.
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required.' });
    }

    // Prevents administrators from accidentally removing their own active session identity.
    if (userId === req.admin.uid) {
      return res.status(400).json({ error: 'You cannot delete your own account from here.' });
    }

    // Reads the administrator collection first because account type determines authorization.
    const adminDoc = await db.collection('admins').doc(userId).get();
    let accountType = 'user';
    // Applies stricter rules when the target has an administrator profile.
    if (adminDoc.exists) {
      // Reserves administrator deletion for a verified super administrator.
      if (req.admin.role !== 'super_admin') {
        return res.status(403).json({ error: 'Only super admins can delete admin accounts.' });
      }
      // Protects super-administrator identities from deletion through this general endpoint.
      if (adminDoc.data().role === 'super_admin') {
        return res.status(403).json({ error: 'Super admin accounts cannot be deleted here.' });
      }
      // Updates audit context before removing the standard administrator profile from Firestore.
      accountType = 'admin';
      await db.collection('admins').doc(userId).delete();
    }

    // Removes a citizen profile when one exists, including mixed or legacy account records.
    const userDoc = await db.collection('users').doc(userId).get();
    if (userDoc.exists) {
      await db.collection('users').doc(userId).delete();
    }

    // Removes the Firebase Auth identity while tolerating an already-missing record.
    try {
      await auth.deleteUser(userId);
    } catch (error) {
      // Rethrows genuine Firebase failures but treats an absent Auth record as idempotent cleanup.
      if (error.code !== 'auth/user-not-found') {
        throw error;
      }
    }

    // Logs the destructive action with the trusted initiating administrator for accountability.
    await db.collection('admin_activity_logs').add({
      adminUid: req.admin.uid,
      adminName: req.admin.fullName || req.admin.email,
      action: 'Deleted User Account',
      module: 'Users',
      recordId: userId,
      details: `Deleted ${accountType} account and auth record`,
      createdAt: new Date().toISOString(),
    });

    return res.json({ ok: true });
  } catch (error) {
    // Reports unexpected Firebase or Firestore failures through a consistent server response.
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to delete user account.',
    });
  }
});

export default router;
