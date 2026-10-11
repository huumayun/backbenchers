"use client";

import { CHAPTERS } from "@/lib/book/chapters";

const DB_NAME = "ebook_app_offline_vault_v1";
const STORE_NAME = "encrypted_books";
const DB_VERSION = 1;
const LEASE_DURATION_MS = 48 * 60 * 60 * 1000; // 48 hours

interface EncryptedBookVaultRecord {
  key: string; // `${uid}_${chapterIndex}`
  uid: string;
  deviceId: string;
  chapterIndex: number;
  subjectId: string;
  encryptedChapterPayload: string;
  encryptedFlipbookPayload: string;
  savedAt: string;
  expiresAt: string;
  lastClockMs: number;
}

function deriveKeyBytes(uid: string, deviceId: string): number[] {
  const secret = `${uid}::${deviceId}::backbencher_offline_vault_2026`;
  const bytes: number[] = [];
  for (let i = 0; i < secret.length; i++) {
    bytes.push((secret.charCodeAt(i) * 31 + i * 17) & 0xff);
  }
  return bytes;
}

function encryptPayload(plainJson: string, uid: string, deviceId: string): string {
  const encoder = new TextEncoder();
  const data = encoder.encode(plainJson);
  const key = deriveKeyBytes(uid, deviceId);
  const out = new Uint8Array(data.length);

  for (let i = 0; i < data.length; i++) {
    out[i] = data[i] ^ key[i % key.length] ^ ((i * 13) & 0xff);
  }

  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < out.length; i += chunkSize) {
    binary += String.fromCharCode(...out.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function decryptPayload(cipherB64: string, uid: string, deviceId: string): string {
  const binary = atob(cipherB64);
  const data = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    data[i] = binary.charCodeAt(i);
  }

  const key = deriveKeyBytes(uid, deviceId);
  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    out[i] = data[i] ^ key[i % key.length] ^ ((i * 13) & 0xff);
  }

  const decoder = new TextDecoder();
  return decoder.decode(out);
}

function openVaultDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !("indexedDB" in window)) {
      reject(new Error("IndexedDB not available"));
      return;
    }
    const req = window.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function getLocalOfflineListKey(uid: string): string {
  return `ebook_offline_chapters_${uid}`;
}

