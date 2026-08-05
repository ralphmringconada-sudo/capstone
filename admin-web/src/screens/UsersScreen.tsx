import { useMemo, useRef, useState } from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
  ActivityIndicator,
  Alert,
} from "react-native";
import {
  Calendar,
  Check,
  Eye,
  Filter,
  Search,
  UserPlus,
  Users,
  UsersRound,
  Flag,
  X,
  Mail,
  Phone,
} from "lucide-react-native";
import { auth } from "@/config/firebase";
import AdminLayout from "../components/AdminLayout";
import DashboardCard from "../components/DashboardCard";
import DateRangeFilter from "@/components/DateRangeFilter";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { useAdminData } from "@/hooks/useAdminData";
import {
  createAdminAccount,
  deleteAppUserAccount,
  sendAdminPasswordResetForAdmin,
  setAccountFlag,
  updateAdminProfileInfo,
  updateAppUserProfile,
} from "@/services/adminDataService";
import { isWithinDateRange } from "@/utils/dateRange";
import { formatDateTime, getUserDisplayName } from "@/utils/format";
import type { ActivityLog } from "@/types/admin";

/**
 * Purpose: Provides role-aware administration of citizen and administrator accounts.
 * How it works:
 * 1. Firestore-backed hooks combine citizen and admin profiles into a searchable table.
 * 2. Profile modals expose account information and permitted audit history.
 * 3. Role checks govern editing, flagging, deletion, and administrator creation.
 * 4. Trusted backend endpoints perform privileged account creation and deletion.
 * Technologies Used: React hooks, React Native Web, Firebase Authentication, Cloud Firestore, and backend REST APIs.
 * Why this implementation: One role-aware workspace centralizes account oversight while preserving privilege boundaries.
 */
