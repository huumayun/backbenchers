// Script to set a user as admin in Firestore
// Run: node scripts/set-admin.mjs <user-email>
// 
// Usage: After registering with your admin email, run this script.

import { initializeApp } from "firebase/app";
import { getFirestore, collection, query, where, getDocs, updateDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBswZK0vDWoHeU8uq48ehqsWcpQHcfE668",
  authDomain: "botany-1d1e6.firebaseapp.com",
  projectId: "botany-1d1e6",
  storageBucket: "botany-1d1e6.firebasestorage.app",
  messagingSenderId: "879445393590",
  appId: "1:879445393590:web:766f926f46693970936617",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const email = process.argv[2];
if (!email) {
  console.error("❌ ইমেইল দিন: node scripts/set-admin.mjs your@email.com");
  process.exit(1);
}

const q = query(collection(db, "users"), where("email", "==", email));
const snap = await getDocs(q);

if (snap.empty) {
  console.error(`❌ '${email}' ইমেইলে কোনো ব্যবহারকারী নেই। আগে রেজিস্ট্রেশন করুন।`);
  process.exit(1);
}

const userDoc = snap.docs[0];
await updateDoc(userDoc.ref, { role: "admin", hasAccess: true });
console.log(`✅ '${email}' কে Admin করা হয়েছে!`);
process.exit(0);
