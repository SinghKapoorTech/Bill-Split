import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/config/firebase';

const FEEDBACK_COLLECTION = 'feedback';

interface SubmitFeedbackParams {
  userId: string;
  userName: string;
  userEmail: string;
  type: 'bug' | 'suggestion';
  message: string;
  files: File[];
}

async function uploadFeedbackImages(userId: string, files: File[]): Promise<string[]> {
  const urls: string[] = [];
  for (const file of files) {
    const fileName = `${Date.now()}-${file.name}`;
    const storageRef = ref(storage, `feedback/${userId}/${fileName}`);
    const snapshot = await uploadBytes(storageRef, file);
    const downloadURL = await getDownloadURL(snapshot.ref);
    urls.push(downloadURL);
  }
  return urls;
}

export async function submitFeedback({
  userId,
  userName,
  userEmail,
  type,
  message,
  files,
}: SubmitFeedbackParams): Promise<void> {
  const imageUrls = files.length > 0
    ? await uploadFeedbackImages(userId, files)
    : [];

  await addDoc(collection(db, FEEDBACK_COLLECTION), {
    userId,
    userName,
    userEmail,
    type,
    message,
    imageUrls,
    createdAt: serverTimestamp(),
    status: 'new',
  });
}
