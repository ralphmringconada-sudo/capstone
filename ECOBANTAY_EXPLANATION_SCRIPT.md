# EcoBantay — Function Explanation Script
### Use this when explaining how the system works (defense / demo)

**How to use:** Read the “Say” lines out loud. The “Comment” lines are your deeper explanation if the panel asks “how does that work?” or “where is it stored?”

---

## 0. Big picture (open with this)

**Say:**  
EcoBantay has three parts: a mobile app for citizens, an admin website for LGU staff, and Firebase for Auth, Firestore database, and image Storage. Admins and citizens use the same Firebase project but different collections and rules, so they cannot log into each other’s apps.

**Comment — storage map:**
- Firebase Authentication → email/password (and optional Google) identities
- Firestore `users` → citizen profiles
- Firestore `admins` → admin / super admin profiles and roles
- Firestore `reports` → waste/environment reports
- Firestore `events` → cleanup events + status
- Firestore `events/{eventId}/participants` → who joined an event
- Firestore `admin_activity_logs` → admin audit trail
- Firebase Storage `reports/{uid}/...` and `events/{uid}/...` → photos

---

# PART A — MOBILE APP (Citizen)

---

## A1. Register with email — `registerWithEmail`

**Say:** When a citizen registers, we create a Firebase Auth account, then save their profile in Firestore under `users`.

**Line-by-line process:**
1. // User enters first name, last name, email, contact, birthday, password  
2. // App validates the form (email format + password rules)  
3. // `createUserWithEmailAndPassword` creates the login identity in Firebase Auth  
4. // We build a profile object (trimmed names, formatted birthday, `authProvider: 'email'`)  
5. // `setDoc` writes that profile to Firestore path `users/{uid}`  
6. // If the Firestore write fails, we delete the Auth user so we don’t leave a broken account  
7. // AuthContext stores the profile in app state so the user is logged in  

**Stored where:** Firebase Auth + Firestore `users/{uid}`  
**Fields:** `uid`, `firstName`, `lastName`, `email`, `contactNumber`, `birthday`, `authProvider`, `createdAt`

---

## A2. Login with email — `loginWithEmail` + `assertNotAdminAccount`

**Say:** Login checks Firebase credentials, then blocks admin accounts from the mobile app, then requires a citizen profile.

**Line-by-line process:**
1. // Normalize email (trim + lowercase)  
2. // `signInWithEmailAndPassword` authenticates with Firebase Auth  
3. // `assertNotAdminAccount` reads Firestore `admins/{uid}`  
4. // If that admin document exists → sign out and show “use the Admin website”  
5. // Load `users/{uid}` with `getUserProfile`  
6. // If no citizen profile → sign out (login alone is not enough)  
7. // AuthContext keeps the profile for the rest of the app  

**Stored where:** Auth session (temporary); reads `admins` and `users`  
**Who blocked:** Anyone with a document in `admins`

---

## A3. Session restore — `AuthProvider` / `onAuthStateChanged`

**Say:** When the app opens, Firebase restores the previous session. We re-check that the account is a citizen, not an admin.

**Line-by-line process:**
1. // Firebase fires `onAuthStateChanged` with the current user (or null)  
2. // If null → clear app user state (logged out)  
3. // If user exists → run `assertNotAdminAccount` again  
4. // Load `users/{uid}`  
5. // Missing profile or admin account → sign out / clear state  
6. // Otherwise set `user` in context and stop the loading screen  

**Why:** So an admin who somehow has a device session cannot enter the citizen home screen.

---

## A4. Forgot password (mobile) — `sendForgotPasswordEmail`

**Say:** Forgot password only talks to Firebase Authentication. It does not write to Firestore.

**Line-by-line process:**
1. // User enters email on Forgot Password screen  
2. // Validate email format  
3. // Call `sendPasswordResetEmail`  
4. // Firebase emails a reset link to that inbox  
5. // User opens the link in a browser and sets a new password  

**Stored where:** Firebase Auth reset token/email only (no Firestore write)  
**Where user sees the link:** Email inbox (check Spam)

---

## A5. Change password (settings) — `changeUserPassword`

**Say:** Changing password inside the app updates Firebase Auth only. It does not create an event or report.

**Line-by-line process:**
1. // Require signed-in email/password account (not Google-only)  
2. // Reauthenticate with the current password (proves ownership)  
3. // `updatePassword` saves the new password in Firebase Auth  
4. // Show success alert  

**Stored where:** Firebase Auth credentials only

---

## A6. Update profile — `updateUserProfile`

**Say:** Citizens can edit name, contact, and birthday. Email/UID stay the same.

**Line-by-line process:**
1. // Require Auth current user  
2. // Confirm `users/{uid}` exists  
3. // `updateDoc` only allowed fields + `updatedAt`  
4. // Refresh AuthContext profile  

**Stored where:** Firestore `users/{uid}`

---

## A7. Create report — `submitReport` + `uploadReportImage`

**Say:** A report stores proof photo in Storage, then metadata in Firestore as Pending.

