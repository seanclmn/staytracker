import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  setDoc,
  onSnapshot,
  updateDoc,
  deleteField,
  type Unsubscribe,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

const DAYS_DOC = 'days';
const COLLECTION = 'staytracker';

export type DayStatus = 'japan';

export function subscribeToDays(
  onData: (days: Record<string, DayStatus>) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const ref = doc(db, COLLECTION, DAYS_DOC);
  return onSnapshot(
    ref,
    (snap) => {
      const data = snap.data();
      const days = (data?.days as Record<string, string> | undefined) ?? {};
      const out: Record<string, DayStatus> = {};
      for (const [k, v] of Object.entries(days)) {
        if (v === 'japan') out[k] = 'japan';
      }
      onData(out);
    },
    (err) => onError?.(err)
  );
}

export async function setDayStatus(
  dateKey: string,
  status: DayStatus | null
): Promise<void> {
  const ref = doc(db, COLLECTION, DAYS_DOC);
  if (status === null) {
    try {
      await updateDoc(ref, { [`days.${dateKey}`]: deleteField() });
    } catch {
      // Document may not exist yet; nothing to delete
    }
  } else {
    await setDoc(ref, { days: { [dateKey]: status } }, { merge: true });
  }
}
