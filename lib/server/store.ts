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
  runTransaction,
} from "firebase/firestore";
import { BOOK_INFO, CHAPTERS } from "@/lib/book/chapters";

export const ALL_SUBJECT_IDS: string[] = CHAPTERS.map((ch) => ch.id);
export const SUBJECT_PRICE_BDT = 49;

export interface CodeRedeemer {
  uid: string;
  email?: string | null;
  deviceId?: string | null;
  redeemedAt: string;
}

export interface UnlockCodeRecord {
  code: string;
  used: boolean;
  disabled?: boolean;
  maxUses?: number; // default 1
  usedCount?: number; // default (used ? 1 : 0)
  redeemers?: CodeRedeemer[];
  accessDurationDays?: number | null; // null or 0 = permanent; >0 = timed days from redemption
  expiresAt?: string | null; // optional "redeem by" expiry date for the code itself
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
  isPermanent?: boolean; // true = permanent, false = timed
  expiresAt?: string | null; // ISO string if timed, null if permanent
}

export interface SubjectFreeWindow {
  subjectId: string;
  enabled: boolean;
  isUnlimited: boolean;
  durationDays?: number | null;
  startAt: string; // ISO string (server timestamp)
  endAt: string | null; // ISO string or null if unlimited
  updatedAt: string;
}

