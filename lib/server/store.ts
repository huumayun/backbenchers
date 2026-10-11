import { createHmac } from "crypto";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { db } from "@/lib/firebase/config";
import {
  doc,
  getDoc,
  setDoc,
  getDocs,
  deleteDoc,
  collection,
} from "firebase/firestore";
import { BOOK_INFO, CHAPTERS } from "@/lib/book/chapters";

export const ALL_SUBJECT_IDS: string[] = CHAPTERS.map((ch) => ch.id);
export const SUBJECT_PRICE_BDT = 49;

export interface UnlockCodeRecord {
  code: string;
  used: boolean;
  assignedSubjectIds?: string[];
  usedByUid?: string | null;
  usedByEmail?: string | null;
  usedByDevice?: string | null;
  usedByIP?: string | null;
  userAgent?: string | null;
  note?: string;
  createdAt: string;
  usedAt?: string | null;
}

export interface UserSubjectAccessRecord {
  userId: string;
  subjectId: string;
  unlockCode: string;
  unlockDate: string;
  status: "active" | "revoked";
}

export interface UserLoginSessionRecord {
  userId: string;
  sessionId: string;
  sessionToken: string;
  deviceId: string;
  ip: string;
  userAgent?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserAccountRecord {
  uid: string;
  email: string;
  displayName: string;
  passwordHash: string;
  hasAccess: boolean;
  unlockedSubjects?: string[];
  redeemedCodes?: string[];
  subjectAccess?: Record<string, UserSubjectAccessRecord>;
  unlockCode?: string | null;
  boundDeviceId?: string | null;
  activeSessionId?: string | null;
  activeSessionToken?: string | null;
  activeSessionDeviceId?: string | null;
  activeSessionUpdatedAt?: string | null;
  offlineDeviceId?: string | null;
  offlineLeaseExpiresAt?: string | null;
  offlineSubjectIds?: string[];
  role: "reader" | "admin";
  createdAt: string;
}

export interface SiteSettings {
  price: string;
  paymentMethods: string;
  whatsappNumber: string;
  contactWhatsApp: string;
  telegramUsername: string;
  contactTelegram: string;
  freePagesLimit: number;
  announcement: string;
}

export interface UserReadingDataRecord {
  uid: string;
  unlockedSubjects?: string[];
  redeemedCodes?: string[];
  bookmarks: unknown[];
  progress: {
    chapterIndex: number;
    pageNumber: number;
    pageOffset?: number;
    scrollPercent: number;
    mode?: "read" | "flipbook";
    hasReadBefore?: boolean;
    updatedAt?: string;
  };
  perBookProgress?: Record<
    string,
    {
      chapterIndex: number;
      pageNumber: number;
      pageOffset?: number;
      scrollPercent?: number;
      mode?: "read" | "flipbook";
      updatedAt?: string;
    }
  >;
  preferences?: {
    theme?: "light" | "sepia" | "dark";
    fontSize?: number;
  };
  updatedAt: string;
}

interface LocalStoreData {
  codes: Record<string, UnlockCodeRecord>;
  users: Record<string, UserAccountRecord>;
  userReadingData: Record<string, UserReadingDataRecord>;
  sessions: Record<string, UserLoginSessionRecord>;
  settings: SiteSettings;
  adminPasswordHash?: string;
}

const SECRET_KEY = process.env.ADMIN_SECRET || "backbencher_botany_admin_2026";
const STORE_PATH = join(process.cwd(), "content", "store-backup.json");

const DEFAULT_SETTINGS: SiteSettings = {
  price: "৳৪৯ (প্রতি বিষয়)",
  paymentMethods: "বিকাশ / নগদ (Send Money / Personal): 017XX-XXXXXX",
  whatsappNumber: "017XX-XXXXXX",
  contactWhatsApp: BOOK_INFO.contactWhatsApp,
  telegramUsername: "@your_telegram_username",
  contactTelegram: BOOK_INFO.contactTelegram,
  freePagesLimit: BOOK_INFO.freePagesLimit,
  announcement:
    "প্রতি বিষয় মাত্র ৳৪৯! আপনার পছন্দের বিষয়গুলো সিলেক্ট করে টেলিগ্রামে মেসেজ পাঠিয়ে আনলক কোড নিন।",
};

// Global in-memory cache + concurrency lock for code redemption
const globalForStore = globalThis as unknown as {
  __ebookStore?: LocalStoreData;
  __redeemingLocks?: Set<string>;
};

function getRedeemingLocks(): Set<string> {
  if (!globalForStore.__redeemingLocks) {
    globalForStore.__redeemingLocks = new Set<string>();
  }
  return globalForStore.__redeemingLocks;
}

function loadLocalStore(): LocalStoreData {
  if (globalForStore.__ebookStore) {
    if (!globalForStore.__ebookStore.users) {
      globalForStore.__ebookStore.users = {};
    }
    if (!globalForStore.__ebookStore.userReadingData) {
      globalForStore.__ebookStore.userReadingData = {};
    }
    if (!globalForStore.__ebookStore.sessions) {
      globalForStore.__ebookStore.sessions = {};
    }
    return globalForStore.__ebookStore;
  }
  try {
    if (existsSync(STORE_PATH)) {
      const raw = readFileSync(STORE_PATH, "utf-8");
      const parsed = JSON.parse(raw) as Partial<LocalStoreData>;
      globalForStore.__ebookStore = {
        codes: parsed.codes || {},
        users: parsed.users || {},
        userReadingData: parsed.userReadingData || {},
        sessions: parsed.sessions || {},
        settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) },
        adminPasswordHash: parsed.adminPasswordHash,
      };
      return globalForStore.__ebookStore;
    }
  } catch {
    // ignore read error
  }

  // Seed with a demo test code so admin/user can test immediately
  const initial: LocalStoreData = {
    codes: {
      "DEMO-2026": {
        code: "DEMO-2026",
        used: false,
        assignedSubjectIds: ALL_SUBJECT_IDS,
        note: "টেস্ট কোড (সকল ৭টি বিষয়)",
        createdAt: new Date().toISOString(),
      },
    },
    users: {},
    userReadingData: {},
    sessions: {},
    settings: DEFAULT_SETTINGS,
  };
  globalForStore.__ebookStore = initial;
  saveLocalStore(initial);
  return initial;
}

