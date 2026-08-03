import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { auth, storage } from '@/config/firebase';

/** Uploads an event image to Firebase Storage and returns a download URL. */
export async function uploadAdminEventImage(localUri: string): Promise<string> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Sign in as an administrator to upload an event image.');
  }

  const response = await fetch(localUri);
  if (!response.ok) {
    throw new Error('Failed to read the selected image.');
  }

  const blob = await response.blob();
  if (blob.size > 5 * 1024 * 1024) {
    throw new Error('Image must be 5MB or smaller.');
  }

  const filePath = `events/${user.uid}/${Date.now()}_${Math.random().toString(36).slice(2, 10)}.jpg`;
  const storageRef = ref(storage, filePath);
  await uploadBytes(storageRef, blob, {
    contentType: blob.type || 'image/jpeg',
    customMetadata: {
      uploadedBy: user.uid,
      source: 'admin-web',
    },
  });

  return getDownloadURL(storageRef);
}
