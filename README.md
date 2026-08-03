<<<<<<< HEAD
=======
# capstone
capstone project
>>>>>>> 5f26cc0f900238e7d38c95ae6cb8fba3ca8078ee
# EcoBantay

Environmental reporting system for Valencia — citizen mobile app, admin web dashboard, and backend API.

## Project structure

| Folder | Description |
|--------|-------------|
| `ecobantay_app/` | Expo React Native app (Android / iOS) |
| `admin-web/` | Admin dashboard (Expo web) |
| `backend/` | Express API (admin creation, user deletion) |
| `firestore.rules` | Firestore security rules |
| `storage.rules` | Firebase Storage security rules |

## Setup

1. Copy each app’s `.env.example` to `.env` and add Firebase credentials.
2. Publish `firestore.rules` and `storage.rules` in Firebase Console.
3. Install dependencies in each folder:
   ```bash
   cd ecobantay_app && npm install
   cd ../admin-web && npm install
   cd ../backend && npm install
   ```
4. Start services:
   ```bash
   # Mobile app
   cd ecobantay_app && npx expo start

   # Admin web
   cd admin-web && npx expo start

   # Backend
   cd backend && npm start
   ```

## Notes

- Do not commit `.env` files or Firebase service account keys.
- Report images are stored in **Firebase Storage** (not Supabase).
<<<<<<< HEAD
=======

>>>>>>> 5f26cc0f900238e7d38c95ae6cb8fba3ca8078ee