function saveLocalStore(data: LocalStoreData) {
  globalForStore.__ebookStore = data;
  try {
    writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), "utf-8");
  } catch {
    // On read-only serverless filesystem (like Vercel), ignore file write error
  }
}

export function normalizeUnlockedSubjects(user?: Partial<UserAccountRecord> | null): string[] {
  if (!user) return [];
  if (user.role === "admin") return [...ALL_SUBJECT_IDS];
  if (Array.isArray(user.unlockedSubjects) && user.unlockedSubjects.length > 0) {
    return Array.from(
      new Set(user.unlockedSubjects.filter((id) => ALL_SUBJECT_IDS.includes(id)))
    );
  }
  // Legacy fallback: if user had hasAccess: true before per-subject update and no unlockedSubjects array yet
  if (user.hasAccess && !Array.isArray(user.unlockedSubjects)) {
    return [...ALL_SUBJECT_IDS];
  }
  return [];
}

// ─── Signed Token Helpers (Access Token & Single-Active-Session Token) ─────────

export function createAccessToken(code: string, deviceId: string, ip: string): string {
  const payload = JSON.stringify({
    code: code.toUpperCase().trim(),
    deviceId,
    ip,
    iat: Date.now(),
  });
  const base64Payload = Buffer.from(payload).toString("base64url");
  const signature = createHmac("sha256", SECRET_KEY)
    .update(base64Payload)
    .digest("base64url");
  return `${base64Payload}.${signature}`;
}

export function verifyAccessToken(token?: string | null, deviceId?: string | null): {
  valid: boolean;
  code?: string;
  deviceId?: string;
} {
  if (!token || !token.includes(".")) return { valid: false };
  try {
    const [base64Payload, signature] = token.split(".");
    const expectedSig = createHmac("sha256", SECRET_KEY)
      .update(base64Payload)
      .digest("base64url");
    if (signature !== expectedSig) return { valid: false };

    const data = JSON.parse(Buffer.from(base64Payload, "base64url").toString("utf-8"));
    if (deviceId && data.deviceId && data.deviceId !== deviceId) {
      return { valid: false };
    }
    return { valid: true, code: data.code, deviceId: data.deviceId };
  } catch {
    return { valid: false };
  }
}

export function createSignedSessionToken(
  uid: string,
  sessionId: string,
  deviceId: string
): string {
  const payload = JSON.stringify({
    uid,
    sessionId,
    deviceId,
    iat: Date.now(),
  });
  const base64Payload = Buffer.from(payload).toString("base64url");
  const signature = createHmac("sha256", SECRET_KEY)
    .update(base64Payload)
    .digest("base64url");
  return `${base64Payload}.${signature}`;
}

export function decodeSessionToken(token?: string | null): {
  valid: boolean;
  uid?: string;
  sessionId?: string;
  deviceId?: string;
} {
  if (!token || !token.includes(".")) return { valid: false };
  try {
    const [base64Payload, signature] = token.split(".");
    const expectedSig = createHmac("sha256", SECRET_KEY)
      .update(base64Payload)
      .digest("base64url");
    if (signature !== expectedSig) return { valid: false };
    const data = JSON.parse(Buffer.from(base64Payload, "base64url").toString("utf-8"));
    if (!data.uid || !data.sessionId) return { valid: false };
    return {
      valid: true,
      uid: data.uid,
      sessionId: data.sessionId,
      deviceId: data.deviceId,
    };
  } catch {
    return { valid: false };
  }
}

// ─── Single Active Login Session Management ────────────────────────────────────