export function getSavedOfflineChaptersSync(uid?: string | null): number[] {
  if (!uid || typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(getLocalOfflineListKey(uid));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function setSavedOfflineChaptersSync(uid: string, chapters: number[]) {
  if (typeof window === "undefined") return;
  try {
    const unique = Array.from(new Set(chapters)).sort((a, b) => a - b);
    localStorage.setItem(getLocalOfflineListKey(uid), JSON.stringify(unique));
  } catch {
    // ignore
  }
}

export async function saveBookForOfflineApp(params: {
  chapterIndex: number;
  uid: string;
  deviceId: string;
  sessionToken: string;
}): Promise<{
  success: boolean;
  message: string;
  expiresAt?: string;
}> {
  const { chapterIndex, uid, deviceId, sessionToken } = params;
  const chapter = CHAPTERS[chapterIndex];
  if (!chapter) {
    return { success: false, message: "বইটি পাওয়া যায়নি।" };
  }
  if (!uid || !sessionToken) {
    return {
      success: false,
      message: "অফলাইনে সেভ করতে অনুগ্রহ করে আগে লগইন করুন।",
    };
  }

  try {
    // 1. Acquire server-side Offline Device Lease (blocks other devices from logging in while offline book is active)
    let localUnlockedList: string[] = [];
    try {
      const profRaw = localStorage.getItem("ebook_user_profile");
      if (profRaw) {
        const p = JSON.parse(profRaw);
        if (Array.isArray(p?.unlockedSubjects)) {
          localUnlockedList = p.unlockedSubjects;
        }
      }
    } catch {}
    if (!localUnlockedList.includes(chapter.id)) {
      localUnlockedList.push(chapter.id);
    }
    const unlockedSubjectsHeader = localUnlockedList.join(",");

    const leaseRes = await fetch("/api/offline-lease", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-uid": uid,
        "x-session-token": sessionToken,
        "x-device-id": deviceId,
        "x-unlocked-subjects": unlockedSubjectsHeader,
      },
      body: JSON.stringify({
        action: "acquire",
        uid,
        sessionToken,
        deviceId,
        chapterIndex,
        subjectId: chapter.id,
      }),
    });
    const leaseData = await leaseRes.json();
    if (!leaseRes.ok || !leaseData.success) {
      return {
        success: false,
        message: leaseData.message || "অফলাইন লিজ সক্রিয় করা যায়নি।",
      };
    }

    // 2. Fetch both chapter mode and flipbook mode data
    const headers: Record<string, string> = {
      "x-device-id": deviceId,
      "x-user-uid": uid,
      "x-session-token": sessionToken,
      "x-unlocked-subjects": unlockedSubjectsHeader,
    };

    const [chapterRes, flipRes] = await Promise.all([
      fetch(`/api/book-content?mode=chapter&chapter=${chapterIndex}`, {
        headers,
        cache: "no-store",
      }),
      fetch(`/api/book-content?mode=flipbook&chapter=${chapterIndex}`, {
        headers,
        cache: "no-store",
      }),
    ]);

    if (!chapterRes.ok || !flipRes.ok) {
      return {
        success: false,
        message: "বইয়ের ডাটা ডাউনলোড করা যায়নি। ইন্টারনেট সংযোগ চেক করুন।",
      };
    }

    const [chapterJson, flipJson] = await Promise.all([
      chapterRes.json(),
      flipRes.json(),
    ]);

    const hasLockedPage = (chapterJson.pages || []).some(
      (p: { isLocked?: boolean }) => p.isLocked
    );
    if (hasLockedPage) {
      return {
        success: false,
        message: "শুধুমাত্র আনলক করা বই অফলাইনে সেভ করা যাবে।",
      };
    }

    // 3. Encrypt both payloads bound to uid + deviceId
    const encryptedChapterPayload = encryptPayload(
      JSON.stringify({
        pages: chapterJson.pages || [],
        toc: chapterJson.toc || null,
      }),
      uid,
      deviceId
    );
    const encryptedFlipbookPayload = encryptPayload(
      JSON.stringify({
        pages: flipJson.pages || [],
        toc: flipJson.toc || null,
      }),
      uid,
      deviceId
    );

    const expiresAt =
      leaseData.expiresAt ||
      new Date(Date.now() + LEASE_DURATION_MS).toISOString();

    const record: EncryptedBookVaultRecord = {
      key: `${uid}_${chapterIndex}`,
      uid,
      deviceId,
      chapterIndex,
      subjectId: chapter.id,
      encryptedChapterPayload,
      encryptedFlipbookPayload,
      savedAt: new Date().toISOString(),
      expiresAt,
      lastClockMs: Date.now(),
    };

    const db = await openVaultDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();

    const currentSaved = getSavedOfflineChaptersSync(uid);
    setSavedOfflineChaptersSync(uid, [...currentSaved, chapterIndex]);

    return {
      success: true,
      expiresAt,
      message: `✓ "${chapter.titleBn}" অ্যাপের ভেতরে অফলাইনে সেভ হয়েছে! এখন ইন্টারনেট ছাড়াও এই অ্যাপে বইটি পড়তে পারবেন।`,
    };
  } catch {
    return {
      success: false,
      message: "অফলাইনে সেভ করতে সমস্যা হয়েছে। আবার চেষ্টা করুন।",
    };
  }
}

export async function removeBookFromOfflineApp(params: {
  chapterIndex: number;
  uid: string;
  deviceId: string;
  sessionToken?: string | null;
}): Promise<{ success: boolean; message: string }> {
  const { chapterIndex, uid, deviceId, sessionToken } = params;
  const chapter = CHAPTERS[chapterIndex];

  try {
    const db = await openVaultDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.delete(`${uid}_${chapterIndex}`);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();

    const updated = getSavedOfflineChaptersSync(uid).filter(
      (idx) => idx !== chapterIndex
    );
    setSavedOfflineChaptersSync(uid, updated);

    if (sessionToken) {
      await fetch("/api/offline-lease", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-uid": uid,
          "x-session-token": sessionToken,
          "x-device-id": deviceId,
        },
        body: JSON.stringify({
          action: "release",
          uid,
          sessionToken,
          deviceId,
          chapterIndex,
          subjectId: chapter?.id,
        }),
      }).catch(() => {});
    }

    return {
      success: true,
      message: "অফলাইন স্টোরেজ থেকে বইটি সরানো হয়েছে।",
    };
  } catch {
    return {
      success: false,
      message: "অফলাইন বই রিমুভ করা যায়নি।",
    };
  }
}