export default function UsersScreen() {
  const { width, height } = useWindowDimensions();
  // Floor scale so modal/table text does not compress on smaller viewports.
  const s = Math.max(0.72, Math.min(width / 1920, height / 1080));
  const { isSuperAdmin, admin } = useAdminAuth();
  const { users: appUsers, admins, reports, stats, reload, loadAdminActivity } = useAdminData();

  // Normalize separate Firestore schemas into one display model without altering source records.
  // Standard admins only see citizen accounts; Super Admins see admins + users.
  const tableUsers = useMemo(() => {
    const citizenRows = appUsers.map((user) => {
      const registered = formatDateTime(user.createdAt);
      return [
        `#${user.uid.slice(0, 8)}`,
        getUserDisplayName(user),
        `@${user.email.split("@")[0]}`,
        user.email,
        "User",
        registered.date,
        registered.time,
        user.uid,
      ];
    });

    if (!isSuperAdmin) {
      return citizenRows;
    }

    const adminRows = admins.map((adminRow) => {
      const registered = formatDateTime(adminRow.createdAt);
      return [
        `#${adminRow.uid.slice(0, 8)}`,
        adminRow.fullName,
        `@${adminRow.username}`,
        adminRow.email,
        adminRow.role === "super_admin" ? "Super Admin" : "Admin",
        registered.date,
        registered.time,
        adminRow.uid,
      ];
    });

    return [...adminRows, ...citizenRows];
  }, [admins, appUsers, isSuperAdmin]);

  /*
   * Selection and modal state preserve the account currently under review.
   * Activity state is loaded separately because audit visibility depends on the viewer's role.
   */
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [adminActivity, setAdminActivity] = useState<ActivityLog[]>([]);

  /*
   * Creation and editing forms use independent values, errors, and progress flags so
   * privileged backend operations cannot be submitted repeatedly or leak state between dialogs.
   */
  const [isAddAdminOpen, setIsAddAdminOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [adminForm, setAdminForm] = useState({
    fullName: "",
    email: "",
    contactNumber: "",
    username: "",
    password: "",
    confirmPassword: "",
  });
  const [adminFormError, setAdminFormError] = useState("");
  const [isCreatingAdmin, setIsCreatingAdmin] = useState(false);
  const creatingAdminRef = useRef(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    firstName: "",
    lastName: "",
    contactNumber: "",
    birthday: "",
    fullName: "",
    username: "",
  });
  const [editError, setEditError] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("All Roles");
  const [statusFilter, setStatusFilter] = useState("All Statuses");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [userPage, setUserPage] = useState(1);
  const [activityPage, setActivityPage] = useState(1);
  const usersPerPage = 6;
  const activityPerPage = 6;

  // Derive persisted flags from both account collections for constant-time row checks.
  const flaggedUserIds = useMemo(
    () =>
      new Set([
        ...appUsers.filter((user) => user.isFlagged).map((user) => user.uid),
        ...admins.filter((item) => item.isFlagged).map((item) => item.uid),
      ]),
    [admins, appUsers],
  );

  /*
   * Edit/delete account controls are super-admin only.
   * Standard admins may view citizen profiles but cannot edit them.
   */
  const selectedRole = selectedUser?.[4];
  const isSelectedCitizen = selectedRole === "User";
  const isSelectedStandardAdmin = selectedRole === "Admin";
  const canManageSelected =
    Boolean(selectedUser) &&
    isSuperAdmin &&
    (isSelectedCitizen || isSelectedStandardAdmin);

  /**
   * Purpose: Resolves the contact number for the account currently displayed.
   * How it works:
   * 1. The normalized row supplies the UID and account role.
   * 2. The corresponding citizen or admin Firestore-backed collection is searched.
   * 3. Missing contact information receives a readable fallback.
   * Technologies Used: React state and TypeScript array lookup.
   * Why this implementation: The normalized table need not duplicate every profile field.
   */
  const getContactForSelected = () => {
    if (!selectedUser) return "Not set";
    const uid = selectedUser[7];
    if (selectedUser[4] === "User") {
      return appUsers.find((user) => user.uid === uid)?.contactNumber || "Not set";
    }
    return admins.find((item) => item.uid === uid)?.contactNumber || "Not set";
  };

  // Derive visible accounts from search, role, status, and registration date range.
  const filteredTableUsers = useMemo(() => {
    const queryText = search.trim().toLowerCase();
    const createdAtByUid = new Map<string, string>([
      ...appUsers.map((user) => [user.uid, user.createdAt] as const),
      ...admins.map((adminRow) => [adminRow.uid, adminRow.createdAt] as const),
    ]);

    return tableUsers.filter((u) => {
      const matchesSearch =
        !queryText ||
        u[1].toLowerCase().includes(queryText) ||
        u[3].toLowerCase().includes(queryText) ||
        u[2].toLowerCase().includes(queryText);
      const matchesRole = roleFilter === "All Roles" || u[4] === roleFilter;
      const isFlagged = flaggedUserIds.has(u[7]);
      const matchesStatus =
        statusFilter === "All Statuses" ||
        (statusFilter === "Flagged" && isFlagged) ||
        (statusFilter === "Active" && !isFlagged);
      const matchesDate = isWithinDateRange(createdAtByUid.get(u[7]), fromDate, toDate);
      return matchesSearch && matchesRole && matchesStatus && matchesDate;
    });
  }, [tableUsers, search, roleFilter, statusFilter, fromDate, toDate, appUsers, admins, flaggedUserIds]);

  const userPageCount = Math.max(1, Math.ceil(filteredTableUsers.length / usersPerPage));
  const currentUserPage = Math.min(userPage, userPageCount);
  const visibleTableUsers = filteredTableUsers.slice(
    (currentUserPage - 1) * usersPerPage,
    currentUserPage * usersPerPage,
  );
  const activityPageCount = Math.max(1, Math.ceil(adminActivity.length / activityPerPage));
  const currentActivityPage = Math.min(activityPage, activityPageCount);
  const visibleAdminActivity = adminActivity.slice(
    (currentActivityPage - 1) * activityPerPage,
    currentActivityPage * activityPerPage,
  );


  /**
   * Purpose: Opens an edit form populated for the selected, manageable account.
   * How it works:
   * 1. Selection and the role-derived management permission are required.
   * 2. Citizen and administrator schemas populate their respective editable fields.
   * 3. Previous errors are cleared before the modal opens.
   * Technologies Used: React state, TypeScript conditionals, and Firestore-backed profile collections.
   * Why this implementation: Schema-specific population prevents unrelated fields from crossing account types.
   */
  const openEditUser = () => {
    // Enforce the same role boundary before exposing editable account information.
    if (!selectedUser || !canManageSelected) return;
    const uid = selectedUser[7];
    if (selectedUser[4] === "User") {
      const user = appUsers.find((item) => item.uid === uid);
      setEditForm({
        firstName: user?.firstName || "",
        lastName: user?.lastName || "",
        contactNumber: user?.contactNumber || "",
        birthday: user?.birthday || "",
        fullName: "",
        username: "",
      });
    } else {
      const adminUser = admins.find((item) => item.uid === uid);
      setEditForm({
        firstName: "",
        lastName: "",
        contactNumber: adminUser?.contactNumber || "",
        birthday: "",
        fullName: adminUser?.fullName || selectedUser[1],
        username: adminUser?.username || "",
      });
    }
    setEditError("");
    setIsEditOpen(true);
  };

  /**
   * Purpose: Validates and persists approved edits for a selected account.
   * How it works:
   * 1. Selection, authenticated actor, and management permission are required.
   * 2. Required fields are validated according to citizen or administrator schema.
   * 3. The matching Firestore update service writes fields and audit attribution.
   * 4. Profile state closes and shared account data reloads after success.
   * Technologies Used: React state, Cloud Firestore services, React Context, and React Native alerts.
   * Why this implementation: One guarded handler supports both schemas while retaining typed service boundaries.
   */
  const handleSaveEdit = async () => {
    // Reject stale modal actions or role combinations that are not authorized to edit.
    if (!selectedUser || !admin || !canManageSelected) return;
    setEditError("");

    // Apply account-type-specific validation before any Firestore write.
    if (selectedUser[4] === "User") {
      if (!editForm.firstName.trim() || !editForm.lastName.trim()) {
        setEditError("First and last name are required.");
        return;
      }
    } else if (!editForm.fullName.trim()) {
      setEditError("Full name is required.");
      return;
    }

    // Prevent duplicate profile updates while the write, audit log, and reload complete.
    setIsSavingEdit(true);
    try {
      const uid = selectedUser[7];
      // Route the approved fields to the service matching the selected account collection.
      if (selectedUser[4] === "User") {
        await updateAppUserProfile(
          uid,
          {
            firstName: editForm.firstName.trim(),
            lastName: editForm.lastName.trim(),
            contactNumber: editForm.contactNumber.trim(),
            birthday: editForm.birthday.trim(),
          },
          admin,
        );
      } else {
        await updateAdminProfileInfo(
          uid,
          {
            fullName: editForm.fullName.trim(),
            contactNumber: editForm.contactNumber.trim(),
            username: editForm.username.trim(),
          },
          admin,
        );
      }
      setIsEditOpen(false);
      closeUserProfile();
      await reload();
      Alert.alert("Saved", "User information updated.");
    // Keep the edit modal available so validation or Firestore failures can be corrected.
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to update user.");
    } finally {
      setIsSavingEdit(false);
    }
  };

  /**
   * Purpose: Sends a Firebase password-reset email for a selected standard admin.
   * How it works: Super admin only; uses Firebase Auth email recovery (easier default flow).
   */
  const handleSendAdminPasswordReset = async () => {
    if (!selectedUser || !admin || !isSuperAdmin || selectedUser[4] !== "Admin") return;
    setIsSendingReset(true);
    setEditError("");
    try {
      await sendAdminPasswordResetForAdmin(selectedUser[7], admin);
      Alert.alert(
        "Password reset sent",
        "A Firebase reset email was sent. The admin can open it and set a new password.",
      );
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to send password reset.");
    } finally {
      setIsSendingReset(false);
    }
  };

  /**
   * Purpose: Confirms and requests permanent deletion of a manageable account.
   * How it works:
   * 1. Current selection and role-derived permission are required.
   * 2. A destructive confirmation prevents accidental deletion.
   * 3. A fresh Firebase ID token authorizes the trusted backend request.
   * 4. Successful deletion closes the profile and reloads account data.
   * Technologies Used: React Native alerts, Firebase Authentication, backend REST API, and React state.
   * Why this implementation: Server-authorized deletion protects privileged identity operations from browser misuse.
   */
  const handleDeleteUser = () => {
    // Do not offer destructive behavior outside the established account-role boundary.
    if (!selectedUser || !canManageSelected) return;
    const uid = selectedUser[7];

    Alert.alert("Delete Account", `Delete ${selectedUser[1]} permanently?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          // Refresh the Firebase bearer token immediately before the protected API request.
          try {
            const token = await auth.currentUser?.getIdToken();
            if (!token) throw new Error("You must be signed in.");
            await deleteAppUserAccount(token, uid);
            closeUserProfile();
            await reload();
            Alert.alert("Deleted", "Account deleted successfully.");
          // Leave the profile available and surface backend authorization or deletion errors.
          } catch (err) {
            Alert.alert("Error", err instanceof Error ? err.message : "Failed to delete account.");
          }
        },
      },
    ]);
  };

  /**
   * Purpose: Opens an account profile and conditionally loads administrator audit history.
   * How it works:
   * 1. The selected normalized account row is stored and displayed.
   * 2. Previous audit data is cleared to avoid showing another account's history.
   * 3. Super admins may view admin logs; standard admins may view only their own.
   * Technologies Used: React state, role checks, asynchronous JavaScript, and Cloud Firestore audit queries.
   * Why this implementation: Delayed, permission-aware loading prevents stale or overexposed activity records.
   */
  const openUserProfile = async (user: any) => {
    // Standard admins may only open citizen profiles — never other admins/super admins.
    if (!isSuperAdmin && (user[4] === "Admin" || user[4] === "Super Admin")) {
      Alert.alert(
        "Access denied",
        "Administrators can only view citizen user accounts and their activity.",
      );
      return;
    }

    setSelectedUser(user);
    setIsProfileOpen(true);
    setActivityPage(1);

    // Clear potentially sensitive history before evaluating access for the new selection.
    setAdminActivity([]);
    if (
      (user[4] === "Admin" || user[4] === "Super Admin") &&
      isSuperAdmin
    ) {
      // Query Firestore only after the viewer passes the audit-history role check.
      try {
        setAdminActivity(await loadAdminActivity(user[7]));
      // Keep the profile usable even if its optional activity history cannot be loaded.
      } catch (error) {
        Alert.alert(
          "Activity unavailable",
          error instanceof Error ? error.message : "Failed to load administrator activity.",
        );
      }
    }
  };

  /**
   * Purpose: Closes the account profile and removes selection-specific state.
   * How it works:
   * 1. The profile modal is hidden.
   * 2. Selected account and audit-history state are cleared.
   * Technologies Used: React state.
   * Why this implementation: Explicit cleanup prevents one account's data from appearing in the next profile.
   */
  const closeUserProfile = () => {
    setIsProfileOpen(false);
    setSelectedUser(null);
    setAdminActivity([]);
    setActivityPage(1);
  };

  /**
   * Purpose: Toggles a persistent moderation flag for an authorized account type.
   * How it works:
   * 1. An authenticated actor and permitted role combination are required.
   * 2. The inverse of the current persisted flag is written to the proper collection.
   * 3. Firestore audit logging and shared-data reload complete the workflow.
   * Technologies Used: React Context, role checks, Cloud Firestore services, and React Native alerts.
   * Why this implementation: Persisted, audited flags remain visible and attributable across sessions.
   */
  const toggleFlagUser = async (userId: string, role: string) => {
    if (!admin) return;
    // Standard admins may flag citizens; only super admins may flag standard administrators.
    const canFlag = role === "User" || (isSuperAdmin && role === "Admin");
    if (!canFlag) {
      Alert.alert("Not allowed", "You do not have permission to flag this account.");
      return;
    }

    // Persist the new flag and its audit metadata before refreshing the visible account list.
    try {
      await setAccountFlag(
        userId,
        role === "Admin" ? "admin" : "user",
        !flaggedUserIds.has(userId),
        admin,
      );
      await reload();
    // Report Firestore or permission failures without changing the local flag representation.
    } catch (error) {
      Alert.alert("Error", error instanceof Error ? error.message : "Failed to update account flag.");
    }
  };

  /**
   * Purpose: Validates and creates a standard administrator account through the trusted backend.
   * How it works:
   * 1. Required identity fields and matching passwords are checked locally.
   * 2. A fresh Firebase ID token proves the requesting super-admin session.
   * 3. The backend creates Firebase credentials and the admin profile.
   * 4. Form state resets and shared account data reloads after success.
   * Technologies Used: React state, Firebase Authentication, backend REST API, and Cloud Firestore-backed data.
   * Why this implementation: Server-side creation keeps privileged identity administration outside client code.
   */
  const handleCreateAdmin = async () => {
    if (creatingAdminRef.current || isCreatingAdmin) return;
    setAdminFormError("");
    // Complete required-field and password confirmation checks before requesting a token.
    if (!adminForm.fullName || !adminForm.email || !adminForm.password) {
      setAdminFormError("Full name, email, and password are required.");
      return;
    }
    if (adminForm.password !== adminForm.confirmPassword) {
      setAdminFormError("Passwords do not match.");
      return;
    }

    // Obtain a current Firebase bearer token for backend role verification.
    const token = await auth.currentUser?.getIdToken();
    if (!token) {
      setAdminFormError("You must be signed in as super admin.");
      return;
    }

    // Prevent duplicate privileged account requests while creation and reload complete.
    creatingAdminRef.current = true;
    setIsCreatingAdmin(true);
    try {
      await createAdminAccount(token, {
        fullName: adminForm.fullName,
        email: adminForm.email,
        contactNumber: adminForm.contactNumber,
        username: adminForm.username,
        password: adminForm.password,
      });
      setIsAddAdminOpen(false);
      setAdminForm({
        fullName: "",
        email: "",
        contactNumber: "",
        username: "",
        password: "",
        confirmPassword: "",
      });
      await reload();
      Alert.alert("Administrator created", "The new administrator can now sign in.");
    // Keep entered values available when backend validation or authorization fails.
    } catch (err) {
      setAdminFormError(err instanceof Error ? err.message : "Failed to create administrator.");
    } finally {
      creatingAdminRef.current = false;
      setIsCreatingAdmin(false);
    }
  };

  return (
    <AdminLayout activePage="Users">
      <ScrollView
        style={styles.page}
        contentContainerStyle={{
          paddingHorizontal: width * 0.025,
          paddingTop: height * 0.035,
          paddingBottom: 30,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topRow}>
          <View>
            <Text style={[styles.pageTitle, { fontSize: 42 * s }]}>USERS</Text>
            <Text style={[styles.subtitle, { fontSize: 18 * s }]}>
              Manage and monitor all registered users in the system
            </Text>
          </View>

          {isSuperAdmin ? (
          <TouchableOpacity
            onPress={() => setIsAddAdminOpen(true)}
            style={[
              styles.addButton,
              {
                paddingHorizontal: 18 * s,
                height: 38 * s,
                borderRadius: 6 * s,
              },
            ]}
          >
            <UserPlus size={16 * s} color="#fff" />
            <Text style={[styles.addButtonText, { fontSize: 16 * s }]}>
              Add Administrator
            </Text>
          </TouchableOpacity>
          ) : null}
        </View>

        <View style={[styles.cards, { gap: width * 0.025, marginTop: height * 0.035 }]}>
          <DashboardCard
            title="Total Users"
            value={String(isSuperAdmin ? stats.totalUsers + admins.length : stats.totalUsers)}
            color="#DDEAD3"
            icon={UsersRound}
            iconColor="#20B83B"
          />
          <DashboardCard title="Active Users" value={String(stats.totalUsers)} color="#CFE6FA" icon={Check} iconColor="#259BEF" />
          <DashboardCard
            title="New This Month"
            value={String(
              appUsers.filter((user) => {
                const created = new Date(user.createdAt);
                const now = new Date();
                return (
                  created.getFullYear() === now.getFullYear() &&
                  created.getMonth() === now.getMonth()
                );
              }).length,
            )}
            color="#FCEFCB"
            icon={UserPlus}
            iconColor="#FFC02B"
          />
          <DashboardCard title="Inactive Users" value="0" color="#DADAF8" icon={Users} iconColor="#7C7CF2" />
        </View>

        <View style={[styles.filterPanel, { marginTop: height * 0.025, padding: 14 * s }]}>
          <View style={styles.searchBox}>
            <TextInput
              placeholder="Search users..."
              placeholderTextColor="#777"
              style={[styles.searchInput, { fontSize: 16 * s }]}
              value={search}
              onChangeText={(value) => {
                setSearch(value);
                setUserPage(1);
              }}
            />
            <Search size={20 * s} color="#000" />
          </View>

          <FilterDropdown
            label="Roles"
            value={roleFilter}
            options={isSuperAdmin ? ["All Roles", "User", "Admin", "Super Admin"] : ["All Roles", "User"]}
            s={s}
            onChange={(value: string) => {
              setRoleFilter(value);
              setUserPage(1);
            }}
          />

          <FilterDropdown
            label="Status"
            value={statusFilter}
            options={["All Statuses", "Active", "Flagged"]}
            s={s}
            onChange={(value: string) => {
              setStatusFilter(value);
              setUserPage(1);
            }}
          />

          <DateRangeFilter
            label="Date Registered"
            fromDate={fromDate}
            toDate={toDate}
            onChangeFrom={(value) => {
              setFromDate(value);
              setUserPage(1);
            }}
            onChangeTo={(value) => {
              setToDate(value);
              setUserPage(1);
            }}
            style={{ flex: 1.6 }}
          />

          <TouchableOpacity
            style={styles.smallButton}
            onPress={() => {
              setSearch("");
              setRoleFilter("All Roles");
              setStatusFilter("All Statuses");
              setFromDate("");
              setToDate("");
              setUserPage(1);
            }}
          >
            <Filter size={14 * s} color="#34733B" />
            <Text style={[styles.buttonText, { fontSize: 16 * s }]}>Reset</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.tablePanel, { marginTop: height * 0.02 }]}>
          <ScrollView horizontal={width < 1100} showsHorizontalScrollIndicator={width < 1100}>
            <View style={[styles.table, width >= 1100 ? styles.tableFullWidth : null]}>
          <View style={[styles.tableHeader, { height: 48 * s }]}>
            <Text style={[styles.th, styles.idCol, { fontSize: 18 * s }]}>ID</Text>
            <Text style={[styles.th, styles.userCol, { fontSize: 18 * s }]}>User</Text>
            <Text style={[styles.th, styles.emailCol, { fontSize: 18 * s }]}>Email</Text>
            <Text style={[styles.th, styles.roleCol, { fontSize: 18 * s }]}>Role</Text>
            <Text style={[styles.th, styles.dateCol, { fontSize: 18 * s }]}>Date Registered</Text>
            <Text style={[styles.th, styles.actionCol, { fontSize: 18 * s }]}>Action</Text>
          </View>

          {visibleTableUsers.map((u, index) => {
            const isFlagged = flaggedUserIds.has(u[7]);

            return (
              <View key={index} style={[styles.tableRow, { minHeight: 82 * s }]}>
                <Text style={[styles.td, styles.idCol, { fontSize: 16 * s }]}>{u[0]}</Text>

                <View style={[styles.userCol, styles.userInfo]}>
                  <View
                    style={[
                      styles.avatar,
                      {
                        width: 42 * s,
                        height: 42 * s,
                        borderRadius: 21 * s,
                      },
                    ]}
                  />
                  <View>
                    <Text style={[styles.td, { fontSize: 16 * s }]}>{u[1]}</Text>
                    <Text style={[styles.username, { fontSize: 16 * s }]}>{u[2]}</Text>
                  </View>
                </View>

                <Text style={[styles.td, styles.emailCol, { fontSize: 16 * s }]}>{u[3]}</Text>

                <View style={[styles.roleCol, styles.badgeWrap]}>
                  <Text
                    style={[
                      styles.badge,
                      roleColor(u[4]),
                      {
                        fontSize: 16 * s,
                        paddingHorizontal: 9 * s,
                        paddingVertical: 5 * s,
                      },
                    ]}
                  >
                    {u[4]}
                  </Text>
                </View>

                <View style={styles.dateCol}>
                  <Text style={[styles.td, { fontSize: 16 * s }]}>{u[5]}</Text>
                  <Text style={[styles.username, { fontSize: 16 * s }]}>{u[6]}</Text>
                </View>

                <View style={[styles.actionCol, styles.actionWrap]}>
                  <TouchableOpacity
                    onPress={() => openUserProfile(u)}
                    style={[
                      styles.profileButton,
                      {
                        height: 30 * s,
                        paddingHorizontal: 10 * s,
                        borderRadius: 5 * s,
                      },
                    ]}
                  >
                    <Eye size={15 * s} color="#34733B" />
                    <Text style={[styles.profileButtonText, { fontSize: 16 * s }]}>
                      View Profile
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => toggleFlagUser(u[7], u[4])}
                    disabled={u[4] !== "User" && !(isSuperAdmin && u[4] === "Admin")}
                    style={[
                      styles.flagButton,
                      isFlagged && styles.flaggedButton,
                      u[4] !== "User" &&
                        !(isSuperAdmin && u[4] === "Admin") &&
                        styles.disabledButton,
                      {
                        width: 30 * s,
                        height: 30 * s,
                        borderRadius: 5 * s,
                      },
                    ]}
                  >
                    <Flag size={16 * s} color="#E53935" />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
            </View>
          </ScrollView>

          <View style={[styles.paginationRow, { padding: 18 * s }]}>
            <Text style={[styles.showing, { fontSize: 16 * s }]}>
              Showing {filteredTableUsers.length ? (currentUserPage - 1) * usersPerPage + 1 : 0} to{" "}
              {Math.min(currentUserPage * usersPerPage, filteredTableUsers.length)} of{" "}
              {filteredTableUsers.length} users
            </Text>
            <View style={styles.paginationButtons}>
              <TouchableOpacity
                style={styles.paginationButton}
                disabled={currentUserPage === 1}
                onPress={() => setUserPage((value) => Math.max(1, value - 1))}
              >
                <Text style={styles.pagination}>‹</Text>
              </TouchableOpacity>
              {Array.from({ length: userPageCount }, (_, index) => index + 1).map((number) => (
                <TouchableOpacity
                  key={number}
                  style={[
                    styles.paginationButton,
                    currentUserPage === number && styles.paginationButtonActive,
                  ]}
                  onPress={() => setUserPage(number)}
                >
                  <Text
                    style={[
                      styles.pagination,
                      currentUserPage === number && styles.paginationTextActive,
                    ]}
                  >
                    {number}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={styles.paginationButton}
                disabled={currentUserPage === userPageCount}
                onPress={() => setUserPage((value) => Math.min(userPageCount, value + 1))}
              >
                <Text style={styles.pagination}>›</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <Modal transparent visible={isAddAdminOpen} animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={[styles.addAdminModal, { padding: 28 * s }]}>
              <View style={styles.addAdminLeft}>
                <Text style={[styles.addAdminTitle, { fontSize: 20 * s }]}>
                  Add New Administrator
                </Text>

                <Text style={[styles.addAdminSubtitle, { fontSize: 14 * s }]}>
                  Create a new administrator account. They will be able to access the system based on the assigned role and permissions.
                </Text>

                <View style={styles.formGrid}>
                  <AdminInput label="Full Name" placeholder="Enter full name" s={s} value={adminForm.fullName} onChangeText={(value: string) => setAdminForm((prev) => ({ ...prev, fullName: value }))} />
                  <AdminInput label="Email Address" placeholder="Enter email address" s={s} value={adminForm.email} onChangeText={(value: string) => setAdminForm((prev) => ({ ...prev, email: value }))} />
                  <AdminInput label="Contact Number" placeholder="Enter contact number" s={s} value={adminForm.contactNumber} onChangeText={(value: string) => setAdminForm((prev) => ({ ...prev, contactNumber: value }))} />
                  <AdminInput label="Username" placeholder="Enter username" s={s} value={adminForm.username} onChangeText={(value: string) => setAdminForm((prev) => ({ ...prev, username: value }))} />

                  <View>
                    <Text style={[styles.inputLabel, { fontSize: 14 * s }]}>Password</Text>
                    <View style={styles.inputBox}>
                      <TextInput
                        placeholder="Enter password"
                        placeholderTextColor="#777"
                        secureTextEntry={!showPassword}
                        style={[styles.inputText, { fontSize: 14 * s }]}
                        value={adminForm.password}
                        onChangeText={(value) => setAdminForm((prev) => ({ ...prev, password: value }))}
                      />
                      <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                        <Eye size={16 * s} color="#000" />
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View>
                    <Text style={[styles.inputLabel, { fontSize: 14 * s }]}>Confirm Password</Text>
                    <View style={styles.inputBox}>
                      <TextInput
                        placeholder="Confirm password"
                        placeholderTextColor="#777"
                        secureTextEntry={!showConfirmPassword}
                        style={[styles.inputText, { fontSize: 14 * s }]}
                        value={adminForm.confirmPassword}
                        onChangeText={(value) => setAdminForm((prev) => ({ ...prev, confirmPassword: value }))}
                      />
                      <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
                        <Eye size={16 * s} color="#000" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>

                {adminFormError ? (
                  <Text style={{ color: "#8B1E1E", marginTop: 10 * s }}>{adminFormError}</Text>
                ) : null}

                <Text style={[styles.inputLabel, { fontSize: 14 * s, marginTop: 14 * s }]}>
                  Administrator Role
                </Text>

                <Text style={[styles.helperText, { fontSize: 13 * s }]}>
                  Only super admins can create administrator accounts. New admins can manage reports and users but cannot create other admins.
                </Text>

                <Text style={[styles.inputLabel, { fontSize: 14 * s, marginTop: 14 * s }]}>
                  Account Status
                </Text>

                <View style={styles.selectBox}>
                  <Text style={[styles.inputText, { fontSize: 14 * s }]}>Active⌄</Text>
                </View>
              </View>

              <View style={styles.addAdminRight}>
                <View style={styles.adminIllustration}>
                  <UsersRound size={110 * s} color="#34733B" />
                </View>

                <FeatureItem text="Administrator Account" s={s} />
                <FeatureItem text="Can access reports, users, events, and account management" s={s} />
                <FeatureItem text="Super Admins can manage administrators and system controls" s={s} />
              </View>

              <View style={styles.addAdminActions}>
                <TouchableOpacity
                  onPress={() => setIsAddAdminOpen(false)}
                  style={styles.cancelButton}
                >
                  <Text style={[styles.cancelButtonText, { fontSize: 14 * s }]}>
                    Cancel
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleCreateAdmin}
                  style={styles.createAdminButton}
                  disabled={isCreatingAdmin}
                >
                  {isCreatingAdmin ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                  <Text style={[styles.createAdminButtonText, { fontSize: 14 * s }]}>
                    Create Administrator
                  </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <Modal transparent visible={isProfileOpen} animationType="fade">
          <View style={styles.modalOverlay}>
            <View
              style={[
                selectedUser && (selectedUser[4] === "Admin" || selectedUser[4] === "Super Admin")
                  ? styles.adminProfileModal
                  : styles.profileModal,
                { padding: 26 * s },
              ]}
            >
              <TouchableOpacity onPress={closeUserProfile} style={styles.closeButton}>
                <X size={24 * s} color="#000" />
              </TouchableOpacity>

              {selectedUser &&
              (selectedUser[4] === "Admin" || selectedUser[4] === "Super Admin") ? (
                <ScrollView contentContainerStyle={[styles.modalContent, { paddingBottom: 24 }]}>
                  <View style={styles.modalLeft}>
                    <View
                      style={[
                        styles.profileAvatar,
                        {
                          width: 150 * s,
                          height: 150 * s,
                          borderRadius: 75 * s,
                        },
                      ]}
                    >
                      <Text style={[styles.avatarText, { fontSize: 38 * s }]}>
                        {selectedUser[1]
                          .split(" ")
                          .map((n: string) => n[0])
                          .join("")}
                      </Text>
                    </View>

                    <Text style={[styles.profileName, { fontSize: 18 * s }]}>
                      {selectedUser[1]}
                    </Text>

                    <View style={styles.profileBadges}>
                      <Text
                        style={[
                          styles.badge,
                          roleColor(selectedUser[4]),
                          {
                            fontSize: 16 * s,
                            paddingHorizontal: 9 * s,
                            paddingVertical: 5 * s,
                          },
                        ]}
                      >
                        {selectedUser[4]}
                      </Text>

                      <Text
                        style={[
                          styles.badge,
                          styles.activeBadge,
                          {
                            fontSize: 16 * s,
                            paddingHorizontal: 9 * s,
                            paddingVertical: 5 * s,
                          },
                        ]}
                      >
                        Active
                      </Text>
                    </View>

                    <View style={styles.profileInfoGroup}>
                      <ProfileInfoItem icon={Mail} label="Email" value={selectedUser[3]} s={s} />
                      <ProfileInfoItem icon={Phone} label="Contact Number" value={getContactForSelected()} s={s} />
                      <ProfileInfoItem
                        icon={Calendar}
                        label="Date Registered"
                        value={`${selectedUser[5]} · ${selectedUser[6]}`}
                        s={s}
                      />
                    </View>
                  </View>

                  <View style={styles.adminActivityRight}>
                    <Text style={[styles.activeTab, { fontSize: 16 * s }]}>
                      Activity History
                    </Text>

                    <View style={[styles.activityHeader, { marginTop: 14 * s }]}>
                      <Text style={[styles.activityTh, styles.activityDateCol, { fontSize: 14 * s }]}>
                        Date & Time
                      </Text>
                      <Text style={[styles.activityTh, styles.activityActionCol, { fontSize: 14 * s }]}>
                        Action Performed
                      </Text>
                      <Text style={[styles.activityTh, styles.activityModuleCol, { fontSize: 14 * s }]}>
                        Module
                      </Text>
                      <Text style={[styles.activityTh, styles.activityRecordCol, { fontSize: 14 * s }]}>
                        Affected Record
                      </Text>
                      <Text style={[styles.activityTh, styles.activityDetailsCol, { fontSize: 14 * s }]}>
                        Details
                      </Text>
                      <Text style={[styles.activityTh, styles.activityViewCol, { fontSize: 14 * s }]}>
                        
                      </Text>
                    </View>

                    {visibleAdminActivity.map((item) => {
                      const loggedAt = formatDateTime(item.createdAt);
                      return (
                      <View key={item.id} style={styles.activityRow}>
                        <Text style={[styles.activityTd, styles.activityDateCol, { fontSize: 14 * s }]}>
                          {loggedAt.date}{"\n"}{loggedAt.time}
                        </Text>

                        <Text style={[styles.activityTd, styles.activityActionCol, { fontSize: 14 * s }]}>
                          {item.action}
                        </Text>

                        <View style={[styles.activityModuleCol, styles.badgeWrap]}>
                          <Text
                            style={[
                              styles.badge,
                              item.module === "Events" ? styles.eventBadge : styles.reportBadge,
                              {
                                fontSize: 14 * s,
                                paddingHorizontal: 8 * s,
                                paddingVertical: 4 * s,
                              },
                            ]}
                          >
                            {item.module}
                          </Text>
                        </View>

                        <Text style={[styles.activityTd, styles.activityRecordCol, { fontSize: 14 * s }]}>
                          {item.recordId}
                        </Text>

                        <Text style={[styles.activityTd, styles.activityDetailsCol, { fontSize: 14 * s }]}>
                          {item.details}
                        </Text>

                        <TouchableOpacity style={styles.activityViewButton}>
                          <Text style={[styles.activityViewText, { fontSize: 14 * s }]}>
                            View
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )})}

                    {adminActivity.length > activityPerPage ? (
                      <View style={styles.activityPagination}>
                        <TouchableOpacity
                          style={styles.paginationButton}
                          disabled={currentActivityPage === 1}
                          onPress={() => setActivityPage((value) => Math.max(1, value - 1))}
                        >
                          <Text style={styles.pagination}>‹</Text>
                        </TouchableOpacity>
                        {Array.from({ length: activityPageCount }, (_, index) => index + 1).map(
                          (number) => (
                            <TouchableOpacity
                              key={number}
                              style={[
                                styles.paginationButton,
                                currentActivityPage === number && styles.paginationButtonActive,
                              ]}
                              onPress={() => setActivityPage(number)}
                            >
                              <Text
                                style={[
                                  styles.pagination,
                                  currentActivityPage === number && styles.paginationTextActive,
                                ]}
                              >
                                {number}
                              </Text>
                            </TouchableOpacity>
                          ),
                        )}
                        <TouchableOpacity
                          style={styles.paginationButton}
                          disabled={currentActivityPage === activityPageCount}
                          onPress={() =>
                            setActivityPage((value) => Math.min(activityPageCount, value + 1))
                          }
                        >
                          <Text style={styles.pagination}>›</Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}

                    {canManageSelected ? (
                      <View style={styles.modalActions}>
                        <TouchableOpacity style={styles.editButton} onPress={openEditUser}>
                          <Text style={[styles.editButtonText, { fontSize: 16 * s }]}>
                            Edit Admin
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={handleDeleteUser}
                          style={[styles.flagUserButton, { borderColor: "#D83030" }]}
                        >
                          <Text
                            style={[
                              styles.flagUserText,
                              { fontSize: 16 * s, color: "#D83030" },
                            ]}
                          >
                            Delete Account
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() =>
                            toggleFlagUser(selectedUser[7], selectedUser[4])
                          }
                          style={[
                            styles.flagUserButton,
                            flaggedUserIds.has(selectedUser[7]) && styles.flaggedButton,
                          ]}
                        >
                          <Text style={[styles.flagUserText, { fontSize: 16 * s }]}>
                            {flaggedUserIds.has(selectedUser[7])
                              ? "Unflag Admin"
                              : "Flag Admin"}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}
                  </View>
                </ScrollView>
              ) : selectedUser ? (
  <ScrollView contentContainerStyle={[styles.modalContent, { paddingBottom: 24 }]}>
    <View style={styles.modalLeft}>
      <View
        style={[
          styles.profileAvatar,
          {
            width: 150 * s,
            height: 150 * s,
            borderRadius: 75 * s,
          },
        ]}
      >
        <Text style={[styles.avatarText, { fontSize: 38 * s }]}>
          {selectedUser[1]
            .split(" ")
            .map((n: string) => n[0])
            .join("")}
        </Text>
      </View>

      <Text style={[styles.profileName, { fontSize: 18 * s }]}>
        {selectedUser[1]}
      </Text>

      <View style={styles.profileBadges}>
        <Text
          style={[
            styles.badge,
            roleColor(selectedUser[4]),
            {
              fontSize: 16 * s,
              paddingHorizontal: 9 * s,
              paddingVertical: 5 * s,
            },
          ]}
        >
          {selectedUser[4]}
        </Text>

        <Text
          style={[
            styles.badge,
            styles.activeBadge,
            {
              fontSize: 16 * s,
              paddingHorizontal: 9 * s,
              paddingVertical: 5 * s,
            },
          ]}
        >
          Active
        </Text>
      </View>

      <View style={styles.profileInfoGroup}>
        <ProfileInfoItem icon={Mail} label="Email" value={selectedUser[3]} s={s} />
        <ProfileInfoItem icon={Phone} label="Contact Number" value={getContactForSelected()} s={s} />
        <ProfileInfoItem
          icon={Calendar}
          label="Date Registered"
          value={`${selectedUser[5]} · ${selectedUser[6]}`}
          s={s}
        />
      </View>
    </View>

    <View style={styles.modalRight}>
      <View style={styles.modalTabs}>
        <Text style={[styles.activeTab, { fontSize: 16 * s }]}>
          Submitted Reports
        </Text>
        <Text style={[styles.inactiveTab, { fontSize: 16 * s }]}>
          Joined Events
        </Text>
      </View>

      {reports
        .filter((report) => report.reportedByUid === selectedUser[7])
        .slice(0, 5)
        .map((report) => {
          const submitted = formatDateTime(report.createdAt);
          return (
        <View key={report.id} style={styles.modalReportRow}>
          <View style={[styles.smallImageBox, { width: 52 * s, height: 52 * s }]} />

          <View style={{ flex: 1 }}>
            <Text style={[styles.modalReportTitle, { fontSize: 16 * s }]}>
              {report.title}
            </Text>
            <Text style={[styles.username, { fontSize: 16 * s }]}>
              Recent submitted report
            </Text>
          </View>

          <Text
            style={[
              styles.badge,
              statusColor(report.status),
              {
                fontSize: 16 * s,
                paddingHorizontal: 9 * s,
                paddingVertical: 5 * s,
              },
            ]}
          >
            {report.status}
          </Text>

          <Text style={[styles.modalDate, { fontSize: 16 * s }]}>
            {submitted.date}
          </Text>
        </View>
          );
        })}

      {!reports.some((report) => report.reportedByUid === selectedUser[7]) ? (
        <Text style={[styles.username, { fontSize: 14 * s, marginTop: 12 * s }]}>
          No submitted reports yet.
        </Text>
      ) : null}

      {canManageSelected ? <View style={styles.modalActions}>
        <TouchableOpacity style={styles.editButton} onPress={openEditUser}>
          <Text style={[styles.editButtonText, { fontSize: 16 * s }]}>
            Edit User
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleDeleteUser}
          style={[styles.flagUserButton, { borderColor: "#D83030" }]}
        >
          <Text style={[styles.flagUserText, { fontSize: 16 * s, color: "#D83030" }]}>
            Delete Account
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => toggleFlagUser(selectedUser[7], selectedUser[4])}
          style={[
            styles.flagUserButton,
            flaggedUserIds.has(selectedUser[7]) && styles.flaggedButton,
          ]}
        >
          <Text style={[styles.flagUserText, { fontSize: 16 * s }]}>
            {flaggedUserIds.has(selectedUser[7]) ? "Unflag User" : "Flag User"}
          </Text>
        </TouchableOpacity>
      </View> : null}
    </View>
  </ScrollView>
) : null}
            </View>
          </View>
        </Modal>

        <Modal transparent visible={isEditOpen} animationType="fade">
          <View style={styles.modalOverlay}>
            <ScrollView
              style={styles.editModal}
              contentContainerStyle={{ paddingBottom: 20 }}
              showsVerticalScrollIndicator
            >
              <Text style={[styles.pageTitle, { fontSize: 28 * s, marginBottom: 16 * s }]}>
                {selectedUser?.[4] === "Admin" ? "Edit Administrator" : "Edit User"}
              </Text>

              {selectedUser?.[4] === "User" ? (
                <>
                  <AdminInput
                    label="First Name"
                    placeholder="First name"
                    s={s}
                    value={editForm.firstName}
                    onChangeText={(value: string) => setEditForm((prev) => ({ ...prev, firstName: value }))}
                  />
                  <AdminInput
                    label="Last Name"
                    placeholder="Last name"
                    s={s}
                    value={editForm.lastName}
                    onChangeText={(value: string) => setEditForm((prev) => ({ ...prev, lastName: value }))}
                  />
                  <AdminInput
                    label="Birthday"
                    placeholder="Birthday"
                    s={s}
                    value={editForm.birthday}
                    onChangeText={(value: string) => setEditForm((prev) => ({ ...prev, birthday: value }))}
                  />
                </>
              ) : (
                <>
                  <AdminInput
                    label="Full Name"
                    placeholder="Full name"
                    s={s}
                    value={editForm.fullName}
                    onChangeText={(value: string) => setEditForm((prev) => ({ ...prev, fullName: value }))}
                  />
                  <AdminInput
                    label="Username"
                    placeholder="Username"
                    s={s}
                    value={editForm.username}
                    onChangeText={(value: string) => setEditForm((prev) => ({ ...prev, username: value }))}
                  />
                  {selectedUser?.[4] === "Admin" ? (
                    <Text style={{ color: "#555", marginBottom: 12, fontFamily: "Montserrat_700Bold" }}>
                      Email: {selectedUser[3]}
                    </Text>
                  ) : null}
                </>
              )}

              <AdminInput
                label="Contact Number"
                placeholder="Contact number"
                s={s}
                value={editForm.contactNumber}
                onChangeText={(value: string) => setEditForm((prev) => ({ ...prev, contactNumber: value }))}
              />

              {editError ? <Text style={{ color: "#8B1E1E", marginBottom: 8 }}>{editError}</Text> : null}

              {isSuperAdmin && selectedUser?.[4] === "Admin" ? (
                <TouchableOpacity
                  style={[styles.editButton, { marginBottom: 16, alignSelf: "flex-start" }]}
                  onPress={() => void handleSendAdminPasswordReset()}
                  disabled={isSendingReset}
                >
                  {isSendingReset ? (
                    <ActivityIndicator color="#34733B" />
                  ) : (
                    <Text style={[styles.editButtonText, { fontSize: 15 * s }]}>
                      Send Password Reset Email
                    </Text>
                  )}
                </TouchableOpacity>
              ) : null}

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.editButton} onPress={() => setIsEditOpen(false)}>
                  <Text style={[styles.editButtonText, { fontSize: 16 * s }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.editButton, { backgroundColor: "#34733B" }]}
                  onPress={handleSaveEdit}
                  disabled={isSavingEdit}
                >
                  {isSavingEdit ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={[styles.editButtonText, { fontSize: 16 * s, color: "#fff" }]}>Save</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </Modal>
      </ScrollView>
    </AdminLayout>
  );
}

/**
 * Purpose: Renders a visible, selectable dropdown for table filters.
 * How it works: Opens an anchored option panel, applies the selected value, and closes the panel.
 */
function FilterDropdown({ label, value, options, s, onChange }: any) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <View
      style={[
        styles.dropdownContainer,
        isOpen ? styles.dropdownContainerOpen : null,
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={`${label} filter. Selected: ${value}`}
        accessibilityState={{ expanded: isOpen }}
        style={styles.filterBox}
        onPress={() => setIsOpen((open) => !open)}
      >
        <Text style={[styles.filterLabel, { fontSize: 16 * s }]}>{label}</Text>
        <View style={styles.dropdownValueRow}>
          <Text
            numberOfLines={1}
            style={[styles.filterText, styles.dropdownSelectedText, { fontSize: 16 * s }]}
          >
            {value}
          </Text>
          <Text style={[styles.dropdownArrow, { fontSize: 18 * s }]}>⌄</Text>
        </View>
      </TouchableOpacity>

      {isOpen ? (
        <View style={styles.dropdownMenu} accessibilityRole="menu">
          {options.map((option: string, index: number) => {
            const isSelected = option === value;

            return (
              <TouchableOpacity
                key={option}
                activeOpacity={0.75}
                accessibilityRole="menuitem"
                style={[
                  styles.dropdownOption,
                  index < options.length - 1 ? styles.dropdownOptionBorder : null,
                  isSelected ? styles.dropdownOptionSelected : null,
                ]}
                onPress={() => {
                  onChange(option);
                  setIsOpen(false);
                }}
              >
                <Text
                  style={[
                    styles.dropdownOptionText,
                    { fontSize: 15 * s },
                    isSelected ? styles.dropdownOptionTextSelected : null,
                  ]}
                >
                  {option}
                </Text>
                {isSelected ? <Check size={16 * s} color="#34733B" /> : null}
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

/**
 * Purpose: Renders a consistent labeled field for administrator creation forms.
 * How it works:
 * 1. Label, placeholder, value, and change handler are supplied by the parent form.
 * 2. Shared responsive styles produce the same field structure for each value.
 * Technologies Used: React and React Native Web controlled TextInput.
 * Why this implementation: A helper reduces visual drift across repeated form fields.
 */
function AdminInput({ label, placeholder, s, value, onChangeText }: any) {
  return (
    <View>
      <Text style={[styles.inputLabel, { fontSize: 14 * s }]}>
        {label}
      </Text>
      <TextInput
        placeholder={placeholder}
        placeholderTextColor="#777"
        style={[styles.inputBox, styles.inputText, { fontSize: 14 * s }]}
        value={value}
        onChangeText={onChangeText}
      />
    </View>
  );
}

/**
 * Purpose: Presents one capability included with a newly created administrator.
 * How it works:
 * 1. A shared confirmation icon introduces the supplied permission text.
 * 2. Responsive sizing matches the surrounding creation dialog.
 * Technologies Used: React, React Native Web, and Lucide React Native.
 * Why this implementation: Repeated permission rows remain concise and visually consistent.
 */
function FeatureItem({ text, s }: any) {
  return (
    <View style={styles.featureItem}>
      <Check size={16 * s} color="#20B83B" />
      <Text style={[styles.featureText, { fontSize: 14 * s }]}>
        {text}
      </Text>
    </View>
  );
}

/**
 * Purpose: Presents one labeled account value in the profile dialog.
 * How it works:
 * 1. A supplied icon identifies the information category.
 * 2. Label and value are arranged using the shared profile layout.
 * Technologies Used: React, React Native Web, and Lucide-compatible icons.
 * Why this implementation: A reusable row keeps citizen and admin profile details aligned.
 */
function ProfileInfoItem({ icon: Icon, label, value, s }: any) {
  return (
    <View style={styles.profileInfoItem}>
      <View style={[styles.profileInfoIconBox, { width: 24 * s, transform: [{ translateX: 18 * s }] }]}>
        <Icon size={30 * s} color="#000" />
      </View>

      <View style={styles.profileInfoTextBox}>
        <Text style={[styles.profileInfoLabel, { fontSize: 13 * s, transform: [{ translateX: 20 * s }] }]}>
          {label}
        </Text>
        <Text style={[styles.profileInfoValue, { fontSize: 16 * s, transform: [{ translateX: 20 * s }] }]}>
          {value}
        </Text>
      </View>
    </View>
  );
}

/**
 * Purpose: Maps an account role to a consistent profile and table badge.
 * How it works:
 * 1. Super-admin and standard-admin roles receive dedicated colors.
 * 2. Citizen users receive the default role presentation.
 * Technologies Used: TypeScript conditionals and React Native style objects.
 * Why this implementation: Visual role distinction supports faster privilege recognition.
 */
function roleColor(role: string) {
  if (role === "Admin") return { backgroundColor: "#C7DDFF", color: "#315BC9" };
  return { backgroundColor: "#BFEBC5", color: "#168A18" };
}

/**
 * Purpose: Maps report status values shown in account activity to semantic colors.
 * How it works:
 * 1. Pending, in-review, and resolved statuses select dedicated styles.
 * 2. Remaining statuses use the rejection style.
 * Technologies Used: TypeScript conditionals and React Native style objects.
 * Why this implementation: The same workflow meaning remains recognizable across modules.
 */
function statusColor(status: string) {
  if (status === "Pending") return { backgroundColor: "#FFF0B8", color: "#D99A00" };
  if (status === "In Review") return { backgroundColor: "#C7DDFF", color: "#315BC9" };
  return { backgroundColor: "#BFEBC5", color: "#168A18" };
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#ffffff" },

  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },

  pageTitle: {
    fontFamily: "Montserrat_700Bold",
    color: "#0B5A1E",
  },

  subtitle: {
    fontFamily: "Montserrat_700Bold",
    color: "#5D8A5F",
    marginTop: -4,
  },

  addButton: {
    backgroundColor: "#34733B",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  addButtonText: {
    fontFamily: "Montserrat_700Bold",
    color: "#fff",
  },

  cards: {
    flexDirection: "row",
    width: "100%",
  },

  filterPanel: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d6d6d6",
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    position: "relative",
    zIndex: 50,
    overflow: "visible",
  },

  searchBox: {
    flex: 1.1,
    height: 58,
    borderWidth: 1,
    borderColor: "#d6d6d6",
    borderRadius: 6,
    backgroundColor: "#f7f7f7",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
  },

  searchInput: {
    flex: 1,
    fontFamily: "Montserrat_700Bold",
    color: "#000",
    outlineStyle: "none" as any,
  },

  dropdownContainer: {
    flex: 1,
    position: "relative",
    zIndex: 20,
  },

  dropdownContainerOpen: {
    zIndex: 1000,
  },

  filterBox: {
    width: "100%",
    height: 58,
    borderWidth: 1,
    borderColor: "#d6d6d6",
    borderRadius: 6,
    backgroundColor: "#f7f7f7",
    justifyContent: "center",
    paddingHorizontal: 16,
  },

  filterLabel: {
    fontFamily: "Montserrat_700Bold",
    color: "#777",
    marginBottom: 5,
  },

  filterText: {
    fontFamily: "Montserrat_700Bold",
    color: "#000",
  },

  dropdownValueRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },

  dropdownSelectedText: {
    flex: 1,
  },

  dropdownArrow: {
    fontFamily: "Montserrat_700Bold",
    color: "#000",
    lineHeight: 18,
  },

  dropdownMenu: {
    position: "absolute",
    top: 62,
    left: 0,
    right: 0,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#cfcfcf",
    borderRadius: 6,
    overflow: "hidden",
    zIndex: 2000,
    elevation: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 10,
  },

  dropdownOption: {
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 11,
    backgroundColor: "#ffffff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },

  dropdownOptionBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "#ececec",
  },

  dropdownOptionSelected: {
    backgroundColor: "#EEF7EE",
  },

  dropdownOptionText: {
    flex: 1,
    fontFamily: "Montserrat_700Bold",
    color: "#111111",
  },

  dropdownOptionTextSelected: {
    color: "#34733B",
  },

  smallButton: {
    height: 36,
    minWidth: 82,
    borderWidth: 1,
    borderColor: "#34733B",
    borderRadius: 5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },

  buttonText: {
    fontFamily: "Montserrat_700Bold",
    color: "#34733B",
  },

  tablePanel: {
    borderWidth: 1,
    borderColor: "#d6d6d6",
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#fff",
    position: "relative",
    zIndex: 1,
  },

  table: { minWidth: 980 },
  tableFullWidth: { minWidth: "100%", width: "100%" },

  tableHeader: {
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#d6d6d6",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
  },

  tableRow: {
    borderBottomWidth: 1,
    borderBottomColor: "#d6d6d6",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
  },

  th: {
    fontFamily: "Montserrat_700Bold",
    color: "#000",
  },

  td: {
    fontFamily: "Montserrat_700Bold",
    color: "#000",
  },

  idCol: { flex: 0.8, minWidth: 90 },
  userCol: { flex: 1.8, minWidth: 200 },
  emailCol: { flex: 1.6, minWidth: 180 },
  roleCol: { flex: 1, minWidth: 120 },
  dateCol: { flex: 1.2, minWidth: 140 },
  actionCol: { flex: 1.4, minWidth: 180 },

  userInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  avatar: {
    backgroundColor: "#d9d9d9",
  },

  username: {
    fontFamily: "Montserrat_700Bold",
    color: "#555",
    marginTop: 2,
  },

  badgeWrap: {
    alignItems: "flex-start",
    justifyContent: "center",
  },

  badge: {
    alignSelf: "flex-start",
    borderRadius: 5,
    fontFamily: "Montserrat_700Bold",
    textAlign: "center",
    overflow: "hidden",
    flexGrow: 0,
    flexShrink: 0,
  },

  actionWrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  profileButton: {
    borderWidth: 1,
    borderColor: "#34733B",
    backgroundColor: "#F5FFF4",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },

  flagButton: {
    borderWidth: 1,
    borderColor: "#E53935",
    backgroundColor: "#FFF5F5",
    alignItems: "center",
    justifyContent: "center",
  },

  flaggedButton: {
    backgroundColor: "#f3464671",
  },

  disabledButton: {
    opacity: 0.35,
  },

  profileButtonText: {
    fontFamily: "Montserrat_700Bold",
    color: "#34733B",
  },

  paginationRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  showing: {
    fontFamily: "Montserrat_700Bold",
    color: "#000",
  },

  pagination: {
    fontFamily: "Montserrat_700Bold",
    color: "#34733B",
  },
  paginationButtons: {
    flexDirection: "row",
    gap: 5,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  paginationButton: {
    minWidth: 28,
    height: 28,
    borderWidth: 1,
    borderColor: "#a9b3a9",
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  paginationButtonActive: {
    backgroundColor: "#34733B",
    borderColor: "#34733B",
  },
  paginationTextActive: {
    color: "#ffffff",
  },
  activityPagination: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 5,
    marginTop: 14,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },

  profileModal: {
    width: "94%",
    maxWidth: 780,
    maxHeight: "92%",
    backgroundColor: "#fff",
    borderRadius: 14,
    position: "relative",
    overflow: "hidden",
  },

  adminProfileModal: {
    width: "96%",
    maxWidth: 1040,
    maxHeight: "92%",
    backgroundColor: "#fff",
    borderRadius: 14,
    position: "relative",
    overflow: "hidden",
  },

  editModal: {
    width: "92%",
    maxWidth: 600,
    maxHeight: "90%",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 28,
  },

  closeButton: {
    position: "absolute",
    top: 16,
    right: 20,
    zIndex: 10,
  },

  modalContent: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 44,
    paddingHorizontal: 12,
    gap: 28,
    alignItems: "flex-start",
  },

  modalLeft: {
    minWidth: 220,
    maxWidth: 280,
    flexGrow: 1,
    alignItems: "center",
    paddingBottom: 12,
  },

  modalRight: {
    flex: 1,
    minWidth: 280,
    paddingRight: 8,
  },

  profileAvatar: {
    backgroundColor: "#d9d9d9",
    alignItems: "center",
    justifyContent: "center",
  },

  avatarText: {
    fontFamily: "Montserrat_700Bold",
    color: "#777",
  },

  profileName: {
    fontFamily: "Montserrat_700Bold",
    color: "#000",
    marginTop: 14,
  },

  profileBadges: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
  },

  activeBadge: {
    backgroundColor: "#BFEBC5",
    color: "#168A18",
  },

  profileInfoGroup: {
    width: "92%",
    marginTop: 18,
    alignSelf: "center",
  },

  profileInfoItem: {
    width: "100%",
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: 14,
  },

  profileInfoIconBox: {
    alignItems: "center",
    marginTop: 2,
  },

  profileInfoTextBox: {
    flex: 1,
    marginLeft: 8,
  },

  profileInfoLabel: {
    fontFamily: "Montserrat_700Bold",
    color: "#000",
  },

  profileInfoValue: {
    fontFamily: "Montserrat_700Bold",
    color: "#000",
    marginTop: 2,
  },

  modalTabs: {
    flexDirection: "row",
    gap: 30,
    marginBottom: 16,
  },

  activeTab: {
    fontFamily: "Montserrat_700Bold",
    color: "#0B5A1E",
    borderBottomWidth: 2,
    borderBottomColor: "#0B5A1E",
    paddingBottom: 6,
  },

  inactiveTab: {
    fontFamily: "Montserrat_700Bold",
    color: "#000",
  },

  modalReportRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
  },

  smallImageBox: {
    backgroundColor: "#d9d9d9",
    borderRadius: 4,
  },

  modalReportTitle: {
    fontFamily: "Montserrat_700Bold",
    color: "#000",
  },

  modalDate: {
    fontFamily: "Montserrat_700Bold",
    color: "#000",
  },

  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 24,
  },

  editButton: {
    borderWidth: 1,
    borderColor: "#34733B",
    borderRadius: 5,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },

  editButtonText: {
    fontFamily: "Montserrat_700Bold",
    color: "#34733B",
  },

  flagUserButton: {
    borderWidth: 1,
    borderColor: "#FF3B3B",
    borderRadius: 5,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },

  flagUserText: {
    fontFamily: "Montserrat_700Bold",
    color: "#FF3B3B",
  },

  addAdminModal: {
    width: "96%",
    maxWidth: 960,
    maxHeight: "92%",
    backgroundColor: "#fff",
    borderRadius: 14,
    flexDirection: "row",
    flexWrap: "wrap",
    position: "relative",
    overflow: "hidden",
  },

addAdminLeft: {
  flexGrow: 1,
  flexBasis: "55%",
  minWidth: 300,
  paddingRight: 12,
},

addAdminRight: {
  flexGrow: 1,
  flexBasis: "35%",
  minWidth: 240,
  paddingLeft: 20,
  justifyContent: "center",
},

addAdminTitle: {
  fontFamily: "Montserrat_700Bold",
  color: "#000",
},

addAdminSubtitle: {
  fontFamily: "Montserrat_700Bold",
  color: "#000",
  marginTop: 8,
  lineHeight: 20,
},

formGrid: {
  flexDirection: "row",
  flexWrap: "wrap",
  gap: 12,
  marginTop: 18,
},

inputLabel: {
  fontFamily: "Montserrat_700Bold",
  color: "#000",
  marginBottom: 6,
},

inputBox: {
  width: 190,
  height: 34,
  borderWidth: 1,
  borderColor: "#bdbdbd",
  borderRadius: 4,
  paddingHorizontal: 10,
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
},

inputText: {
  fontFamily: "Montserrat_700Bold",
  color: "#000",
  outlineStyle: "none" as any,
},

helperText: {
  fontFamily: "Montserrat_700Bold",
  color: "#444",
  lineHeight: 18,
},

selectBox: {
  width: 190,
  height: 34,
  borderWidth: 1,
  borderColor: "#bdbdbd",
  borderRadius: 4,
  justifyContent: "center",
  paddingHorizontal: 10,
},

adminIllustration: {
  height: 150,
  alignItems: "center",
  justifyContent: "center",
},

featureItem: {
  flexDirection: "row",
  alignItems: "flex-start",
  gap: 8,
  marginTop: 12,
},

featureText: {
  flex: 1,
  fontFamily: "Montserrat_700Bold",
  color: "#000",
},

addAdminActions: {
  position: "absolute",
  right: 28,
  bottom: 24,
  flexDirection: "row",
  gap: 10,
},

cancelButton: {
  borderWidth: 1,
  borderColor: "#d6d6d6",
  borderRadius: 5,
  paddingHorizontal: 16,
  paddingVertical: 8,
},

cancelButtonText: {
  fontFamily: "Montserrat_700Bold",
  color: "#000",
},

createAdminButton: {
  backgroundColor: "#34733B",
  borderRadius: 5,
  paddingHorizontal: 16,
  paddingVertical: 8,
},

createAdminButtonText: {
  fontFamily: "Montserrat_700Bold",
  color: "#fff",
},

adminActivityRight: {
  flex: 1,
  paddingRight: 10,
},

activityHeader: {
  flexDirection: "row",
  borderBottomWidth: 1,
  borderBottomColor: "#d6d6d6",
  paddingBottom: 8,
  alignItems: "center",
},

activityRow: {
  flexDirection: "row",
  alignItems: "center",
  minHeight: 58,
  borderBottomWidth: 1,
  borderBottomColor: "#e6e6e6",
},

activityTh: {
  fontFamily: "Montserrat_700Bold",
  color: "#000",
},

activityTd: {
  fontFamily: "Montserrat_700Bold",
  color: "#000",
},

activityDateCol: {
  width: "17%",
},

activityActionCol: {
  width: "18%",
},

activityModuleCol: {
  width: "13%",
},

activityRecordCol: {
  width: "17%",
},

activityDetailsCol: {
  width: "24%",
},

activityViewCol: {
  width: "11%",
},

reportBadge: {
  backgroundColor: "#BFEBC5",
  color: "#168A18",
},

eventBadge: {
  backgroundColor: "#D7B9EA",
  color: "#6B168F",
},

activityViewButton: {
  width: "11%",
  borderWidth: 1,
  borderColor: "#34733B",
  backgroundColor: "#F5FFF4",
  borderRadius: 5,
  alignItems: "center",
  justifyContent: "center",
  paddingVertical: 5,
},

activityViewText: {
  fontFamily: "Montserrat_700Bold",
  color: "#34733B",
},
});