export async function issueSingleActiveSession(
  uid: string,
  deviceId: string,
  ip: string,
  userAgent?: string
): Promise<UserLoginSessionRecord> {
  const store = loadLocalStore();
  const now = new Date().toISOString();
  const sessionId =
    "sess_" +
    Date.now().toString(36) +
    "_" +
    Math.random().toString(36).substring(2, 10);
  const sessionToken = createSignedSessionToken(uid, sessionId, deviceId);

  const sessionRecord: UserLoginSessionRecord = {
    userId: uid,
    sessionId,
    sessionToken,
    deviceId,
    ip,
    userAgent: userAgent || "",
    createdAt: now,
    updatedAt: now,
  };

  store.sessions[uid] = sessionRecord;
  if (store.users[uid]) {
    store.users[uid].activeSessionId = sessionId;
    store.users[uid].activeSessionToken = sessionToken;
    store.users[uid].activeSessionDeviceId = deviceId;
    store.users[uid].activeSessionUpdatedAt = now;
  }
  saveLocalStore(store);

  try {
    await Promise.all([
      setDoc(doc(db, "login_sessions", uid), sessionRecord, { merge: true }),
      setDoc(
        doc(db, "users", uid),
        {
          activeSessionId: sessionId,
          activeSessionToken: sessionToken,
          activeSessionDeviceId: deviceId,
          activeSessionUpdatedAt: now,
        },
        { merge: true }
      ),
    ]);
  } catch {
    // Fallback already saved in local store
  }

  return sessionRecord;
}

export async function invalidateUserSession(uid: string): Promise<void> {
  if (!uid) return;
  const store = loadLocalStore();
  delete store.sessions[uid];
  if (store.users[uid]) {
    store.users[uid].activeSessionId = null;
    store.users[uid].activeSessionToken = null;
    store.users[uid].offlineDeviceId = null;
    store.users[uid].offlineLeaseExpiresAt = null;
    store.users[uid].offlineSubjectIds = [];
  }
  saveLocalStore(store);

  try {
    await Promise.all([
      deleteDoc(doc(db, "login_sessions", uid)),
      setDoc(
        doc(db, "users", uid),
        {
          activeSessionId: null,
          activeSessionToken: null,
          offlineDeviceId: null,
          offlineLeaseExpiresAt: null,
          offlineSubjectIds: [],
        },
        { merge: true }
      ),
    ]);
  } catch {
    // ignore
  }
}

export const OFFLINE_LEASE_DURATION_MS = 48 * 60 * 60 * 1000; // 48 hours

export async function acquireOfflineBookLease(
  uid: string,
  deviceId: string,
  subjectId?: string
): Promise<{
  success: boolean;
  expiresAt: string;
  offlineSubjectIds: string[];
}> {
  const store = loadLocalStore();
  const expiresAt = new Date(Date.now() + OFFLINE_LEASE_DURATION_MS).toISOString();
  const user = await getUserAccountById(uid);

  const prevSubjects =
    user && user.offlineDeviceId === deviceId && Array.isArray(user.offlineSubjectIds)
      ? user.offlineSubjectIds
      : [];
  const nextSubjects = subjectId
    ? Array.from(new Set([...prevSubjects, subjectId]))
    : prevSubjects;

  if (store.users[uid]) {
    store.users[uid].offlineDeviceId = deviceId;
    store.users[uid].offlineLeaseExpiresAt = expiresAt;
    store.users[uid].offlineSubjectIds = nextSubjects;
  }
  saveLocalStore(store);

  try {
    await setDoc(
      doc(db, "users", uid),
      {
        offlineDeviceId: deviceId,
        offlineLeaseExpiresAt: expiresAt,
        offlineSubjectIds: nextSubjects,
      },
      { merge: true }
    );
  } catch {
    // local store saved
  }

  return {
    success: true,
    expiresAt,
    offlineSubjectIds: nextSubjects,
  };
}

export async function releaseOfflineBookLease(
  uid: string,
  deviceId: string,
  subjectId?: string
): Promise<{
  success: boolean;
  offlineSubjectIds: string[];
}> {
  const store = loadLocalStore();
  const user = await getUserAccountById(uid);
  const currentSubjects = Array.isArray(user?.offlineSubjectIds)
    ? user!.offlineSubjectIds!
    : [];

  const remaining = subjectId
    ? currentSubjects.filter((id) => id !== subjectId)
    : [];

  const nextDeviceId = remaining.length > 0 ? deviceId : null;
  const nextExpiresAt =
    remaining.length > 0
      ? user?.offlineLeaseExpiresAt ||
        new Date(Date.now() + OFFLINE_LEASE_DURATION_MS).toISOString()
      : null;

  if (store.users[uid]) {
    store.users[uid].offlineDeviceId = nextDeviceId;
    store.users[uid].offlineLeaseExpiresAt = nextExpiresAt;
    store.users[uid].offlineSubjectIds = remaining;
  }
  saveLocalStore(store);

  try {
    await setDoc(
      doc(db, "users", uid),
      {
        offlineDeviceId: nextDeviceId,
        offlineLeaseExpiresAt: nextExpiresAt,
        offlineSubjectIds: remaining,
      },
      { merge: true }
    );
  } catch {
    // local store saved
  }

  return {
    success: true,
    offlineSubjectIds: remaining,
  };
}