export async function getOfflineBookData(params: {
  chapterIndex: number;
  uid?: string;
  deviceId?: string;
  mode: "chapter" | "flipbook";
}): Promise<{
  found: boolean;
  expired?: boolean;
  clockTampered?: boolean;
  message?: string;
  pages?: unknown[];
  toc?: unknown;
}> {
  const { chapterIndex, mode } = params;
  let uid = params.uid || "";
  let deviceId = params.deviceId || "";

  if (typeof window !== "undefined") {
    try {
      if (!uid) {
        const rawProf = localStorage.getItem("ebook_user_profile");
        if (rawProf) uid = JSON.parse(rawProf)?.uid || "";
      }
      if (!deviceId) {
        deviceId = localStorage.getItem("ebook_device_id") || "";
      }
    } catch {
      // ignore
    }
  }

  if (!uid || !deviceId) return { found: false };

  try {
    const db = await openVaultDB();
    const record = await new Promise<EncryptedBookVaultRecord | undefined>(
      (resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(`${uid}_${chapterIndex}`);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }
    );

    if (!record) {
      db.close();
      return { found: false };
    }

    const nowMs = Date.now();

    // 1. Detect phone clock rollback (anti-tamper protection)
    if (nowMs < record.lastClockMs - 10 * 60 * 1000) {
      db.close();
      return {
        found: true,
        clockTampered: true,
        expired: true,
        message:
          "ডিভাইসের সময় (Clock) পরিবর্তন শনাক্ত হয়েছে। অফলাইন বইটি পড়তে ২ সেকেন্ডের জন্য ইন্টারনেট চালু করে অ্যাপটি রিফ্রেশ করুন।",
      };
    }

    // 2. Check 48-hour offline lease expiration
    const expiryMs = new Date(record.expiresAt).getTime();
    if (isNaN(expiryMs) || nowMs > expiryMs) {
      db.close();
      return {
        found: true,
        expired: true,
        message:
          "অফলাইন বইয়ের ৪৮ ঘণ্টার সিকিউরিটি মেয়াদ শেষ হয়েছে। অনুগ্রহ করে ইন্টারনেট চালু করে অ্যাপে প্রবেশ করুন, মেয়াদ স্বয়ংক্রিয়ভাবে নবায়ন হয়ে যাবে।",
      };
    }

    // Update monotonic clock timestamp
    record.lastClockMs = Math.max(record.lastClockMs, nowMs);
    const writeTx = db.transaction(STORE_NAME, "readwrite");
    writeTx.objectStore(STORE_NAME).put(record);
    db.close();

    const cipher =
      mode === "flipbook"
        ? record.encryptedFlipbookPayload
        : record.encryptedChapterPayload;

    const decryptedStr = decryptPayload(cipher, uid, deviceId);
    const parsed = JSON.parse(decryptedStr);

    return {
      found: true,
      pages: parsed.pages || [],
      toc: parsed.toc || null,
    };
  } catch {
    return { found: false };
  }
}

export interface OfflineSearchHit {
  pageNumber: number;
  chapterIndex: number;
  chapterTitleBn: string;
  snippet: string;
  isLocked: boolean;
}

