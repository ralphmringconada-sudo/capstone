# EcoBantay — How the Code Works
### Full feature explanation (Mobile + Admin + Firebase + Backend)

Use this when explaining your system. Each feature shows: **what it does → how the code runs → where data is stored**.

---

## 1. System overview

EcoBantay has **3 apps + 1 cloud**:

| Part | Folder | Who uses it |
|------|--------|-------------|
| Mobile citizen app | `ecobantay_app/` | Residents |
| Admin website | `admin-web/` | Admin / Super Admin |
| Backend API | `backend/` | Trusted delete / create admin |
| Cloud | Firebase | Auth, Firestore, Storage |

```
Citizen phone ──► Firebase Auth + Firestore + Storage
Admin browser ──► Firebase Auth + Firestore + Storage
                     └──► Backend (Admin SDK) for delete / create admin
```

**Collections (Firestore):**
- `users` → citizen profiles  
- `admins` → admin / super admin profiles + role  
- `reports` → environmental reports  
- `events` → cleanup events  
- `events/{id}/participants` → who joined  
- `admin_activity_logs` → admin audit trail  

**Storage:**
- `reports/{uid}/photo.jpg`  
- `events/{uid}/photo.jpg`  

---

# PART A — MOBILE APP (Citizen)

---

## A1. Register (email)

**File:** `ecobantay_app/src/services/authService.ts` → `registerWithEmail`

**How it works:**
1. User fills first name, last name, email, contact, birthday, password  
2. App calls Firebase: `createUserWithEmailAndPassword` → creates Auth identity + UID  
3. App builds a profile object (`authProvider: 'email'`)  
4. App writes Firestore: `users/{uid}`  
5. If Firestore fails → delete the Auth user (rollback) so no broken account remains  
6. `AuthContext` stores the profile → user is logged in  

**Stored in:** Firebase Auth + Firestore `users`

```typescript
// 1) Create login identity in Firebase Authentication
const credential = await createUserWithEmailAndPassword(auth(), email, password);

// 2) Build the citizen profile using the new UID
const profile = {
  uid: credential.user.uid,          // same ID as Auth
  firstName, lastName, email,        // form fields
  contactNumber, birthday,
  authProvider: 'email',             // marks how they signed up
  createdAt: new Date().toISOString(),
};

// 3) Save profile in Firestore under users/{uid}
await setDoc(doc(db, 'users', profile.uid), profile);

// 4) If step 3 fails, delete Auth user so data stays consistent
```

---

## A2. Login (email) + block admins

**Files:** `loginWithEmail`, `assertNotAdminAccount`, `AuthContext`

**How it works:**
1. Normalize email → `signInWithEmailAndPassword`  
2. Check `admins/{uid}` — if it exists → **sign out** (admin must use website)  
3. Load `users/{uid}` — if missing → sign out  
4. Put profile into `AuthContext`  

```typescript
// Login to Firebase Auth
const credential = await signInWithEmailAndPassword(auth(), email, password);

// Block admin accounts from mobile
const adminSnap = await getDoc(doc(db, 'admins', credential.user.uid));
if (adminSnap.exists()) {
  await signOut(auth()); // force out
  throw new Error('Admin accounts must use the EcoBantay Admin website...');
}

// Require citizen profile
const profile = await getUserProfile(credential.user.uid);
if (!profile) {
  await signOut(auth());
  throw new Error('Profile was not found...');
}
return profile; // success → AuthContext.setUser(profile)
```

**Why:** Same Firebase project for both apps, but **role separation** keeps admins off mobile.

---

## A3. Session restore (app open)

**File:** `ecobantay_app/src/context/AuthContext.tsx`

**How it works:**
1. Firebase fires `onAuthStateChanged` (still logged in from last time?)  
2. If no user → show login  
3. If user → again run `assertNotAdminAccount` + load `users/{uid}`  
4. Missing/admin → sign out  