export async function getUserAccountById(
  uid: string,
  email?: string | null
): Promise<UserAccountRecord | null> {
  if (!uid && !email) return null;
  const store = loadLocalStore();

  let user = uid ? store.users[uid] : undefined;

  if (!user && email) {
    const cleanEmail = email.toLowerCase().trim();
    user = Object.values(store.users).find(
      (u) => u.email.toLowerCase() === cleanEmail
    );
  }

  // Always check BOTH Firestore users/{uid} AND user_reading_data/{uid} so Vercel cold starts never miss unlockedSubjects
  if (uid) {
    try {
      const [userSnap, readingSnap] = await Promise.all([
        getDoc(doc(db, "users", uid)),
        getDoc(doc(db, "user_reading_data", uid)),
      ]);

      const cloudUser = userSnap.exists()
        ? (userSnap.data() as UserAccountRecord)
        : null;
      const readingData = readingSnap.exists()
        ? (readingSnap.data() as UserReadingDataRecord)
        : null;
      const localUser = store.users[uid];
      const localReading = store.userReadingData[uid];

      const mergedSubjects = Array.from(
        new Set([
          ...(localUser ? normalizeUnlockedSubjects(localUser) : []),
          ...(cloudUser ? normalizeUnlockedSubjects(cloudUser) : []),
          ...(Array.isArray(readingData?.unlockedSubjects)
            ? readingData!.unlockedSubjects!.filter((id) =>
                ALL_SUBJECT_IDS.includes(id)
              )
            : []),
          ...(Array.isArray(localReading?.unlockedSubjects)
            ? localReading.unlockedSubjects.filter((id) =>
                ALL_SUBJECT_IDS.includes(id)
              )
            : []),
        ])
      );

      if (cloudUser || localUser || mergedSubjects.length > 0) {
        user = {
          ...(localUser || {}),
          ...(cloudUser || {}),
          uid,
          email: cloudUser?.email || localUser?.email || email || "",
          displayName:
            cloudUser?.displayName || localUser?.displayName || "পাঠক",
          passwordHash:
            cloudUser?.passwordHash || localUser?.passwordHash || "",
          role: cloudUser?.role || localUser?.role || "reader",
          createdAt:
            cloudUser?.createdAt ||
            localUser?.createdAt ||
            new Date().toISOString(),
          unlockedSubjects: mergedSubjects,
          hasAccess:
            mergedSubjects.length > 0 || Boolean(cloudUser?.hasAccess),
          activeSessionId:
            localUser?.activeSessionUpdatedAt &&
            cloudUser?.activeSessionUpdatedAt &&
            localUser.activeSessionUpdatedAt > cloudUser.activeSessionUpdatedAt
              ? localUser.activeSessionId
              : cloudUser?.activeSessionId ||
                localUser?.activeSessionId ||
                null,
          activeSessionToken:
            localUser?.activeSessionUpdatedAt &&
            cloudUser?.activeSessionUpdatedAt &&
            localUser.activeSessionUpdatedAt > cloudUser.activeSessionUpdatedAt
              ? localUser.activeSessionToken
              : cloudUser?.activeSessionToken ||
                localUser?.activeSessionToken ||
                null,
        };
        store.users[uid] = user;
        saveLocalStore(store);
      }
    } catch {
      // Fallback to local store
    }
  }

  if (user) {
    user.unlockedSubjects = normalizeUnlockedSubjects(user);
    user.hasAccess = user.unlockedSubjects.length > 0;
  }

  return user || null;
}

export async function verifyUserActiveSession(
  uid?: string | null,
  sessionToken?: string | null
): Promise<{
  valid: boolean;
  sessionInvalidated?: boolean;
  user?: Omit<UserAccountRecord, "passwordHash">;
  unlockedSubjects: string[];
}> {
  if (!uid || !sessionToken) {
    return { valid: false, unlockedSubjects: [] };
  }

  const decoded = decodeSessionToken(sessionToken);
  if (!decoded.valid || decoded.uid !== uid || !decoded.sessionId) {
    return { valid: false, sessionInvalidated: true, unlockedSubjects: [] };
  }

  const store = loadLocalStore();
  const user = await getUserAccountById(uid);

  // Check active session ID in store.sessions or user record
  const activeSessionId =
    store.sessions[uid]?.sessionId || user?.activeSessionId || null;

  if (activeSessionId && activeSessionId !== decoded.sessionId) {
    return {
      valid: false,
      sessionInvalidated: true,
      unlockedSubjects: [],
    };
  }

  const unlockedSubjects = normalizeUnlockedSubjects(user);
  if (user) {
    const { passwordHash: _ph, ...safeUser } = user;
    void _ph;
    return {
      valid: true,
      user: { ...safeUser, unlockedSubjects, hasAccess: unlockedSubjects.length > 0 },
      unlockedSubjects,
    };
  }

  return {
    valid: true,
    unlockedSubjects,
  };
}

