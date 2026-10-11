import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  addDoc,
  query,
  where,
  getDocs,
  serverTimestamp,
  deleteDoc,
} from "firebase/firestore";
import { db } from "./config";

// ─── Unlock Codes ─────────────────────────────────────────────────────────────

export async function validateUnlockCode(
  code: string,
  uid: string,
  ip: string
): Promise<{ success: boolean; message: string }> {
  const codeRef = doc(db, "unlock_codes", code.toUpperCase().trim());
  const codeSnap = await getDoc(codeRef);

  if (!codeSnap.exists()) {
    return { success: false, message: "কোডটি সঠিক নয়।" };
  }

  const data = codeSnap.data();

  if (data.used) {
    return { success: false, message: "এই কোডটি আগেই ব্যবহার করা হয়েছে।" };
  }

  // Mark code as used
  await updateDoc(codeRef, {
    used: true,
    usedBy: uid,
    usedByIP: ip,
    usedAt: serverTimestamp(),
  });

  // Grant access to the user
  await updateDoc(doc(db, "users", uid), {
    hasAccess: true,
    unlockedAt: serverTimestamp(),
    unlockCode: code.toUpperCase().trim(),
  });

  return { success: true, message: "✅ সফলভাবে আনলক হয়েছে! পুরো বই পড়তে পারবেন।" };
}

export async function createUnlockCode(code: string, adminUid: string) {
  const ref = doc(db, "unlock_codes", code.toUpperCase().trim());
  await setDoc(ref, {
    code: code.toUpperCase().trim(),
    used: false,
    createdBy: adminUid,
    createdAt: serverTimestamp(),
  });
}

// ─── Reading Progress ─────────────────────────────────────────────────────────

export async function saveReadingProgress(
  uid: string,
  chapterIndex: number,
  scrollPercent: number
) {
  await setDoc(
    doc(db, "reading_progress", uid),
    { chapterIndex, scrollPercent, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

export async function getReadingProgress(uid: string) {
  const snap = await getDoc(doc(db, "reading_progress", uid));
  return snap.exists() ? snap.data() : { chapterIndex: 0, scrollPercent: 0 };
}

// ─── Bookmarks ────────────────────────────────────────────────────────────────

export interface Bookmark {
  id?: string;
  uid: string;
  chapterIndex: number;
  chapterTitle: string;
  scrollPercent: number;
  label: string;
  createdAt?: unknown;
}

export async function addBookmark(bookmark: Omit<Bookmark, "id" | "createdAt">) {
  const ref = await addDoc(collection(db, "bookmarks"), {
    ...bookmark,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getUserBookmarks(uid: string): Promise<Bookmark[]> {
  const q = query(collection(db, "bookmarks"), where("uid", "==", uid));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Bookmark));
}

export async function deleteBookmark(bookmarkId: string) {
  await deleteDoc(doc(db, "bookmarks", bookmarkId));
}
