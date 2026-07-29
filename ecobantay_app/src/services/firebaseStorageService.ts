import { File } from 'expo-file-system';
import { fetch as expoFetch } from 'expo/fetch';
import { getDownloadURL, ref, uploadString } from 'firebase/storage';
import { Platform } from 'react-native';
import { firebaseConfig } from '@/config/firebaseConfig';
import { getAuthInstance, getStorageInstance } from '@/config/firebase';

type StorageUploadResponse = {
  name: string;
  bucket: string;
  downloadTokens?: string;
};

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
}

function buildDownloadUrl(bucket: string, objectName: string, downloadToken?: string): string {
  const encodedName = encodeURIComponent(objectName);
  if (downloadToken) {
    return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodedName}?alt=media&token=${downloadToken}`;
  }
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodedName}?alt=media`;
}

function formatStorageError(error: unknown): string {
  const firebaseError = error as {
    code?: string;
    message?: string;
    customData?: { serverResponse?: string };
  };

  const code = firebaseError.code ?? 'storage/unknown';
  const message = firebaseError.message ?? 'Unknown Firebase Storage error.';
  const serverResponse = firebaseError.customData?.serverResponse;

  return [
    `Image upload failed (${code}).`,
    message,
    serverResponse ? `Server: ${serverResponse}` : null,
    code === 'storage/unknown' || code === 'storage/unknown-error'
      ? 'Publish EcoBantay/storage.rules in Firebase Console and confirm Storage is enabled.'
      : null,
  ]
    .filter(Boolean)
    .join(' ');
}

const uploadMetadata = (userId: string) => ({
  contentType: 'image/jpeg' as const,
  customMetadata: {
    uploadedBy: userId,
    storageProvider: 'firebase',
  },
});

/**
 * Native upload via Storage REST API — avoids Firebase JS SDK Blob usage on React Native.
 */
async function uploadNativeImageViaRest(localUri: string, filePath: string): Promise<string> {
  const currentUser = getAuthInstance().currentUser;
  if (!currentUser) {
    throw new Error('You must be signed in to upload a report image.');
  }

  const bucket = firebaseConfig.storageBucket;
  if (!bucket) {
    throw new Error('Firebase Storage is not configured.');
  }

  const file = new File(localUri);
  const info = file.info();
  if (!info.exists || !info.size) {
    throw new Error('Photo file is missing or empty. Please take the proof photo again.');
  }

  const token = await currentUser.getIdToken();
  const uploadUrl =
    `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket)}/o` +
    `?uploadType=media&name=${encodeURIComponent(filePath)}`;

  const response = await expoFetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Firebase ${token}`,
      'Content-Type': 'image/jpeg',
    },
    body: file,
  });

  if (!response.ok) {
    const serverMessage = await response.text();
    if (response.status === 404) {
      throw new Error(
        `Firebase Storage bucket "${bucket}" was not found. Enable Storage in Firebase Console.`,
      );
    }
    throw new Error(`Firebase Storage rejected the image (${response.status}). ${serverMessage}`);
  }

  const result = (await response.json()) as StorageUploadResponse;
  return buildDownloadUrl(result.bucket || bucket, result.name, result.downloadTokens);
}

/** Web upload uses Firebase SDK — Blob is supported in browsers. */
async function uploadWebImage(localUri: string, filePath: string, userId: string): Promise<string> {
  const response = await fetch(localUri);
  if (!response.ok) {
    throw new Error('Failed to read image for upload.');
  }

  const storageRef = ref(getStorageInstance(), filePath);
  const base64 = bytesToBase64(new Uint8Array(await response.arrayBuffer()));
  await uploadString(storageRef, base64, 'base64', uploadMetadata(userId));
  return getDownloadURL(storageRef);
}

export async function uploadReportImage(localUri: string, userId: string): Promise<string> {
  const currentUser = getAuthInstance().currentUser;
  if (!currentUser) {
    throw new Error('You must be signed in to upload a report image.');
  }

  try {
    const filePath = `reports/${userId}/${Date.now()}_${Math.random().toString(36).slice(2, 10)}.jpg`;

    if (Platform.OS === 'web') {
      return uploadWebImage(localUri, filePath, userId);
    }

    // uploadString/uploadBytes in the Firebase web SDK still hit Blob errors on native.
    return uploadNativeImageViaRest(localUri, filePath);
  } catch (error) {
    if (error instanceof Error && !('code' in error)) {
      throw error;
    }
    throw new Error(formatStorageError(error));
  }
}