// ─── Code Operations (Hybrid Firestore + Local Fallback) ───────────────────────

export async function getCodeRecord(code: string): Promise<UnlockCodeRecord | null> {
  const normalized = code.toUpperCase().trim();
  const store = loadLocalStore();

  try {
    const snap = await getDoc(doc(db, "unlock_codes", normalized));
    if (snap.exists()) {
      const data = snap.data() as UnlockCodeRecord;
      const localRecord = store.codes[normalized];
      // If either local or Firestore says used: true, preserve used: true
      const merged: UnlockCodeRecord = {
        ...data,
        ...(localRecord?.used ? localRecord : {}),
        used: Boolean(data.used || localRecord?.used),
        assignedSubjectIds:
          Array.isArray(data.assignedSubjectIds) && data.assignedSubjectIds.length > 0
            ? data.assignedSubjectIds
            : Array.isArray(localRecord?.assignedSubjectIds) &&
              localRecord.assignedSubjectIds.length > 0
            ? localRecord.assignedSubjectIds
            : ALL_SUBJECT_IDS,
      };
      store.codes[normalized] = merged;
      saveLocalStore(store);
      return merged;
    }
  } catch {
    // Firestore permission/network fallback to local store
  }

  const local = store.codes[normalized];
  if (!local) return null;
  if (!Array.isArray(local.assignedSubjectIds) || local.assignedSubjectIds.length === 0) {
    local.assignedSubjectIds = ALL_SUBJECT_IDS;
  }
  return local;
}

export async function saveCodeRecord(record: UnlockCodeRecord): Promise<void> {
  const normalized = record.code.toUpperCase().trim();
  const normalizedRecord: UnlockCodeRecord = {
    ...record,
    code: normalized,
    assignedSubjectIds:
      Array.isArray(record.assignedSubjectIds) && record.assignedSubjectIds.length > 0
        ? record.assignedSubjectIds.filter((id) => ALL_SUBJECT_IDS.includes(id))
        : ALL_SUBJECT_IDS,
  };
  const store = loadLocalStore();
  store.codes[normalized] = normalizedRecord;
  saveLocalStore(store);

  try {
    await setDoc(doc(db, "unlock_codes", normalized), normalizedRecord, {
      merge: true,
    });
  } catch {
    // Fallback already saved in local store
  }
}

export async function deleteCodeRecord(code: string): Promise<void> {
  const normalized = code.toUpperCase().trim();
  const store = loadLocalStore();
  delete store.codes[normalized];
  saveLocalStore(store);

  try {
    await deleteDoc(doc(db, "unlock_codes", normalized));
  } catch {
    // Ignore Firestore error if rules block it
  }
}