```typescript
onAuthStateChanged(auth, async (firebaseUser) => {
  if (!firebaseUser) {
    setUser(null);           // logged out
    return;
  }
  await assertNotAdminAccount(firebaseUser.uid); // admin? kick out
  const profile = await getUserProfile(firebaseUser.uid);
  if (!profile) {
    await signOut(auth);
    setUser(null);
  } else {
    setUser(profile);        // citizen session ready
  }
});
```

---

## A4. Forgot password / change password

**Forgot:** `sendForgotPasswordEmail`  
→ only Firebase Auth `sendPasswordResetEmail`  
→ link goes to **email inbox** (not Firestore)

**Change password (settings):** `changeUserPassword`  
1. Reauthenticate with current password  
2. `updatePassword` in Firebase Auth  
3. **Does NOT** write an event or report  

---

## A5. Create report

**Files:** `reportService.ts` → `submitReport`, `firebaseStorageService.ts` → `uploadReportImage`

**How it works:**
1. Citizen takes photo + fills category, description, barangay, GPS  
2. Upload photo to Storage: `reports/{uid}/{timestamp}.jpg` → get URL  
3. Create Firestore doc in `reports` with `status: 'Pending'`  
4. Appears on user’s list under Pending  

```typescript
// 1) Upload proof image first (so report never points to a missing photo)
const imageUrl = await uploadReportImage(input.imageUri, input.user.uid);

// 2) Build report metadata
const reportData = {
  title: input.categoryName,
  description: input.description.trim(),
  location: ...,
  reportedByUid: input.user.uid,     // owner
  reportedByName: `${firstName} ${lastName}`,
  status: 'Pending',                 // waiting for admin
  images: [imageUrl],
  coordinates: input.coordinates,    // GPS proof
  createdAt: new Date().toISOString(),
};

// 3) Save to Firestore
const docRef = await addDoc(collection(db, 'reports'), reportData);
return docRef.id;
```

**Stored in:** Storage `reports/{uid}/...` + Firestore `reports/{id}`

---

## A6. View / edit / delete own report

| Function | What it does |
|----------|----------------|
| `fetchUserReports(uid)` | Query `reportedByUid == uid` |
| `fetchReportById(id, uid)` | Load one; hide if not owner |
| `updateReportDescription` | Owner can change text only |
| `deleteUserReport` | Owner deletes Firestore doc |

Evidence and status are protected — citizen cannot fake “Resolved”.

---

## A7. Create event (citizen)

**File:** `eventService.ts` → `submitEvent`

**How it works:**
1. Optional image → Storage `events/{uid}/...`  
2. Write `events` doc with `status: 'Pending'`, `participants: 0`  
3. Admin must accept before others can join  

```typescript
const eventData = {
  title, description, category, date, time, location,
  status: 'Pending',              // not joinable yet
  participants: 0,
  capacity: Math.max(1, capacity),
  submittedByUid: input.user.uid, // owner
  imageUrl,
  createdAt: now,
};
await addDoc(collection(db, 'events'), eventData);
```

---

## A8. Join / leave event

**Functions:** `joinEvent`, `leaveEvent`

**How it works (join):**
1. Open accepted event (`Upcoming` or `Ongoing`)  
2. Firestore **transaction** (atomic = safe against race conditions)  
3. Check not full, not already joined  
4. Write `events/{id}/participants/{uid}`  
5. Increment `participants` by 1  

```typescript
await runTransaction(db, async (tx) => {
  const eventSnap = await tx.get(eventRef);
  const data = eventSnap.data();

  // Only accepted events
  if (data.status !== 'Upcoming' && data.status !== 'Ongoing') {
    throw new Error('Only accepted events can be joined.');
  }
  // Capacity check
  if (data.participants >= data.capacity) {
    throw new Error('This event is already full.');
  }
  // Already joined?
  if ((await tx.get(participantRef)).exists()) {
    throw new Error('You already joined this event.');
  }

  // Save participant + bump counter together
  tx.set(participantRef, { uid, name, email, joinedAt: now });
  tx.update(eventRef, { participants: data.participants + 1 });
});
```