export interface NoticeItem {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  important?: boolean;
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
  regularPrice?: number;
  offerPrice?: number;
  isOfferActive?: boolean;
  contactChannel?: "telegram" | "whatsapp" | "both";
  paymentMethods: string;
  whatsappNumber: string;
  contactWhatsApp: string;
  telegramUsername: string;
  contactTelegram: string;
  freePagesLimit: number;
  announcement: string;
  freeSubjects?: Record<string, SubjectFreeWindow>;
  notices?: NoticeItem[];
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
  regularPrice: 49,
  offerPrice: 39,
  isOfferActive: false,
  contactChannel: "both",
  paymentMethods: "বিকাশ / নগদ (Send Money / Personal): 017XX-XXXXXX",
  whatsappNumber: "017XX-XXXXXX",
  contactWhatsApp: BOOK_INFO.contactWhatsApp,
  telegramUsername: "@your_telegram_username",
  contactTelegram: BOOK_INFO.contactTelegram,
  freePagesLimit: BOOK_INFO.freePagesLimit,
  announcement:
    "আপনার পছন্দের বিষয় সিলেক্ট করে মেসেজ পাঠিয়ে আনলক কোড সংগ্রহ করুন।",
  freeSubjects: {},
  notices: [],
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
    if (!globalForStore.__ebookStore.settings.freeSubjects) {
      globalForStore.__ebookStore.settings.freeSubjects = {};
    }
    if (!Array.isArray(globalForStore.__ebookStore.settings.notices)) {
      globalForStore.__ebookStore.settings.notices = [];
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
        settings: {
          ...DEFAULT_SETTINGS,
          ...(parsed.settings || {}),
          freeSubjects: parsed.settings?.freeSubjects || {},
          notices: Array.isArray(parsed.settings?.notices) ? parsed.settings!.notices : [],
        },
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
        maxUses: 1,
        usedCount: 0,
        redeemers: [],
        accessDurationDays: null,
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

export function getSubjectFreeWindowStatus(
  win?: SubjectFreeWindow | null,
  nowMs: number = Date.now()
): {
  status: "active" | "scheduled" | "expired" | "disabled";
  isFree: boolean;
  isUnlimited: boolean;
  startAt?: string;
  endAt?: string | null;
} {
  if (!win || !win.enabled) {
    return { status: "disabled", isFree: false, isUnlimited: false };
  }
  const startMs = win.startAt ? Date.parse(win.startAt) : 0;
  if (!isNaN(startMs) && startMs > nowMs) {
    return {
      status: "scheduled",
      isFree: false,
      isUnlimited: Boolean(win.isUnlimited),
      startAt: win.startAt,
      endAt: win.endAt,
    };
  }
  if (win.isUnlimited || !win.endAt) {
    return {
      status: "active",
      isFree: true,
      isUnlimited: true,
      startAt: win.startAt,
      endAt: null,
    };
  }
  const endMs = Date.parse(win.endAt);
  if (!isNaN(endMs) && nowMs < endMs) {
    return {
      status: "active",
      isFree: true,
      isUnlimited: false,
      startAt: win.startAt,
      endAt: win.endAt,
    };
  }
  return {
    status: "expired",
    isFree: false,
    isUnlimited: false,
    startAt: win.startAt,
    endAt: win.endAt,
  };
}

export function getGlobalFreeSubjectIds(
  settings?: Partial<SiteSettings> | null,
  nowMs: number = Date.now()
): string[] {
  if (!settings?.freeSubjects) return [];
  return ALL_SUBJECT_IDS.filter((subId) => {
    const win = settings.freeSubjects?.[subId];
    return getSubjectFreeWindowStatus(win, nowMs).isFree;
  });
}

export function getPermanentlyUnlockedSubjects(
  user?: Partial<UserAccountRecord> | null
): string[] {
  if (!user) return [];
  if (user.role === "admin") return [...ALL_SUBJECT_IDS];

  const baseList = Array.isArray(user.unlockedSubjects)
    ? user.unlockedSubjects.filter((id) => ALL_SUBJECT_IDS.includes(id))
    : user.hasAccess
    ? [...ALL_SUBJECT_IDS]
    : [];

  const accessMap = user.subjectAccess || {};
  const permanentSet = new Set<string>();

  for (const subId of baseList) {
    const rec = accessMap[subId];
    if (!rec) {
      // Legacy unlocked subject without subjectAccess record -> permanent
      permanentSet.add(subId);
    } else if (rec.status === "active" && (rec.isPermanent === true || !rec.expiresAt)) {
      permanentSet.add(subId);
    }
  }

  for (const [subId, rec] of Object.entries(accessMap)) {
    if (
      ALL_SUBJECT_IDS.includes(subId) &&
      rec &&
      rec.status === "active" &&
      (rec.isPermanent === true || !rec.expiresAt)
    ) {
      permanentSet.add(subId);
    }
  }

  return Array.from(permanentSet);
}

export function normalizeUnlockedSubjects(
  user?: Partial<UserAccountRecord> | null,
  nowMs: number = Date.now()
): string[] {
  if (!user) return [];
  if (user.role === "admin") return [...ALL_SUBJECT_IDS];

  const baseList = Array.isArray(user.unlockedSubjects)
    ? user.unlockedSubjects.filter((id) => ALL_SUBJECT_IDS.includes(id))
    : user.hasAccess && !Array.isArray(user.unlockedSubjects)
    ? [...ALL_SUBJECT_IDS]
    : [];

  const accessMap = user.subjectAccess || {};
  const activeSet = new Set<string>();

  const candidates = new Set<string>([
    ...baseList,
    ...Object.keys(accessMap).filter((id) => ALL_SUBJECT_IDS.includes(id)),
  ]);

  for (const subId of candidates) {
    const rec = accessMap[subId];
    if (!rec) {
      if (baseList.includes(subId)) {
        activeSet.add(subId);
      }
      continue;
    }
    if (rec.status === "revoked") {
      continue;
    }
    if (rec.isPermanent === true || !rec.expiresAt) {
      activeSet.add(subId);
      continue;
    }
    const expMs = Date.parse(rec.expiresAt);
    if (!isNaN(expMs) && nowMs < expMs) {
      activeSet.add(subId);
    }
  }

  return Array.from(activeSet);
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

export function mergeSubjectAccessMaps(
  mapA?: Record<string, UserSubjectAccessRecord> | null,
  mapB?: Record<string, UserSubjectAccessRecord> | null
): Record<string, UserSubjectAccessRecord> {
  const result: Record<string, UserSubjectAccessRecord> = { ...(mapA || {}) };
  if (!mapB) return result;

  for (const [subId, recB] of Object.entries(mapB)) {
    if (!recB) continue;
    const recA = result[subId];
    if (!recA) {
      result[subId] = recB;
      continue;
    }
    const aPerm = recA.status === "active" && (recA.isPermanent === true || !recA.expiresAt);
    const bPerm = recB.status === "active" && (recB.isPermanent === true || !recB.expiresAt);
    if (aPerm && !bPerm) {
      result[subId] = { ...recB, ...recA, isPermanent: true, expiresAt: null, status: "active" };
    } else if (bPerm && !aPerm) {
      result[subId] = { ...recA, ...recB, isPermanent: true, expiresAt: null, status: "active" };
    } else if (aPerm && bPerm) {
      result[subId] = { ...recA, ...recB, isPermanent: true, expiresAt: null, status: "active" };
    } else {
      const expA = recA.expiresAt ? Date.parse(recA.expiresAt) : 0;
      const expB = recB.expiresAt ? Date.parse(recB.expiresAt) : 0;
      result[subId] = expB >= expA ? recB : recA;
    }
  }
  return result;
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
      (u) => (u?.email || "").toLowerCase().trim() === cleanEmail
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

      const mergedSubjectAccess = mergeSubjectAccessMaps(
        localUser?.subjectAccess,
        cloudUser?.subjectAccess
      );

      const candidateSubjects = Array.from(
        new Set([
          ...(localUser?.unlockedSubjects || []),
          ...(cloudUser?.unlockedSubjects || []),
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

      if (cloudUser || localUser || candidateSubjects.length > 0) {
        const mergedDraft: UserAccountRecord = {
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
          subjectAccess: mergedSubjectAccess,
          unlockedSubjects: candidateSubjects,
          hasAccess: false,
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
        const activeUnlocked = normalizeUnlockedSubjects(mergedDraft);
        mergedDraft.unlockedSubjects = activeUnlocked;
        mergedDraft.hasAccess = activeUnlocked.length > 0;
        user = mergedDraft;
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

function normalizeCodeRecord(
  data: UnlockCodeRecord,
  fallback?: UnlockCodeRecord | null
): UnlockCodeRecord {
  const maxUses =
    typeof data.maxUses === "number" && data.maxUses >= 1
      ? data.maxUses
      : typeof fallback?.maxUses === "number" && fallback.maxUses >= 1
      ? fallback.maxUses
      : 1;

  const redeemers: CodeRedeemer[] = Array.isArray(data.redeemers)
    ? data.redeemers
    : Array.isArray(fallback?.redeemers)
    ? fallback!.redeemers!
    : data.used && data.usedByUid
    ? [
        {
          uid: data.usedByUid,
          email: data.usedByEmail || null,
          deviceId: data.usedByDevice || null,
          redeemedAt: data.usedAt || data.createdAt,
        },
      ]
    : [];

  const usedCount =
    typeof data.usedCount === "number"
      ? Math.max(data.usedCount, redeemers.length)
      : Math.max(redeemers.length, data.used || fallback?.used ? 1 : 0);

  const used = usedCount >= maxUses || Boolean(data.used && maxUses === 1);

  return {
    ...fallback,
    ...data,
    code: (data.code || fallback?.code || "").toUpperCase().trim(),
    maxUses,
    usedCount,
    redeemers,
    used,
    disabled:
      typeof data.disabled === "boolean"
        ? data.disabled
        : Boolean(fallback?.disabled),
    accessDurationDays:
      data.accessDurationDays !== undefined
        ? data.accessDurationDays
        : fallback?.accessDurationDays ?? null,
    expiresAt:
      data.expiresAt !== undefined
        ? data.expiresAt
        : fallback?.expiresAt ?? null,
    assignedSubjectIds:
      Array.isArray(data.assignedSubjectIds) && data.assignedSubjectIds.length > 0
        ? data.assignedSubjectIds.filter((id) => ALL_SUBJECT_IDS.includes(id))
        : Array.isArray(fallback?.assignedSubjectIds) &&
          fallback!.assignedSubjectIds!.length > 0
        ? fallback!.assignedSubjectIds!.filter((id) => ALL_SUBJECT_IDS.includes(id))
        : ALL_SUBJECT_IDS,
  };
}

export async function getCodeRecord(code: string): Promise<UnlockCodeRecord | null> {
  const normalized = code.toUpperCase().trim();
  const store = loadLocalStore();

  try {
    const snap = await getDoc(doc(db, "unlock_codes", normalized));
    if (snap.exists()) {
      const data = snap.data() as UnlockCodeRecord;
      const localRecord = store.codes[normalized];
      const merged = normalizeCodeRecord(data, localRecord);
      store.codes[normalized] = merged;
      saveLocalStore(store);
      return merged;
    }
  } catch {
    // Firestore permission/network fallback to local store
  }

  const local = store.codes[normalized];
  if (!local) return null;
  return normalizeCodeRecord(local);
}

export async function saveCodeRecord(record: UnlockCodeRecord): Promise<void> {
  const normalized = record.code.toUpperCase().trim();
  const store = loadLocalStore();
  const normalizedRecord = normalizeCodeRecord(
    { ...record, code: normalized },
    store.codes[normalized]
  );
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
        store.codes[key] = normalizeCodeRecord(data, existing);
      }
    });
    saveLocalStore(store);
  } catch {
    // Fallback to local store
  }

  return Object.values(store.codes)
    .map((c) => normalizeCodeRecord(c))
    .sort(
      (a, b) =>
        new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );
}

// ─── Atomic Code Redemption & Subject Unlocking (Permanent or Timed) ───────────

class CodeRedemptionError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

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
  permanentlyUnlockedSubjects?: string[];
  subjectAccess?: Record<string, UserSubjectAccessRecord>;
  newlyUnlockedSubjects?: string[];
  code?: string;
  isPermanentUnlock?: boolean;
  accessDurationDays?: number | null;
  accessExpiresAt?: string | null;
  serverTime?: string;
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
    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();
    const store = loadLocalStore();

    // Helper to evaluate and apply redemption on a given codeRecord + userRecord
    const applyRedemption = (
      rawRecord: UnlockCodeRecord | null,
      existingUser: UserAccountRecord | null
    ) => {
      if (!rawRecord) {
        throw new CodeRedemptionError(
          "❌ ভুল আনলক কোড! অনুগ্রহ করে সঠিক কোডটি লিখে আবার চেষ্টা করুন।",
          404
        );
      }

      const record = normalizeCodeRecord(rawRecord, store.codes[normalizedCode]);

      if (record.disabled) {
        throw new CodeRedemptionError(
          "🚫 এই আনলক কোডটি অ্যাডমিন কর্তৃক নিষ্ক্রিয় (Disabled) করা হয়েছে।",
          403
        );
      }

      if (record.expiresAt) {
        const expMs = Date.parse(record.expiresAt);
        if (!isNaN(expMs) && nowMs > expMs) {
          throw new CodeRedemptionError(
            "⏳ এই আনলক কোডটির ব্যবহারের মেয়াদ (Redeem Expiry) শেষ হয়ে গেছে।",
            403
          );
        }
      }

      const maxUses = record.maxUses || 1;
      const redeemers: CodeRedeemer[] = Array.isArray(record.redeemers)
        ? [...record.redeemers]
        : [];
      const usedCount =
        typeof record.usedCount === "number"
          ? Math.max(record.usedCount, redeemers.length)
          : redeemers.length;

      const alreadyRedeemedByUser =
        redeemers.some((r) => r.uid === params.uid) ||
        (maxUses === 1 && record.used && record.usedByUid === params.uid) ||
        Boolean(existingUser?.redeemedCodes?.includes(normalizedCode));

      if (alreadyRedeemedByUser) {
        throw new CodeRedemptionError(
          "⚠️ আপনি ইতিমধ্যে এই আনলক কোডটি ব্যবহার করেছেন। একই কোড একজন ইউজার দুইবার ব্যবহার করতে পারবেন না।",
          403
        );
      }

      if (usedCount >= maxUses || (maxUses === 1 && record.used)) {
        throw new CodeRedemptionError(
          maxUses === 1
            ? "⚠️ এই আনলক কোডটি ইতিমধ্যে ব্যবহৃত হয়েছে। প্রতিটি কোড শুধুমাত্র একবার ব্যবহারযোগ্য।"
            : `⚠️ এই কোডটির ব্যবহারের সীমা (${maxUses} জন) পূর্ণ হয়ে গেছে।`,
          403
        );
      }

      const assignedSubjectIds =
        Array.isArray(record.assignedSubjectIds) && record.assignedSubjectIds.length > 0
          ? record.assignedSubjectIds.filter((id) => ALL_SUBJECT_IDS.includes(id))
          : [...ALL_SUBJECT_IDS];

      const durationDays =
        typeof record.accessDurationDays === "number" && record.accessDurationDays > 0
          ? record.accessDurationDays
          : null;
      const isCodePermanent = durationDays === null;
      const codeAccessExpiresAt = isCodePermanent
        ? null
        : new Date(nowMs + durationDays * 24 * 60 * 60 * 1000).toISOString();

      const newUsedCount = usedCount + 1;
      const newRedeemers: CodeRedeemer[] = [
        ...redeemers,
        {
          uid: params.uid,
          email: params.email || existingUser?.email || null,
          deviceId: params.deviceId,
          redeemedAt: now,
        },
      ];

      const updatedCodeRecord: UnlockCodeRecord = {
        ...record,
        code: normalizedCode,
        maxUses,
        usedCount: newUsedCount,
        redeemers: newRedeemers,
        used: newUsedCount >= maxUses,
        assignedSubjectIds,
        usedByUid: params.uid,
        usedByEmail: params.email || existingUser?.email || null,
        usedByDevice: params.deviceId,
        usedByIP: params.ip,
        userAgent: params.userAgent,
        usedAt: now,
      };

      const baseUser: UserAccountRecord = existingUser || {
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

      const prevActiveSubjects = normalizeUnlockedSubjects(baseUser, nowMs);
      const prevPermanentSubjects = getPermanentlyUnlockedSubjects(baseUser);

      const subjectAccessMap: Record<string, UserSubjectAccessRecord> = {
        ...(baseUser.subjectAccess || {}),
      };

      // Ensure legacy permanent subjects are preserved in subjectAccessMap
      for (const permId of prevPermanentSubjects) {
        if (!subjectAccessMap[permId]) {
          subjectAccessMap[permId] = {
            userId: params.uid,
            subjectId: permId,
            unlockCode: baseUser.unlockCode || "LEGACY",
            unlockDate: baseUser.createdAt || now,
            status: "active",
            isPermanent: true,
            expiresAt: null,
          };
        }
      }

      for (const subId of assignedSubjectIds) {
        const prevRec = subjectAccessMap[subId];
        const wasAlreadyPermanent =
          prevPermanentSubjects.includes(subId) ||
          Boolean(
            prevRec &&
              prevRec.status === "active" &&
              (prevRec.isPermanent === true || !prevRec.expiresAt)
          );

        // Rule: permanent access ALWAYS beats timed access. Never downgrade permanent access.
        if (isCodePermanent || wasAlreadyPermanent) {
          subjectAccessMap[subId] = {
            userId: params.uid,
            subjectId: subId,
            unlockCode: normalizedCode,
            unlockDate: now,
            status: "active",
            isPermanent: true,
            expiresAt: null,
          };
        } else {
          const prevExpMs =
            prevRec?.status === "active" && prevRec.expiresAt
              ? Date.parse(prevRec.expiresAt)
              : 0;
          const nextExpMs = Date.parse(codeAccessExpiresAt!);
          const bestExpiresAt =
            !isNaN(prevExpMs) && prevExpMs > nextExpMs
              ? prevRec!.expiresAt!
              : codeAccessExpiresAt!;

          subjectAccessMap[subId] = {
            userId: params.uid,
            subjectId: subId,
            unlockCode: normalizedCode,
            unlockDate: now,
            status: "active",
            isPermanent: false,
            expiresAt: bestExpiresAt,
          };
        }
      }

      const existingCodes = Array.isArray(baseUser.redeemedCodes)
        ? baseUser.redeemedCodes
        : baseUser.unlockCode
        ? [baseUser.unlockCode]
        : [];
      const mergedCodes = Array.from(new Set([...existingCodes, normalizedCode]));

      const candidateUnlocked = Array.from(
        new Set([...prevActiveSubjects, ...assignedSubjectIds])
      );

      const updatedUserDraft: UserAccountRecord = {
        ...baseUser,
        hasAccess: true,
        unlockedSubjects: candidateUnlocked,
        redeemedCodes: mergedCodes,
        subjectAccess: subjectAccessMap,
        unlockCode: normalizedCode,
        boundDeviceId: params.deviceId,
      };

      const activeUnlocked = normalizeUnlockedSubjects(updatedUserDraft, nowMs);
      const permanentUnlocked = getPermanentlyUnlockedSubjects(updatedUserDraft);
      updatedUserDraft.unlockedSubjects = activeUnlocked;
      updatedUserDraft.hasAccess = activeUnlocked.length > 0;

      const newlyUnlocked = assignedSubjectIds.filter(
        (id) => !prevActiveSubjects.includes(id)
      );

      return {
        updatedCodeRecord,
        updatedUser: updatedUserDraft,
        activeUnlocked,
        permanentUnlocked,
        newlyUnlocked:
          newlyUnlocked.length > 0 ? newlyUnlocked : assignedSubjectIds,
        assignedSubjectIds,
        isCodePermanent,
        durationDays,
        codeAccessExpiresAt,
      };
    };

    let txResult: ReturnType<typeof applyRedemption> | null = null;

    // 1. Attempt atomic Firestore transaction first
    try {
      txResult = await runTransaction(db, async (transaction) => {
        const codeRef = doc(db, "unlock_codes", normalizedCode);
        const userRef = doc(db, "users", params.uid);
        const readingRef = doc(db, "user_reading_data", params.uid);

        const [codeSnap, userSnap] = await Promise.all([
          transaction.get(codeRef),
          transaction.get(userRef),
        ]);

        const rawCode = codeSnap.exists()
          ? (codeSnap.data() as UnlockCodeRecord)
          : store.codes[normalizedCode] || null;

        const localUser = store.users[params.uid] || null;
        const cloudUser = userSnap.exists()
          ? (userSnap.data() as UserAccountRecord)
          : null;

        const mergedExistingUser: UserAccountRecord | null =
          cloudUser || localUser
            ? ({
                ...(localUser || {}),
                ...(cloudUser || {}),
                uid: params.uid,
                subjectAccess: mergeSubjectAccessMaps(
                  localUser?.subjectAccess,
                  cloudUser?.subjectAccess
                ),
              } as UserAccountRecord)
            : null;

        const computed = applyRedemption(rawCode, mergedExistingUser);

        transaction.set(codeRef, computed.updatedCodeRecord, { merge: true });
        transaction.set(
          userRef,
          {
            uid: params.uid,
            email: computed.updatedUser.email,
            displayName: computed.updatedUser.displayName,
            hasAccess: computed.updatedUser.hasAccess,
            unlockedSubjects: computed.activeUnlocked,
            redeemedCodes: computed.updatedUser.redeemedCodes,
            subjectAccess: computed.updatedUser.subjectAccess,
            unlockCode: normalizedCode,
            unlockedAt: now,
          },
          { merge: true }
        );
        transaction.set(
          readingRef,
          {
            uid: params.uid,
            unlockedSubjects: computed.permanentUnlocked,
            redeemedCodes: computed.updatedUser.redeemedCodes,
            updatedAt: now,
          },
          { merge: true }
        );

        return computed;
      });
    } catch (err) {
      if (err instanceof CodeRedemptionError) {
        return {
          success: false,
          status: err.status,
          message: err.message,
          serverTime: now,
        };
      }
      // Firestore network/offline fallback to local store
      const fallbackCode = await getCodeRecord(normalizedCode);
      const fallbackUser = await getUserAccountById(params.uid, params.email);
      try {
        txResult = applyRedemption(fallbackCode, fallbackUser);
      } catch (innerErr) {
        if (innerErr instanceof CodeRedemptionError) {
          return {
            success: false,
            status: innerErr.status,
            message: innerErr.message,
            serverTime: now,
          };
        }
        throw innerErr;
      }
    }

    // 2. Sync with local store backup
    store.codes[normalizedCode] = txResult.updatedCodeRecord;
    store.users[params.uid] = txResult.updatedUser;
    if (store.userReadingData[params.uid]) {
      store.userReadingData[params.uid].unlockedSubjects =
        txResult.permanentUnlocked;
      store.userReadingData[params.uid].redeemedCodes =
        txResult.updatedUser.redeemedCodes;
    }
    saveLocalStore(store);

    const unlockedNames = CHAPTERS.filter((ch) =>
      txResult!.assignedSubjectIds.includes(ch.id)
    )
      .map((ch) => `বই ${ch.bookNumber} (${ch.courseCode})`)
      .join(", ");

    const durationSuffix = txResult.isCodePermanent
      ? " (স্থায়ী অ্যাক্সেস)"
      : ` (${txResult.durationDays} দিনের জন্য)`;

    return {
      success: true,
      status: 200,
      message: `🎉 সফলভাবে আনলক হয়েছে: ${unlockedNames}${durationSuffix}!`,
      unlockedSubjects: txResult.activeUnlocked,
      permanentlyUnlockedSubjects: txResult.permanentUnlocked,
      subjectAccess: txResult.updatedUser.subjectAccess,
      newlyUnlockedSubjects: txResult.newlyUnlocked,
      code: normalizedCode,
      isPermanentUnlock: txResult.isCodePermanent,
      accessDurationDays: txResult.durationDays,
      accessExpiresAt: txResult.codeAccessExpiresAt,
      serverTime: now,
    };
  } finally {
    locks.delete(normalizedCode);
  }
}

// ─── Site Settings (Price, WhatsApp, Telegram, Free Windows, Notices) ─────────

export async function getSiteSettings(): Promise<SiteSettings> {
  const store = loadLocalStore();
  try {
    const snap = await getDoc(doc(db, "settings", "site"));
    if (snap.exists()) {
      const data = snap.data() as Partial<SiteSettings>;
      store.settings = {
        ...DEFAULT_SETTINGS,
        ...store.settings,
        ...data,
        freeSubjects: {
          ...(store.settings.freeSubjects || {}),
          ...(data.freeSubjects || {}),
        },
        notices: Array.isArray(data.notices)
          ? data.notices
          : store.settings.notices || [],
      };
      saveLocalStore(store);
    }
  } catch {
    // Fallback to local store
  }
  return store.settings;
}

export async function updateSiteSettings(newSettings: Partial<SiteSettings>): Promise<SiteSettings> {
  const store = loadLocalStore();
  store.settings = {
    ...store.settings,
    ...newSettings,
    freeSubjects: newSettings.freeSubjects !== undefined
      ? newSettings.freeSubjects
      : store.settings.freeSubjects || {},
    notices: newSettings.notices !== undefined
      ? newSettings.notices
      : store.settings.notices || [],
  };
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
    (u) => (u?.email || "").toLowerCase().trim() === normalizedEmail
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
    (u) => (u?.email || "").toLowerCase().trim() === normalizedEmail
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