export async function listAllCodes(): Promise<UnlockCodeRecord[]> {
  const store = loadLocalStore();
  try {
    const snap = await getDocs(collection(db, "unlock_codes"));
    snap.docs.forEach((d) => {
      const data = d.data() as UnlockCodeRecord;
      if (data.code) {
        const key = data.code.toUpperCase();
        const existing = store.codes[key];
        store.codes[key] = {
          ...data,
          used: Boolean(data.used || existing?.used),
          assignedSubjectIds:
            Array.isArray(data.assignedSubjectIds) && data.assignedSubjectIds.length > 0
              ? data.assignedSubjectIds
              : existing?.assignedSubjectIds || ALL_SUBJECT_IDS,
        };
      }
    });
    saveLocalStore(store);
  } catch {
    // Fallback to local store
  }

  return Object.values(store.codes).sort(
    (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
  );
}

// ─── Atomic Code Redemption & Permanent Subject Unlocking ──────────────────────

export async function redeemUnlockCodeForUser(params: {
  code: string;
  uid: string;
  email?: string | null;
  deviceId: string;
  ip: string;
  userAgent: string;
}): Promise<{
  success: boolean;
  status: number;
  message: string;
  unlockedSubjects?: string[];
  newlyUnlockedSubjects?: string[];
  code?: string;
}> {
  const normalizedCode = params.code.toUpperCase().trim();
  const locks = getRedeemingLocks();

  if (locks.has(normalizedCode)) {
    return {
      success: false,
      status: 409,
      message: "এই কোডটি বর্তমানে প্রসেস করা হচ্ছে। অনুগ্রহ করে একটু পর চেষ্টা করুন।",
    };
  }

  locks.add(normalizedCode);
  try {
    const record = await getCodeRecord(normalizedCode);

    if (!record) {
      return {
        success: false,
        status: 404,
        message: "❌ ভুল আনলক কোড! অনুগ্রহ করে সঠিক কোডটি লিখে আবার চেষ্টা করুন।",
      };
    }

    if (record.used) {
      return {
        success: false,
        status: 403,
        message:
          "⚠️ এই আনলক কোডটি ইতিমধ্যে ব্যবহৃত হয়েছে। প্রতিটি কোড শুধুমাত্র একবার ব্যবহারযোগ্য।",
      };
    }

    const assignedSubjectIds =
      Array.isArray(record.assignedSubjectIds) && record.assignedSubjectIds.length > 0
        ? record.assignedSubjectIds.filter((id) => ALL_SUBJECT_IDS.includes(id))
        : [...ALL_SUBJECT_IDS];

    const now = new Date().toISOString();

    // 1. Mark code as used immediately so it can never be reused
    const updatedCodeRecord: UnlockCodeRecord = {
      ...record,
      code: normalizedCode,
      used: true,
      assignedSubjectIds,
      usedByUid: params.uid,
      usedByEmail: params.email || null,
      usedByDevice: params.deviceId,
      usedByIP: params.ip,
      userAgent: params.userAgent,
      usedAt: now,
    };
    await saveCodeRecord(updatedCodeRecord);

    // 2. Load user record and merge newly unlocked subjects with existing unlockedSubjects
    const store = loadLocalStore();
    let user = await getUserAccountById(params.uid, params.email);

    if (!user) {
      user = {
        uid: params.uid,
        email: (params.email || "").toLowerCase().trim(),
        displayName: (params.email || "পাঠক").split("@")[0],
        passwordHash: "",
        hasAccess: true,
        unlockedSubjects: [],
        redeemedCodes: [],
        subjectAccess: {},
        role: "reader",
        createdAt: now,
      };
    }

    const existingSubjects = normalizeUnlockedSubjects(user);
    const mergedSubjects = Array.from(
      new Set([...existingSubjects, ...assignedSubjectIds])
    );
    const newlyUnlocked = assignedSubjectIds.filter(
      (id) => !existingSubjects.includes(id)
    );

    const existingCodes = Array.isArray(user.redeemedCodes)
      ? user.redeemedCodes
      : user.unlockCode
      ? [user.unlockCode]
      : [];
    const mergedCodes = Array.from(new Set([...existingCodes, normalizedCode]));

    const subjectAccessMap: Record<string, UserSubjectAccessRecord> = {
      ...(user.subjectAccess || {}),
    };
    for (const subId of assignedSubjectIds) {
      subjectAccessMap[subId] = {
        userId: params.uid,
        subjectId: subId,
        unlockCode: normalizedCode,
        unlockDate: now,
        status: "active",
      };
    }

    const updatedUser: UserAccountRecord = {
      ...user,
      hasAccess: mergedSubjects.length > 0,
      unlockedSubjects: mergedSubjects,
      redeemedCodes: mergedCodes,
      subjectAccess: subjectAccessMap,
      unlockCode: normalizedCode,
      boundDeviceId: params.deviceId,
    };

    store.users[params.uid] = updatedUser;
    if (store.userReadingData[params.uid]) {
      store.userReadingData[params.uid].unlockedSubjects = mergedSubjects;
      store.userReadingData[params.uid].redeemedCodes = mergedCodes;
    }
    saveLocalStore(store);

    // 3. Persist permanent subject access to Firestore (users/{uid} and user_reading_data/{uid})
    try {
      await Promise.all([
        setDoc(
          doc(db, "users", params.uid),
          {
            uid: params.uid,
            email: updatedUser.email,
            displayName: updatedUser.displayName,
            hasAccess: mergedSubjects.length > 0,
            unlockedSubjects: mergedSubjects,
            redeemedCodes: mergedCodes,
            subjectAccess: subjectAccessMap,
            unlockCode: normalizedCode,
            unlockedAt: now,
          },
          { merge: true }
        ),
        setDoc(
          doc(db, "user_reading_data", params.uid),
          {
            uid: params.uid,
            unlockedSubjects: mergedSubjects,
            redeemedCodes: mergedCodes,
            updatedAt: now,
          },
          { merge: true }
        ),
      ]);
    } catch {
      // Local store backup already saved
    }

    const unlockedNames = CHAPTERS.filter((ch) =>
      assignedSubjectIds.includes(ch.id)
    )
      .map((ch) => `বই ${ch.bookNumber} (${ch.courseCode})`)
      .join(", ");

    return {
      success: true,
      status: 200,
      message: `🎉 সফলভাবে আনলক হয়েছে: ${unlockedNames}!`,
      unlockedSubjects: mergedSubjects,
      newlyUnlockedSubjects: newlyUnlocked.length > 0 ? newlyUnlocked : assignedSubjectIds,
      code: normalizedCode,
    };
  } finally {
    locks.delete(normalizedCode);
  }
}

// ─── Site Settings (Price, WhatsApp, Telegram, bKash/Nagad) ───────────────────

export async function getSiteSettings(): Promise<SiteSettings> {
  const store = loadLocalStore();
  try {
    const snap = await getDoc(doc(db, "settings", "site"));
    if (snap.exists()) {
      const data = snap.data() as Partial<SiteSettings>;
      store.settings = { ...DEFAULT_SETTINGS, ...store.settings, ...data };
      saveLocalStore(store);
    }
  } catch {
    // Fallback to local store
  }
  return store.settings;
}

export async function updateSiteSettings(newSettings: Partial<SiteSettings>): Promise<SiteSettings> {
  const store = loadLocalStore();
  store.settings = { ...store.settings, ...newSettings };
  saveLocalStore(store);

  try {
    await setDoc(doc(db, "settings", "site"), store.settings, { merge: true });
  } catch {
    // Fallback already saved locally
  }
  return store.settings;
}

export function hashPassword(password: string): string {
  return createHmac("sha256", SECRET_KEY).update(password).digest("hex");
}

export async function verifyAdminSecret(secret?: string | null): Promise<boolean> {
  if (!secret) return false;
  const trimmed = secret.trim();
  const store = loadLocalStore();

  // Check Firestore if local store does not have a custom admin password yet
  if (!store.adminPasswordHash) {
    try {
      const snap = await getDoc(doc(db, "settings", "admin_credentials"));
      if (snap.exists()) {
        const data = snap.data() as { adminPasswordHash?: string };
        if (data.adminPasswordHash) {
          store.adminPasswordHash = data.adminPasswordHash;
          saveLocalStore(store);
        }
      }
    } catch {
      // Fallback to local store
    }
  }

  // If a custom admin password has been set, require it (or env ADMIN_SECRET)
  if (store.adminPasswordHash) {
    return (
      hashPassword(trimmed) === store.adminPasswordHash ||
      (Boolean(process.env.ADMIN_SECRET) && trimmed === process.env.ADMIN_SECRET)
    );
  }

  return trimmed === SECRET_KEY || trimmed === "admin2026";
}

export async function changeAdminSecret(newPassword: string): Promise<void> {
  const store = loadLocalStore();
  const hashed = hashPassword(newPassword.trim());
  store.adminPasswordHash = hashed;
  saveLocalStore(store);

  try {
    await setDoc(
      doc(db, "settings", "admin_credentials"),
      {
        adminPasswordHash: hashed,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch {
    // Local store already updated
  }
}

export async function registerUserAccount(
  email: string,
  password: string,
  displayName: string,
  firebaseUid?: string
): Promise<{ success: boolean; message?: string; user?: Omit<UserAccountRecord, "passwordHash"> }> {
  const normalizedEmail = email.toLowerCase().trim();
  const store = loadLocalStore();

  // Check if user already exists in local store or Firestore
  const existing = Object.values(store.users).find(
    (u) => u.email.toLowerCase() === normalizedEmail
  );
  if (existing) {
    return { success: false, message: "এই ইমেইলে আগেই অ্যাকাউন্ট আছে। লগইন করুন।" };
  }

  const uid =
    firebaseUid ||
    "usr_" + createHmac("md5", SECRET_KEY).update(normalizedEmail).digest("hex").slice(0, 14);

  const record: UserAccountRecord = {
    uid,
    email: normalizedEmail,
    displayName: displayName.trim() || normalizedEmail.split("@")[0],
    passwordHash: hashPassword(password),
    hasAccess: false,
    unlockedSubjects: [],
    redeemedCodes: [],
    subjectAccess: {},
    unlockCode: null,
    boundDeviceId: null,
    role: "reader",
    createdAt: new Date().toISOString(),
  };

  store.users[uid] = record;
  saveLocalStore(store);

  try {
    await setDoc(doc(db, "users", uid), record, { merge: true });
  } catch {
    // Local store backup already saved
  }

  const { passwordHash: _ph, ...safeUser } = record;
  void _ph;
  return { success: true, user: safeUser };
}

export async function loginUserAccount(
  email: string,
  password: string
): Promise<{ success: boolean; message?: string; user?: Omit<UserAccountRecord, "passwordHash"> }> {
  const normalizedEmail = email.toLowerCase().trim();
  const store = loadLocalStore();

  let found = Object.values(store.users).find(
    (u) => u.email.toLowerCase() === normalizedEmail
  );

  const deterministicUid =
    "usr_" + createHmac("md5", SECRET_KEY).update(normalizedEmail).digest("hex").slice(0, 14);

  // Sync with Firestore if available to ensure latest unlockedSubjects
  const uidToCheck = found?.uid || deterministicUid;
  try {
    const snap = await getDoc(doc(db, "users", uidToCheck));
    if (snap.exists()) {
      const cloudData = snap.data() as UserAccountRecord;
      const mergedUnlocked = Array.from(
        new Set([
          ...(found ? normalizeUnlockedSubjects(found) : []),
          ...normalizeUnlockedSubjects(cloudData),
        ])
      );
      found = {
        ...(found || {}),
        ...cloudData,
        uid: uidToCheck,
        unlockedSubjects: mergedUnlocked,
        hasAccess: mergedUnlocked.length > 0,
      };
      store.users[uidToCheck] = found;
      saveLocalStore(store);
    }
  } catch {
    // ignore
  }

  if (!found) {
    return { success: false, message: "এই ইমেইলে কোনো অ্যাকাউন্ট পাওয়া যায়নি। রেজিস্ট্রেশন করুন।" };
  }

  if (found.passwordHash && found.passwordHash !== hashPassword(password)) {
    return { success: false, message: "ইমেইল বা পাসওয়ার্ড সঠিক নয়।" };
  }

  // Also check user_reading_data in case unlockedSubjects were stored there
  try {
    const readingData = await getUserReadingData(found.uid);
    if (readingData?.unlockedSubjects && readingData.unlockedSubjects.length > 0) {
      found.unlockedSubjects = Array.from(
        new Set([
          ...normalizeUnlockedSubjects(found),
          ...readingData.unlockedSubjects.filter((id) => ALL_SUBJECT_IDS.includes(id)),
        ])
      );
      found.hasAccess = found.unlockedSubjects.length > 0;
      store.users[found.uid] = found;
      saveLocalStore(store);
    }
  } catch {
    // ignore
  }

  found.unlockedSubjects = normalizeUnlockedSubjects(found);
  found.hasAccess = found.unlockedSubjects.length > 0;

  const { passwordHash: _ph, ...safeUser } = found;
  void _ph;
  return { success: true, user: safeUser };
}

export async function getUserReadingData(
  uid: string
): Promise<UserReadingDataRecord | null> {
  if (!uid) return null;
  const store = loadLocalStore();

  // Try Firestore first so cloud data is always fresh
  try {
    const snap = await getDoc(doc(db, "user_reading_data", uid));
    if (snap.exists()) {
      const cloudData = snap.data() as UserReadingDataRecord;
      const localData = store.userReadingData[uid];
      const mergedUnlocked = Array.from(
        new Set([
          ...(localData?.unlockedSubjects || []),
          ...(cloudData?.unlockedSubjects || []),
          ...(store.users[uid]?.unlockedSubjects || []),
        ])
      ).filter((id) => ALL_SUBJECT_IDS.includes(id));

      store.userReadingData[uid] = {
        ...(localData || {}),
        ...cloudData,
        uid,
        unlockedSubjects: mergedUnlocked,
      };
      saveLocalStore(store);
      return store.userReadingData[uid];
    }
  } catch {
    // Fallback to local store backup
  }

  const local = store.userReadingData[uid];
  if (local && store.users[uid]?.unlockedSubjects) {
    local.unlockedSubjects = Array.from(
      new Set([
        ...(local.unlockedSubjects || []),
        ...(store.users[uid]?.unlockedSubjects || []),
      ])
    );
  }
  return local || null;
}

export async function saveUserReadingData(
  uid: string,
  partial: Partial<UserReadingDataRecord>
): Promise<UserReadingDataRecord> {
  const store = loadLocalStore();
  const existing = store.userReadingData[uid] || {
    uid,
    unlockedSubjects: store.users[uid]?.unlockedSubjects || [],
    redeemedCodes: store.users[uid]?.redeemedCodes || [],
    bookmarks: [],
    progress: {
      chapterIndex: 0,
      pageNumber: 1,
      pageOffset: 0,
      scrollPercent: 0,
      mode: "read",
      hasReadBefore: false,
    },
    perBookProgress: {},
    preferences: { theme: "light", fontSize: 16 },
    updatedAt: new Date().toISOString(),
  };

  const mergedUnlocked = Array.from(
    new Set([
      ...(existing.unlockedSubjects || []),
      ...(partial.unlockedSubjects || []),
      ...(store.users[uid]?.unlockedSubjects || []),
    ])
  ).filter((id) => ALL_SUBJECT_IDS.includes(id));

  const merged: UserReadingDataRecord = {
    ...existing,
    ...partial,
    uid,
    unlockedSubjects: mergedUnlocked,
    progress: partial.progress
      ? { ...existing.progress, ...partial.progress }
      : existing.progress,
    perBookProgress: partial.perBookProgress
      ? { ...(existing.perBookProgress || {}), ...partial.perBookProgress }
      : existing.perBookProgress || {},
    preferences: partial.preferences
      ? { ...(existing.preferences || {}), ...partial.preferences }
      : existing.preferences || { theme: "light", fontSize: 16 },
    updatedAt: new Date().toISOString(),
  };

  store.userReadingData[uid] = merged;
  saveLocalStore(store);

  // Sync to Firebase Firestore
  try {
    await setDoc(doc(db, "user_reading_data", uid), merged, { merge: true });
  } catch {
    // Ignore if Firestore rules block server write
  }

  return merged;
}
