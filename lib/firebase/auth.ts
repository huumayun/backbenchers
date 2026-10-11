import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User,
  updateProfile,
} from "firebase/auth";
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { auth, db } from "./config";

export async function registerUser(
  email: string,
  password: string,
  displayName: string
) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName });

  try {
    await setDoc(doc(db, "users", cred.user.uid), {
      uid: cred.user.uid,
      email,
      displayName,
      hasAccess: false,
      role: "reader",
      createdAt: serverTimestamp(),
      lastSeen: serverTimestamp(),
    });
  } catch (err) {
    console.warn("Firestore user profile save skipped (check Firestore rules):", err);
  }

  return cred.user;
}

export async function loginUser(email: string, password: string) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  try {
    await updateDoc(doc(db, "users", cred.user.uid), {
      lastSeen: serverTimestamp(),
    });
  } catch {
    // Ignore if user doc doesn't exist or rules aren't set yet
  }
  return cred.user;
}

export async function logoutUser() {
  await signOut(auth);
}

export { onAuthStateChanged, type User };

export async function getUserProfile(uid: string) {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    return snap.exists() ? snap.data() : null;
  } catch {
    return null;
  }
}

export async function checkUserAccess(uid: string): Promise<boolean> {
  const profile = await getUserProfile(uid);
  return profile?.hasAccess === true || profile?.role === "admin";
}