export async function searchOfflineVaultBooks(params: {
  query: string;
  uid?: string;
  deviceId?: string;
  activeChapterIndex?: number;
  activeChapterTitleBn?: string;
  activePages?: Array<{
    pageNumber: number;
    chapterIndex?: number;
    chapterTitleBn?: string;
    html: string;
    isLocked?: boolean;
  }>;
  fallbackPages?: Array<{
    pageNumber: number;
    chapterIndex?: number;
    chapterTitleBn?: string;
    html: string;
    isLocked?: boolean;
  }>;
}): Promise<OfflineSearchHit[]> {
  const q = (params.query || "").trim().toLowerCase();
  if (q.length < 2) return [];

  let uid = params.uid || "";
  let deviceId = params.deviceId || "";
  if (typeof window !== "undefined") {
    try {
      if (!uid) {
        const rawProf = localStorage.getItem("ebook_user_profile");
        if (rawProf) uid = JSON.parse(rawProf)?.uid || "";
      }
      if (!deviceId) {
        deviceId = localStorage.getItem("ebook_device_id") || "";
      }
    } catch {
      // ignore
    }
  }

  const results: OfflineSearchHit[] = [];
  const seenKeys = new Set<string>();

  const scanPagesList = (
    pagesList: Array<{
      pageNumber: number;
      chapterIndex?: number;
      chapterTitleBn?: string;
      html: string;
      isLocked?: boolean;
    }>,
    defaultChIdx: number,
    defaultChTitle: string
  ) => {
    for (const p of pagesList) {
      if (p.isLocked || !p.html) continue;
      const chIdx =
        typeof p.chapterIndex === "number" ? p.chapterIndex : defaultChIdx;
      const chTitle = p.chapterTitleBn || defaultChTitle;
      const key = `${chIdx}_${p.pageNumber}`;
      if (seenKeys.has(key)) continue;
      const plain = p.html
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      const idx = plain.toLowerCase().indexOf(q);
      if (idx !== -1) {
        seenKeys.add(key);
        const start = Math.max(0, idx - 35);
        const end = Math.min(plain.length, idx + q.length + 75);
        const snippet =
          (start > 0 ? "..." : "") +
          plain.slice(start, end) +
          (end < plain.length ? "..." : "");
        results.push({
          pageNumber: p.pageNumber,
          chapterIndex: chIdx,
          chapterTitleBn: chTitle,
          snippet,
          isLocked: false,
        });
        if (results.length >= 25) return;
      }
    }
  };

  const initialList = params.activePages || params.fallbackPages;
  if (Array.isArray(initialList)) {
    const defIdx = params.activeChapterIndex ?? 0;
    const defTitle =
      params.activeChapterTitleBn || CHAPTERS[defIdx]?.titleBn || "";
    scanPagesList(initialList, defIdx, defTitle);
  }

  if (uid && deviceId && results.length < 25) {
    const savedIndices = getSavedOfflineChaptersSync(uid);
    for (const chIdx of savedIndices) {
      if (results.length >= 25) break;
      const data = await getOfflineBookData({
        chapterIndex: chIdx,
        uid,
        deviceId,
        mode: "chapter",
      });
      if (data.found && !data.expired && Array.isArray(data.pages)) {
        scanPagesList(
          data.pages as Array<{
            pageNumber: number;
            chapterIndex?: number;
            chapterTitleBn?: string;
            html: string;
            isLocked?: boolean;
          }>,
          chIdx,
          CHAPTERS[chIdx]?.titleBn || ""
        );
      }
    }
  }

  return results;
}

export async function renewAllOfflineLeasesOnServer(
  uid: string,
  deviceId: string,
  sessionToken: string
): Promise<void> {
  if (!uid || !deviceId || !sessionToken) return;
  const savedIndices = getSavedOfflineChaptersSync(uid);
  if (savedIndices.length === 0) return;

  try {
    const res = await fetch("/api/offline-lease", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-uid": uid,
        "x-session-token": sessionToken,
        "x-device-id": deviceId,
      },
      body: JSON.stringify({
        action: "renew",
        uid,
        sessionToken,
        deviceId,
      }),
    });
    if (!res.ok) return;
    const data = await res.json();
    if (!data.success || !data.expiresAt) return;

    const db = await openVaultDB();
    for (const idx of savedIndices) {
      await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(`${uid}_${idx}`);
        req.onsuccess = () => {
          const rec = req.result as EncryptedBookVaultRecord | undefined;
          if (rec) {
            rec.expiresAt = data.expiresAt;
            rec.lastClockMs = Date.now();
            store.put(rec);
          }
          resolve();
        };
        req.onerror = () => resolve();
      });
    }
    db.close();
  } catch {
    // ignore offline error
  }
}

export async function wipeAllOfflineBooks(uid?: string | null): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    if (uid) {
      localStorage.removeItem(getLocalOfflineListKey(uid));
    }
    const db = await openVaultDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    db.close();
  } catch {
    // ignore
  }
}