**Line-by-line process:**
1. // Citizen fills title, description, category, location, GPS, photo  
2. // `uploadReportImage` uploads the photo to Storage path `reports/{uid}/{timestamp}.jpg`  
3. // Firebase returns a download URL  
4. // App builds report data with `status: 'Pending'` and reporter identity  
5. // `addDoc` creates a new document in Firestore `reports`  
6. // Report appears on the user’s home/list under Pending  

**Stored where:**  
- Storage: `reports/{uid}/...`  
- Firestore: `reports/{reportId}` (`title`, `description`, `status`, `reportedByUid`, images, coordinates, timestamps, etc.)

---

## A8. View / edit / delete own report

**Say:** Citizens only manage their own reports. Admins can see all later on the website.

**Functions:**
- `fetchUserReports(uid)` // query reports where `reportedByUid == uid`  
- `fetchReportById` // load one doc; optional ownership check  
- `updateReportDescription` // owner can change text only  
- `deleteUserReport` // owner deletes the Firestore doc  

**Stored where:** Firestore `reports` (image file in Storage may remain after delete)

---

## A9. Create event — `submitEvent` + `uploadEventImage`

**Say:** Citizen-submitted events start as Pending until an admin accepts them.

**Line-by-line process:**
1. // Fill title, description, category, date, time, location, capacity, optional image  
2. // Optional: upload image to Storage `events/{uid}/...`  
3. // Build event with `status: 'Pending'` and `participants: 0`  
4. // Save submitter name/area/uid on the document  
5. // `addDoc` into Firestore `events`  

**Stored where:** Storage (optional) + Firestore `events/{eventId}`  
**Important:** Pending events are not joinable yet.

---

## A10. Join / leave event — `joinEvent` / `leaveEvent`

**Say:** After admin accepts an event (status Upcoming or Ongoing), citizens can join. We use a transaction so capacity stays correct.

**Join — line-by-line:**
1. // Open View Event → press Join  
2. // Start Firestore transaction  
3. // Read the event document  
4. // Allow only if status is `Upcoming` or `Ongoing`  
5. // Reject if `participants >= capacity` (full)  
6. // Reject if `events/{id}/participants/{uid}` already exists  
7. // Create participant doc: uid, name, email, joinedAt  
8. // Increment event `participants` by 1  
9. // Commit transaction  

**Leave — line-by-line:**
1. // Press Leave  
2. // Transaction reads event + participant  
3. // Delete `participants/{uid}`  
4. // Decrement `participants` (never below 0)  

**Stored where:**  
- `events/{eventId}/participants/{uid}`  
- updated counter on `events/{eventId}.participants`

---

## A11. Event tabs on home (ALL / PENDING / ACCEPTED)

**Say:** On the user side we only show ALL, PENDING, and ACCEPTED. Rejected is hidden so citizens don’t need that tab.

**Comment:**
- PENDING → user’s own pending submissions  
- ACCEPTED → Upcoming / Ongoing / Completed  
- ALL → accepted events + user’s pending (rejected filtered out)

---

## A12. Logout / delete account

**Logout `logoutUser`:**  
1. // `signOut` Firebase Auth  
2. // Clear AuthContext user  

**Delete `deleteUserAccount`:**  
1. // Reauthenticate if email account  
2. // Delete user’s reports from Firestore  
3. // Delete `users/{uid}`  
4. // Delete Auth user  

---

# PART B — ADMIN WEB

---

## B1. Admin login — `AdminAuthProvider.login`

**Say:** Admin login needs both Firebase Auth success AND an active document in `admins`. Ordinary citizens cannot enter the admin site.

**Line-by-line process:**
1. // Enter admin email + password  
2. // `signInWithEmailAndPassword`  
3. // `getAdminProfile(uid)` reads `admins/{uid}`  
4. // If no admin profile → sign out → “not authorized for admin access”  
5. // If `status !== 'active'` → sign out → inactive message  
6. // Save admin profile in context  
7. // `isSuperAdmin` is true when `role === 'super_admin'`  

**Stored where:** Auth session + Firestore `admins/{uid}`  
**Role separation:** Citizens without an `admins` doc are signed out on restore too.

---

## B2. Admin forgot password — `sendAdminPasswordReset`

**Say:** Admin forgot password also uses Firebase Auth email only. We do not query Firestore while logged out (that caused “Missing or insufficient permissions”).

**Line-by-line process:**
1. // Enter email in forgot-password modal  
2. // `sendPasswordResetEmail`  
3. // Check inbox for Firebase reset link  
4. // Set new password in the browser page  

**Stored where:** Firebase Auth only

---

## B3. Super admin resets another admin password — `sendAdminPasswordResetForAdmin`

**Say:** From Users → Edit Admin, a super admin can send a reset email to a standard admin.

**Line-by-line:**
1. // Confirm actor is `super_admin`  
2. // Load target from `admins/{adminId}`  
3. // Block resetting another super admin  
4. // Send Firebase reset email to target email  
5. // Write an entry to `admin_activity_logs`  

---

## B4. Load dashboard data