**Leave:** delete participant doc + decrement counter (same transaction style).

---

## A9. Home event tabs

**File:** `eventStatus.ts` → `USER_EVENT_TABS`

Tabs: **ALL / PENDING / ACCEPTED** only (Rejected hidden).

- PENDING → user’s own pending submissions  
- ACCEPTED → Upcoming / Ongoing / Completed  
- ALL → accepted + own pending  

---

# PART B — ADMIN WEB

---

## B1. Admin login → Dashboard

**Files:** `AdminAuthContext.tsx`, `AdminRouteGuard.tsx`, `LoginScreen.tsx`

**How it works:**
1. Email + password → Firebase Auth  
2. Load `admins/{uid}`  
3. Must exist and `status === 'active'`  
4. Citizen-only Auth accounts → signed out (“not authorized”)  
5. `router.replace('/dashboard')`  

```typescript
const credential = await signInWithEmailAndPassword(auth, email, password);
const profile = await getAdminProfile(credential.user.uid);

if (!profile) {
  await signOut(auth);
  throw new Error('This account is not authorized for admin access.');
}
if (profile.status !== 'active') {
  await signOut(auth);
  throw new Error('This admin account is inactive.');
}
setAdmin(profile); // isSuperAdmin = role === 'super_admin'
```

**Browser Back security (`AdminRouteGuard`):**  
After entering a protected page, if Back returns to login → **auto logout** → must sign in again.

---

## B2. Admin forgot password

**Function:** `sendAdminPasswordReset`

**How it works:** Auth only — `sendPasswordResetEmail`  
(No Firestore query while logged out — that caused “Missing permissions”.)

---

## B3. Moderate report (In Review / Resolved / Rejected)

**Function:** `updateReportStatus`

**How it works:**
1. Admin confirms popup (“Mark as In Review?”)  
2. Update `reports/{id}.status`  
3. Append to `statusHistory` (timeline dots match status color)  
4. Write `admin_activity_logs`  
5. Success popup  

```typescript
// History entry for the timeline
const historyEntry = {
  status,                    // e.g. "In Review"
  at: now,
  by: admin.uid,
  byName: admin.fullName,
  remarks: details,          // "Marked report as in review"
};

batch.update(reportRef, {
  status,
  updatedAt: now,
  statusHistory: arrayUnion(...seedPending, historyEntry),
});
batch.set(activityRef, {
  action: 'Updated Report Status',
  module: 'Reports',
  ...
});
await batch.commit(); // both writes succeed or both fail
```

**Delete report:** removed from UI (no trash / no delete button).

---

## B4. Moderate event (Approve / Reject / Complete)

**Function:** `updateEventStatus`

**How it works:**
1. Change `events/{id}.status`  
   - Approve pending → `Upcoming`  
   - Reject → `Rejected`  
   - Ongoing / Completed as needed  
2. Log in `admin_activity_logs`  
3. When `Upcoming`/`Ongoing` → mobile users can **join**  

---

## B5. Users management (role rules)

| Who | Can see | Can edit |
|-----|---------|----------|
| Regular Admin | Citizens only | View only (no edit) |
| Super Admin | Users + Admins | Edit users & standard admins |

**How code enforces it:**
```typescript
// Table: regular admin → citizen rows only
if (!isSuperAdmin) return citizenRows;

// Edit button: super admin only
const canManageSelected =
  Boolean(selectedUser) &&
  isSuperAdmin &&
  (isSelectedCitizen || isSelectedStandardAdmin);
```

**Create admin (super admin):** secondary Firebase Auth app creates credentials without logging out the super admin → write `admins/{uid}` with `role: 'admin'`.

**Password reset for admin:** Super Admin → Send Password Reset Email → Firebase inbox link.

---

## B6. Date range filters

