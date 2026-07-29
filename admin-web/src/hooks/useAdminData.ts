import { useCallback, useEffect, useState } from 'react';
import {
  fetchActivityLogs,
  fetchAdmins,
  fetchAppUsers,
  fetchReports,
} from '@/services/adminDataService';
import type { ActivityLog, AdminProfile, AppUser, Report } from '@/types/admin';
import { useAdminAuth } from '@/context/AdminAuthContext';

/**
 * Purpose: Centralizes the collections and statistics required by administrative screens.
 * How it works:
 * 1. The authenticated administrator and role determine activity-log visibility.
 * 2. Users, admins, reports, and permitted logs are fetched concurrently.
 * 3. Collection state and derived totals are returned with reload and error controls.
 * Technologies Used: React hooks, React Context, asynchronous JavaScript, and Cloud Firestore services.
 * Why this implementation: Shared loading logic keeps dashboard screens consistent and avoids duplicated queries.
 */
export function useAdminData() {
  const { admin, isSuperAdmin } = useAdminAuth();
  /*
   * These collections are the shared source for tables and summary cards.
   * Loading and error state allow screens to represent the asynchronous Firestore workflow.
   */
  const [users, setUsers] = useState<AppUser[]>([]);
  const [admins, setAdmins] = useState<AdminProfile[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  /**
   * Purpose: Reloads all administrative collections with role-appropriate audit history.
   * How it works:
   * 1. Loading and previous errors are reset.
   * 2. Independent collection requests execute concurrently.
   * 3. Standard admins receive only their logs while super admins receive the global log.
   * 4. Successful results replace shared state; failures become a displayable message.
   * Technologies Used: React useCallback, Promise.all, and Cloud Firestore service functions.
   * Why this implementation: Parallel reads reduce waiting time while preserving one coherent refresh boundary.
   */
  const reload = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      // Fetch independent Firestore datasets in parallel and scope audit data by admin role.
      const [appUsers, adminUsers, reportItems, logs] = await Promise.all([
        fetchAppUsers(),
        fetchAdmins(),
        fetchReports(),
        admin
          ? fetchActivityLogs(isSuperAdmin ? undefined : admin.uid)
          : Promise.resolve([]),
      ]);
      // Commit one successful data snapshot so all consuming screens observe matching results.
      setUsers(appUsers);
      setAdmins(adminUsers);
      setReports(reportItems);
      setActivityLogs(logs);
    // Preserve the last rendered structure while exposing a readable loading failure.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load admin data.');
    } finally {
      setIsLoading(false);
    }
  }, [admin, isSuperAdmin]);

  useEffect(() => {
    reload();
  }, [reload]);

  const stats = {
    totalReports: reports.length,
    reportsInReview: reports.filter((report) => report.status === 'In Review').length,
    pendingReports: reports.filter((report) => report.status === 'Pending').length,
    resolvedReports: reports.filter((report) => report.status === 'Resolved').length,
    totalUsers: users.length,
    totalAdmins: admins.filter((admin) => admin.role === 'admin').length,
  };

  return {
    users,
    admins,
    reports,
    activityLogs,
    stats,
    isLoading,
    error,
    reload,
    /**
     * Purpose: Loads the audit history for one administrator profile.
     * How it works:
     * 1. The caller supplies an administrator UID after completing its role check.
     * 2. The service returns matching Firestore activity records.
     * Technologies Used: Asynchronous JavaScript and Cloud Firestore services.
     * Why this implementation: The screen owns visibility decisions while this hook reuses data access.
     */
    loadAdminActivity: async (adminUid: string) => {
      const logs = await fetchActivityLogs(adminUid);
      return logs;
    },
  };
}