**Say:** Admin screens load lists from Firestore.

| Function | Reads |
|----------|--------|
| `fetchAppUsers` | `users` |
| `fetchAdmins` | `admins` |
| `fetchReports` | `reports` |
| `fetchEvents` | `events` |
| `fetchEventParticipants` | `events/{id}/participants` |
| `fetchActivityLogs` | `admin_activity_logs` |

**Visibility rule (Users screen):**
- Regular admin → citizen users only (no other admins / no super admin row)  
- Super admin → users + admins + can open admin activity logs  

---

## B5. Moderate a report — `updateReportStatus`

**Say:** Admin changes report status (Pending → In Review / Resolved / Rejected). We keep a status history for the timeline.

**Line-by-line process:**
1. // Open report details  
2. // Choose new status (+ optional remarks)  
3. // Batch write: update `status`, `updatedAt`  
4. // `arrayUnion` a new item into `statusHistory` (status, at, by, byName, remarks)  
5. // Create `admin_activity_logs` entry (module: Reports)  

**Stored where:** Firestore `reports/{id}` + `admin_activity_logs`

---

## B6. Moderate an event — `updateEventStatus`

**Say:** Approving a pending event means changing status to Upcoming (or Ongoing). Rejecting sets Rejected. Completing sets Completed.

**Line-by-line process:**
1. // Admin selects event  
2. // Pick new status  
3. // Update `events/{id}.status` + `updatedAt`  
4. // Log action in `admin_activity_logs` (module: Events)  
5. // Once Upcoming/Ongoing, mobile users can join  

---

## B7. Create admin (super admin) — `createAdminAccount`

**Say:** Only a super admin can create a standard administrator.

**Line-by-line process:**
1. // Super admin fills full name, email, contact, username, password  
2. // Create Auth user (secondary Firebase app so the super admin stays logged in)  
3. // Write Firestore `admins/{uid}` with `role: 'admin'`, `status: 'active'`  
4. // Log activity  
5. // On failure, roll back Auth/Firestore  

**Stored where:** Firebase Auth + Firestore `admins` + activity log  

**Backend alternative:** `POST /api/admins/create` with Bearer token (Admin SDK) does the same privilege-safe create.

---

## B8. Edit / flag / delete accounts

**Edit citizen:** `updateAppUserProfile` → updates `users` + audit log  
**Edit admin:** `updateAdminProfileInfo` → updates `admins` + audit log  
**Flag:** `setAccountFlag` → sets `isFlagged`, `flaggedAt`, `flaggedBy` on user or admin  
**Delete:** `DELETE /api/users/:userId` (backend)  
1. // Verify caller is admin (Bearer token)  
2. // Cannot delete yourself  
3. // Deleting an admin requires super admin; cannot delete another super admin  
4. // Delete Firestore profile(s)  
5. // Delete Firebase Auth user  
6. // Write activity log  

---

## B9. Admin change own password — `changeAdminPassword`

**Line-by-line:**
1. // Reauthenticate with current password  
2. // `updatePassword` in Firebase Auth  
3. // No Firestore write required for the password itself  

---

# PART C — SECURITY / RULES (good closing topic)

**Say:** Firestore rules enforce who can read and write each collection.

**Key ideas to explain:**
1. // Signed-in citizens can create their own reports and pending events  
2. // Only owners (or admins) can update/delete those records  
3. // Join/leave only allowed on Upcoming/Ongoing events, and only for your own participant doc  
4. // Admin activity logs: admins write; super admin can read all; regular admin reads own  
5. // Storage: users upload only under their own `reports/{uid}` or `events/{uid}` folder  
6. // Role separation is double-checked in app code AND in rules/backend  

---

# PART D — Short demo script (2–3 minutes)

1. **Mobile register/login** → show Auth + `users` profile  
2. **Create report** → photo goes to Storage, doc to `reports` as Pending  
3. **Admin login** → show citizen cannot use this site  
4. **Admin updates report status** → show history + activity log  
5. **Citizen creates event** → Pending  
6. **Admin accepts event** → Upcoming  
7. **Another citizen joins** → participant subcollection + counter  
8. **Forgot password** → email link from Firebase (Auth only)  
9. **Admin blocked on mobile / user blocked on admin web** → role separation  

---

# Quick “Where is it stored?” cheat sheet

| Action | Storage |
|--------|---------|
| Register / login identity | Firebase Auth |
| Citizen profile | Firestore `users` |
| Admin profile / role | Firestore `admins` |
| Report metadata | Firestore `reports` |
| Report photo | Storage `reports/{uid}/...` |
| Event metadata | Firestore `events` |
| Event photo | Storage `events/{uid}/...` |
| Event join list | Firestore `events/{id}/participants` |
| Admin audit trail | Firestore `admin_activity_logs` |
| Password / reset | Firebase Auth only (not Firestore) |

---

*Generated for EcoBantay capstone explanation. Source of truth remains the code in `ecobantay_app/src/services`, `admin-web/src/services`, `backend/src/routes`, and `firestore.rules`.*