**Files:** `DateRangeFilter.tsx`, `dateRange.ts`

**How it works:**
1. Admin picks From / To (`YYYY-MM-DD`)  
2. `isWithinDateRange(createdAt, from, to)` keeps rows inside that range  
3. Reset clears dates + other filters  

- Users → registration date  
- Reports → date reported  
- Events → event date (fallback: createdAt)  

---

## B7. Tables on small screens

Users & Reports wrap the table in:

```tsx
<ScrollView horizontal={width < 1100}>
  <View style={{ minWidth: 980 }}>...</View>
</ScrollView>
```

→ sideways scroll like Events; layout does not break when minimized.

---

# PART C — BACKEND (trusted actions)

## C1. Create admin — `POST /api/admins/create`

1. `verifySuperAdmin` checks Bearer token + `admins` role  
2. Admin SDK `createUser`  
3. Write `admins/{uid}`  
4. Activity log  
5. Rollback Auth if Firestore fails  

## C2. Delete account — `DELETE /api/users/:userId`

1. `verifyAdmin`  
2. Cannot delete yourself  
3. Deleting an admin → must be super admin; cannot delete another super admin  
4. Delete Firestore profile(s) + Auth user  
5. Activity log  

---

# PART D — Role separation (explain this clearly)

| Rule | How code enforces it |
|------|----------------------|
| Admin cannot use mobile | `assertNotAdminAccount` on login + session restore |
| Citizen cannot use admin web | `getAdminProfile` required; else sign out |
| Super Admin sees all users/admins | Users screen merges `admins` + `users` |
| Regular Admin sees citizens only | `if (!isSuperAdmin) return citizenRows` |
| Only Super Admin edits users | `canManageSelected` requires `isSuperAdmin` |
| Join only accepted events | `status === 'Upcoming' \|\| 'Ongoing'` |

---

# PART E — End-to-end demo flow (2–3 minutes)

1. **Mobile register/login** → Auth + `users`  
2. **Create report** → photo Storage + `reports` Pending  
3. **Admin login** → Dashboard (citizen cannot enter)  
4. **Mark report In Review** → confirm popup → history + activity log  
5. **Citizen creates event** → Pending  
6. **Admin sets Upcoming** → accepted  
7. **Another citizen joins** → `participants` + counter  
8. **Forgot password** → email link (Auth only)  
9. **Browser Back on admin** → logout  

---

# PART F — “Where is it stored?” cheat sheet

| Action | Storage |
|--------|---------|
| Login identity | Firebase Auth |
| Citizen profile | Firestore `users` |
| Admin role/profile | Firestore `admins` |
| Report data | Firestore `reports` |
| Report photo | Storage `reports/{uid}/...` |
| Event data | Firestore `events` |
| Event photo | Storage `events/{uid}/...` |
| Join list | `events/{id}/participants` |
| Admin audit | `admin_activity_logs` |
| Password / reset | Firebase Auth **only** |

---

## Source files (open these if asked for code)

**Mobile**
- `ecobantay_app/src/services/authService.ts`
- `ecobantay_app/src/services/reportService.ts`
- `ecobantay_app/src/services/eventService.ts`
- `ecobantay_app/src/context/AuthContext.tsx`

**Admin**
- `admin-web/src/services/adminDataService.ts`
- `admin-web/src/context/AdminAuthContext.tsx`
- `admin-web/src/components/AdminRouteGuard.tsx`
- `admin-web/src/screens/UsersScreen.tsx`
- `admin-web/src/screens/ReportsScreen.tsx`
- `admin-web/src/screens/ReportDetailsScreen.tsx`
- `admin-web/src/screens/EventsScreen.tsx`

**Backend / rules**
- `backend/src/routes/admins.js`
- `backend/src/routes/users.js`
- `firestore.rules`

---

*This document explains how EcoBantay’s feature code works for defense and demo. The live source of truth is the TypeScript/JavaScript in the folders above.*
