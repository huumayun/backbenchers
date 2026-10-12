"use client";

import { db } from "@/lib/firebase/config";
import {
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  getDocs,
  deleteDoc,
  collection,
  runTransaction,
} from "firebase/firestore";
import { BOOK_INFO, CHAPTERS } from "@/lib/book/chapters";
import { isDeviceOnline } from "@/lib/offline/offlineStore";
import type { ParsedBookPage, BookToc } from "@/lib/book/server-parser";
import type {
  SubjectFreeWindow,
  UserSubjectAccessRecord,
  CodeRedeemer,
  NoticeItem,
} from "@/lib/server/store";

function withTimeout<T>(promise: Promise<T>, ms = 3500): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("Network offline")), ms)
    ),
  ]);
}

const ALL_SUBJECT_IDS = CHAPTERS.map((ch) => ch.id);
const SUBJECT_PRICE_BDT = 49;
const OFFLINE_LEASE_DURATION_MS = 48 * 60 * 60 * 1000;

interface BundledBookPayload {
  css: string;
  pages: ParsedBookPage[];
  tocs: Record<number, BookToc>;
}

let cachedBundle: BundledBookPayload | null = null;
let bridgeInstalled = false;

export function isCapacitorNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (
    window as unknown as {
      Capacitor?: { isNativePlatform?: () => boolean };
    }
  ).Capacitor;
  if (cap?.isNativePlatform?.()) return true;
  return (
    window.location.protocol === "https:" &&
    window.location.hostname === "localhost"
  );
}

async function loadBundledBook(): Promise<BundledBookPayload> {
  if (cachedBundle) return cachedBundle;
  const nativeFetch =
    (window as unknown as { __nativeFetch?: typeof fetch }).__nativeFetch ||
    window.fetch.bind(window);
  const res = await nativeFetch("/book-bundle.json", { cache: "force-cache" });
  if (!res.ok) {
    throw new Error("Failed to load bundled book payload");
  }
  cachedBundle = (await res.json()) as BundledBookPayload;
  return cachedBundle;
}

function simpleHash(input: string): string {
  let h1 = 0xdeadbeef ^ input.length;
  let h2 = 0x41c6ce57 ^ input.length;
  for (let i = 0, ch; i < input.length; i++) {
    ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (
    (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16) +
    (h1 >>> 0).toString(16)
  );
}

function encodeBase64Url(str: string): string {
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function decodeBase64Url(b64: string): string {
  const padded = b64.replace(/-/g, "+").replace(/_/g, "/");
  return decodeURIComponent(escape(atob(padded)));
}

function createClientSessionToken(
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
  const b64 = encodeBase64Url(payload);
  const sig = simpleHash(`${b64}::backbencher_botany_admin_2026`);
  return `${b64}.${sig}`;
}

function parseSessionTokenAny(token?: string | null): {
  valid: boolean;
  uid?: string;
  sessionId?: string;
  deviceId?: string;
} {
  if (!token || !token.includes(".")) return { valid: false };
  try {
    const [b64] = token.split(".");
    const data = JSON.parse(decodeBase64Url(b64));
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

function getGlobalFreeSubjectsFromSettings(
  settings?: Record<string, unknown> | null,
  nowMs: number = Date.now()
): string[] {
  const freeMap = (settings?.freeSubjects || {}) as Record<
    string,
    SubjectFreeWindow
  >;
  return ALL_SUBJECT_IDS.filter((subId) => {
    const win = freeMap[subId];
    if (!win || !win.enabled) return false;
    const startMs = win.startAt ? Date.parse(win.startAt) : 0;
    if (!isNaN(startMs) && startMs > nowMs) return false;
    if (win.isUnlimited || !win.endAt) return true;
    const endMs = Date.parse(win.endAt);
    return !isNaN(endMs) && nowMs < endMs;
  });
}

function getPermanentlyUnlocked(
  user?: Record<string, unknown> | null
): string[] {
  if (!user) return [];
  if (user.role === "admin") return [...ALL_SUBJECT_IDS];

  const baseList = Array.isArray(user.unlockedSubjects)
    ? (user.unlockedSubjects as string[]).filter((id) =>
        ALL_SUBJECT_IDS.includes(id)
      )
    : user.hasAccess
    ? [...ALL_SUBJECT_IDS]
    : [];

  const accessMap = (user.subjectAccess || {}) as Record<
    string,
    UserSubjectAccessRecord
  >;
  const permanentSet = new Set<string>();

  for (const subId of baseList) {
    const rec = accessMap[subId];
    if (!rec) {
      permanentSet.add(subId);
    } else if (
      rec.status === "active" &&
      (rec.isPermanent === true || !rec.expiresAt)
    ) {
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

function normalizeUnlocked(
  user?: Record<string, unknown> | null,
  nowMs: number = Date.now()
): string[] {
  if (!user) return [];
  if (user.role === "admin") return [...ALL_SUBJECT_IDS];

  const baseList = Array.isArray(user.unlockedSubjects)
    ? (user.unlockedSubjects as string[]).filter((id) =>
        ALL_SUBJECT_IDS.includes(id)
      )
    : user.hasAccess && !Array.isArray(user.unlockedSubjects)
    ? [...ALL_SUBJECT_IDS]
    : [];

  const accessMap = (user.subjectAccess || {}) as Record<
    string,
    UserSubjectAccessRecord
  >;
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
    if (rec.status === "revoked") continue;
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

async function verifySessionInFirestore(
  uid?: string | null,
  sessionToken?: string | null,
  requireLiveServer = false
): Promise<{
  valid: boolean;
  sessionInvalidated?: boolean;
  unlockedSubjects: string[];
  permanentlyUnlockedSubjects: string[];
  subjectAccess: Record<string, UserSubjectAccessRecord>;
  user?: Record<string, unknown> | null;
}> {
  if (!isDeviceOnline()) {
    throw new Error("Network offline");
  }
  if (!uid || !sessionToken) {
    return {
      valid: false,
      unlockedSubjects: [],
      permanentlyUnlockedSubjects: [],
      subjectAccess: {},
    };
  }
  const parsed = parseSessionTokenAny(sessionToken);
  if (!parsed.valid || parsed.uid !== uid || !parsed.sessionId) {
    return {
      valid: false,
      sessionInvalidated: true,
      unlockedSubjects: [],
      permanentlyUnlockedSubjects: [],
      subjectAccess: {},
    };
  }

  try {
    const snap = await withTimeout(
      getDocFromServer(doc(db, "users", uid)),
      3500
    );
    if (!snap.exists()) {
      return {
        valid: true,
        unlockedSubjects: [],
        permanentlyUnlockedSubjects: [],
        subjectAccess: {},
        user: null,
      };
    }
    const userData = snap.data() as Record<string, unknown>;
    const activeSessionId = (userData.activeSessionId as string) || null;
    if (activeSessionId && activeSessionId !== parsed.sessionId) {
      return {
        valid: false,
        sessionInvalidated: true,
        unlockedSubjects: [],
        permanentlyUnlockedSubjects: [],
        subjectAccess: {},
      };
    }
    const nowMs = Date.now();
    const unlockedSubjects = normalizeUnlocked(userData, nowMs);
    const permanentlyUnlockedSubjects = getPermanentlyUnlocked(userData);
    const subjectAccess = ((userData.subjectAccess || {}) as Record<
      string,
      UserSubjectAccessRecord
    >);
    return {
      valid: true,
      unlockedSubjects,
      permanentlyUnlockedSubjects,
      subjectAccess,
      user: {
        ...userData,
        uid,
        unlockedSubjects,
        subjectAccess,
        hasAccess: unlockedSubjects.length > 0,
      },
    };
  } catch {
    if (requireLiveServer) {
      throw new Error("Network offline");
    }
    // Fallback to cached local profile if Firestore read fails momentarily
    try {
      const localUnlocked = JSON.parse(
        localStorage.getItem("ebook_unlocked_subjects") || "[]"
      );
      const list = Array.isArray(localUnlocked) ? localUnlocked : [];
      return {
        valid: true,
        unlockedSubjects: list,
        permanentlyUnlockedSubjects: list,
        subjectAccess: {},
      };
    } catch {
      return {
        valid: true,
        unlockedSubjects: [],
        permanentlyUnlockedSubjects: [],
        subjectAccess: {},
      };
    }
  }
}

function filterTocForAccess(
  rawToc: BookToc,
  isSubjectUnlocked: boolean,
  freePageNumbers: Set<number>
) {
  if (isSubjectUnlocked) {
    return {
      ...rawToc,
      isTocLocked: false,
      lockedKaCount: 0,
      lockedKhaCount: 0,
      lockedGaCount: 0,
      totalLockedQuestions: 0,
    };
  }

  const visibleKa = rawToc.kaQuestions
    .filter((q) => freePageNumbers.has(q.pageNumber) && q.qNumber <= 10)
    .slice(0, 10);
  const visibleKaRanges = rawToc.kaRanges
    .slice(0, 1)
    .map((grp) => {
      const allowedQs = grp.questions.filter(
        (q) => freePageNumbers.has(q.pageNumber) && q.qNumber <= 10
      );
      if (allowedQs.length === 0) return null;
      const firstQ = allowedQs[0];
      const lastQ = allowedQs[allowedQs.length - 1];
      return {
        ...grp,
        endQ: lastQ.qNumber,
        firstQuestionId: firstQ.id,
        pageNumber: firstQ.pageNumber,
        endPageNumber: lastQ.pageNumber,
        questions: allowedQs,
      };
    })
    .filter((g): g is NonNullable<typeof g> => g !== null);

  const lockedKaCount = Math.max(
    0,
    rawToc.kaQuestions.length - visibleKa.length
  );
  const lockedKhaCount = rawToc.khaQuestions.length;
  const lockedGaCount = rawToc.gaQuestions.length;

  return {
    chapterIndex: rawToc.chapterIndex,
    bookNumber: rawToc.bookNumber,
    kaRanges: visibleKaRanges,
    kaQuestions: visibleKa,
    khaQuestions: [],
    gaQuestions: [],
    isTocLocked: true,
    lockedKaCount,
    lockedKhaCount,
    lockedGaCount,
    totalLockedQuestions: lockedKaCount + lockedKhaCount + lockedGaCount,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function extractHeader(init: RequestInit | undefined, key: string): string {
  if (!init?.headers) return "";
  const h = init.headers;
  if (h instanceof Headers) return h.get(key) || "";
  if (Array.isArray(h)) {
    const found = h.find(([k]) => k.toLowerCase() === key.toLowerCase());
    return found ? found[1] : "";
  }
  const rec = h as Record<string, string>;
  return rec[key] || rec[key.toLowerCase()] || "";
}

async function handleLocalApiRequest(
  urlObj: URL,
  init?: RequestInit
): Promise<Response> {
  // Strictly require online connectivity for API calls so offline vault rules apply when offline
  if (!isDeviceOnline()) {
    throw new Error("Network offline");
  }

  const pathname = urlObj.pathname;
  const method = (init?.method || "GET").toUpperCase();
  const headerUid = extractHeader(init, "x-user-uid");
  const headerToken = extractHeader(init, "x-session-token");
  const headerDevice = extractHeader(init, "x-device-id");
  const headerUnlockedRaw = extractHeader(init, "x-unlocked-subjects");
  const clientUnlocked = headerUnlockedRaw
    ? headerUnlockedRaw
        .split(",")
        .map((s) => s.trim())
        .filter((id) => ALL_SUBJECT_IDS.includes(id))
    : [];

  const storedProfileRaw =
    typeof localStorage !== "undefined"
      ? localStorage.getItem("ebook_user_profile")
      : null;
  const storedUid = storedProfileRaw
    ? (() => {
        try {
          return JSON.parse(storedProfileRaw)?.uid || "";
        } catch {
          return "";
        }
      })()
    : "";
  const storedToken =
    typeof localStorage !== "undefined"
      ? localStorage.getItem("ebook_session_token") || ""
      : "";

  // 1. /api/book-content
  if (pathname === "/api/book-content") {
    const mode = urlObj.searchParams.get("mode") || "chapter";
    const search = urlObj.searchParams.get("search");
    const uid = urlObj.searchParams.get("uid") || headerUid || storedUid;
    const sessionToken =
      urlObj.searchParams.get("sessionToken") || headerToken || storedToken;

    const nowMs = Date.now();
    const serverTime = new Date(nowMs).toISOString();

    let sessionCheck = {
      valid: false,
      sessionInvalidated: false,
      unlockedSubjects: [] as string[],
      permanentlyUnlockedSubjects: [] as string[],
      subjectAccess: {} as Record<string, UserSubjectAccessRecord>,
    };

    const settingsSnapPromise = withTimeout(
      getDocFromServer(doc(db, "settings", "site")),
      3500
    );

    if (uid && sessionToken) {
      const [sCheck] = await Promise.all([
        verifySessionInFirestore(uid, sessionToken, true),
        settingsSnapPromise.catch(() => null),
      ]);
      sessionCheck = {
        valid: sCheck.valid,
        sessionInvalidated: Boolean(sCheck.sessionInvalidated),
        unlockedSubjects: sCheck.unlockedSubjects,
        permanentlyUnlockedSubjects: sCheck.permanentlyUnlockedSubjects,
        subjectAccess: sCheck.subjectAccess,
      };
    }

    const settingsSnap = await settingsSnapPromise;
    const settingsData = settingsSnap.exists()
      ? (settingsSnap.data() as Record<string, unknown>)
      : {};
    const globalFreeSubjects = getGlobalFreeSubjectsFromSettings(
      settingsData,
      nowMs
    );

    const nonExpiredClientUnlocked = clientUnlocked.filter((id) => {
      const rec = sessionCheck.subjectAccess[id];
      if (!rec) return true;
      if (rec.status === "revoked") return false;
      if (rec.isPermanent === true || !rec.expiresAt) return true;
      const expMs = Date.parse(rec.expiresAt);
      return !isNaN(expMs) && nowMs < expMs;
    });

    const unlockedSubjects = sessionCheck.valid
      ? Array.from(
          new Set([
            ...sessionCheck.unlockedSubjects,
            ...nonExpiredClientUnlocked,
            ...globalFreeSubjects,
          ])
        )
      : [...globalFreeSubjects];
    const permanentlyUnlockedSubjects = sessionCheck.valid
      ? sessionCheck.permanentlyUnlockedSubjects
      : [];
    const sessionInvalidated = Boolean(sessionCheck.sessionInvalidated);

    const { css, pages, tocs } = await loadBundledBook();

    if (search !== null) {
      const q = search.trim().toLowerCase();
      if (q.length < 2) {
        return jsonResponse({
          results: [],
          unlockedSubjects,
          permanentlyUnlockedSubjects,
          globalFreeSubjects,
          sessionInvalidated,
          serverTime,
        });
      }
      const results: Array<{
        pageNumber: number;
        chapterIndex: number;
        chapterTitleBn: string;
        snippet: string;
        isLocked: boolean;
      }> = [];

      for (const page of pages) {
        const ch = CHAPTERS[page.chapterIndex];
        const canReadPage =
          page.pageNumber <= (ch?.freePagesUpTo || 2) ||
          Boolean(ch && unlockedSubjects.includes(ch.id));
        if (!canReadPage) continue;

        const idx = page.plainText.toLowerCase().indexOf(q);
        if (idx !== -1) {
          const start = Math.max(0, idx - 35);
          const end = Math.min(page.plainText.length, idx + q.length + 75);
          const snippet =
            (start > 0 ? "..." : "") +
            page.plainText.slice(start, end) +
            (end < page.plainText.length ? "..." : "");
          results.push({
            pageNumber: page.pageNumber,
            chapterIndex: page.chapterIndex,
            chapterTitleBn: page.chapterTitleBn,
            snippet,
            isLocked: false,
          });
          if (results.length >= 25) break;
        }
      }

      return jsonResponse({
        results,
        unlockedSubjects,
        permanentlyUnlockedSubjects,
        globalFreeSubjects,
        sessionInvalidated,
        serverTime,
      });
    }

    const rawCh = parseInt(urlObj.searchParams.get("chapter") || "0", 10);
    const chapterIndex =
      !isNaN(rawCh) && rawCh >= 0 && rawCh < CHAPTERS.length ? rawCh : 0;
    const bookMeta = CHAPTERS[chapterIndex] || CHAPTERS[0];
    const isSubjectUnlocked = unlockedSubjects.includes(bookMeta.id);

    const bookPages = pages.filter((p) => p.chapterIndex === chapterIndex);
    const freePageNumbers = new Set(
      bookPages.filter((p) => p.isFree).map((p) => p.pageNumber)
    );
    const rawBookToc: BookToc = tocs[chapterIndex] || {
      chapterIndex,
      bookNumber: bookMeta.bookNumber,
      kaRanges: [],
      kaQuestions: [],
      khaQuestions: [],
      gaQuestions: [],
    };
    const bookToc = filterTocForAccess(
      rawBookToc,
      isSubjectUnlocked,
      freePageNumbers
    );

    if (mode === "flipbook") {
      const flipPages = bookPages.map((p) => {
        const isAllowed = p.isFree || isSubjectUnlocked;
        return {
          pageNumber: p.pageNumber,
          chapterIndex: p.chapterIndex,
          bookNumber: p.bookNumber,
          chapterTitleBn: p.chapterTitleBn,
          courseCode: p.courseCode,
          sectionLabel: p.sectionLabel,
          isFree: p.isFree,
          isLocked: !isAllowed,
          html: isAllowed ? p.html : "",
        };
      });
      return jsonResponse({
        css,
        book: bookMeta,
        toc: bookToc,
        totalPages: flipPages.length,
        freePagesLimit: bookMeta.freePagesUpTo,
        hasAccess: isSubjectUnlocked,
        isSubjectUnlocked,
        unlockedSubjects,
        permanentlyUnlockedSubjects,
        globalFreeSubjects,
        sessionInvalidated,
        serverTime,
        pages: flipPages,
      });
    }

    const allowedPages = bookPages.filter(
      (p) => p.isFree || isSubjectUnlocked
    );
    const lockedPagesCount = bookPages.length - allowedPages.length;

    return jsonResponse({
      css,
      chapter: bookMeta,
      toc: bookToc,
      hasAccess: isSubjectUnlocked,
      isSubjectUnlocked,
      unlockedSubjects,
      permanentlyUnlockedSubjects,
      globalFreeSubjects,
      sessionInvalidated,
      serverTime,
      freePagesLimit: bookMeta.freePagesUpTo,
      totalChapterPages: bookPages.length,
      unlockedChapterPages: allowedPages.length,
      lockedPagesCount,
      pages: bookPages.map((p) => {
        const isAllowed = p.isFree || isSubjectUnlocked;
        return {
          pageNumber: p.pageNumber,
          sectionLabel: p.sectionLabel,
          isFree: p.isFree,
          isLocked: !isAllowed,
          html: isAllowed ? p.html : "",
        };
      }),
    });
  }

  // 2. /api/auth
  if (pathname === "/api/auth") {
    const serverTime = new Date().toISOString();
    if (method === "GET") {
      const uid = urlObj.searchParams.get("uid") || headerUid || storedUid;
      const sessionToken =
        urlObj.searchParams.get("sessionToken") || headerToken || storedToken;
      if (!uid || !sessionToken) {
        return jsonResponse({
          valid: false,
          sessionInvalidated: false,
          unlockedSubjects: [],
          permanentlyUnlockedSubjects: [],
          subjectAccess: {},
          serverTime,
        });
      }
      const check = await verifySessionInFirestore(uid, sessionToken);
      if (!check.valid) {
        return jsonResponse(
          {
            valid: false,
            sessionInvalidated: Boolean(check.sessionInvalidated),
            unlockedSubjects: [],
            permanentlyUnlockedSubjects: [],
            subjectAccess: {},
            serverTime,
            message:
              "অন্য একটি ডিভাইস বা ব্রাউজারে আপনার অ্যাকাউন্টে লগইন করায় এই ডিভাইসের সেশনটি স্বয়ংক্রিয়ভাবে লগআউট হয়েছে।",
          },
          401
        );
      }
      return jsonResponse({
        valid: true,
        sessionInvalidated: false,
        unlockedSubjects: check.unlockedSubjects,
        permanentlyUnlockedSubjects: check.permanentlyUnlockedSubjects,
        subjectAccess: check.subjectAccess,
        user: check.user || null,
        serverTime,
      });
    }

    if (method === "POST") {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      const { action, email, displayName, uid, deviceId } = body;

      if (action === "logout") {
        const targetUid = uid || storedUid;
        if (targetUid) {
          try {
            await Promise.all([
              deleteDoc(doc(db, "login_sessions", String(targetUid))),
              setDoc(
                doc(db, "users", String(targetUid)),
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
        return jsonResponse({
          success: true,
          message: "লগআউট সফল হয়েছে।",
          serverTime,
        });
      }

      if (action === "register") {
        const { firebaseUid } = body;
        const resolvedUid =
          String(firebaseUid || uid || "") ||
          "usr_" + simpleHash(String(email || "").toLowerCase().trim()).slice(0, 14);
        const cleanEmail = String(email || "").toLowerCase().trim();
        const cleanName =
          String(displayName || "").trim() || cleanEmail.split("@")[0] || "পাঠক";
        const now = new Date().toISOString();
        const sessionId =
          "sess_" +
          Date.now().toString(36) +
          "_" +
          Math.random().toString(36).substring(2, 10);
        const sessionToken = createClientSessionToken(
          resolvedUid,
          sessionId,
          String(deviceId || "capacitor")
        );

        const newUser = {
          uid: resolvedUid,
          email: cleanEmail,
          displayName: cleanName,
          hasAccess: false,
          unlockedSubjects: [] as string[],
          redeemedCodes: [] as string[],
          subjectAccess: {} as Record<string, UserSubjectAccessRecord>,
          role: "reader" as const,
          activeSessionId: sessionId,
          activeSessionToken: sessionToken,
          activeSessionDeviceId: String(deviceId || "capacitor"),
          activeSessionUpdatedAt: now,
          createdAt: now,
        };

        try {
          await Promise.all([
            setDoc(doc(db, "users", resolvedUid), newUser, { merge: true }),
            setDoc(
              doc(db, "login_sessions", resolvedUid),
              {
                userId: resolvedUid,
                sessionId,
                sessionToken,
                deviceId: String(deviceId || "capacitor"),
                ip: "capacitor-app",
                userAgent: navigator.userAgent || "Backbencher-Android",
                createdAt: now,
                updatedAt: now,
              },
              { merge: true }
            ),
          ]);
        } catch {
          // ignore
        }

        return jsonResponse({
          success: true,
          user: newUser,
          sessionToken,
          unlockedSubjects: [],
          permanentlyUnlockedSubjects: [],
          subjectAccess: {},
          serverTime: now,
          message: "রেজিস্ট্রেশন সফল হয়েছে!",
        });
      }

      if (action === "login") {
        // Trigger Firebase Auth signInWithEmailAndPassword + firebase_session in AuthContext
        return jsonResponse(
          { success: false, message: "Use Firebase Auth" },
          401
        );
      }

      if (action === "firebase_session" && uid) {
        const nowMs = Date.now();
        const now = new Date(nowMs).toISOString();
        const sessionId =
          "sess_" +
          Date.now().toString(36) +
          "_" +
          Math.random().toString(36).substring(2, 10);
        const sessionToken = createClientSessionToken(
          String(uid),
          sessionId,
          String(deviceId || "capacitor")
        );

        let userRecord: Record<string, unknown> | null = null;
        try {
          const snap = await getDoc(doc(db, "users", String(uid)));
          if (snap.exists()) {
            userRecord = snap.data() as Record<string, unknown>;
          }
        } catch {
          // ignore
        }

        const unlockedSubjects = normalizeUnlocked(userRecord, nowMs);
        const permanentlyUnlockedSubjects = getPermanentlyUnlocked(userRecord);
        const subjectAccess = ((userRecord?.subjectAccess || {}) as Record<
          string,
          UserSubjectAccessRecord
        >);

        const sessionDoc = {
          userId: String(uid),
          sessionId,
          sessionToken,
          deviceId: String(deviceId || "capacitor"),
          ip: "capacitor-app",
          userAgent: navigator.userAgent || "Backbencher-Android",
          createdAt: now,
          updatedAt: now,
        };

        try {
          await Promise.all([
            setDoc(doc(db, "login_sessions", String(uid)), sessionDoc, {
              merge: true,
            }),
            setDoc(
              doc(db, "users", String(uid)),
              {
                uid: String(uid),
                ...(email ? { email: String(email).toLowerCase().trim() } : {}),
                ...(displayName ? { displayName: String(displayName) } : {}),
                activeSessionId: sessionId,
                activeSessionToken: sessionToken,
                activeSessionDeviceId: String(deviceId || "capacitor"),
                activeSessionUpdatedAt: now,
              },
              { merge: true }
            ),
          ]);
        } catch {
          // ignore
        }

        return jsonResponse({
          success: true,
          sessionToken,
          unlockedSubjects,
          permanentlyUnlockedSubjects,
          subjectAccess,
          serverTime: now,
          user: {
            uid: String(uid),
            email: (userRecord?.email as string) || email || "",
            displayName:
              (userRecord?.displayName as string) || displayName || "পাঠক",
            hasAccess: unlockedSubjects.length > 0,
            unlockedSubjects,
            subjectAccess,
            role: (userRecord?.role as string) || "reader",
            unlockCode: (userRecord?.unlockCode as string) || null,
          },
        });
      }
    }
  }

  // 3. /api/unlock
  if (pathname === "/api/unlock") {
    const defaultSettings = {
      price: "৳৪৯ (প্রতি বিষয়)",
      paymentMethods: "বিকাশ / নগদ (Send Money / Personal): 017XX-XXXXXX",
      whatsappNumber: "017XX-XXXXXX",
      contactWhatsApp: BOOK_INFO.contactWhatsApp,
      telegramUsername: "@your_telegram_username",
      contactTelegram: BOOK_INFO.contactTelegram,
      freePagesLimit: BOOK_INFO.freePagesLimit,
      announcement:
        "আপনার পছন্দের বিষয় সিলেক্ট করে মেসেজ পাঠিয়ে আনলক কোড সংগ্রহ করুন।",
      freeSubjects: {} as Record<string, SubjectFreeWindow>,
      notices: [] as NoticeItem[],
    };

    if (method === "GET") {
      const uid = urlObj.searchParams.get("uid") || headerUid || storedUid;
      const sessionToken =
        urlObj.searchParams.get("sessionToken") || headerToken || storedToken;

      const nowMs = Date.now();
      const serverTime = new Date(nowMs).toISOString();

      let settings = defaultSettings;
      try {
        const sSnap = await getDoc(doc(db, "settings", "site"));
        if (sSnap.exists()) {
          settings = { ...defaultSettings, ...(sSnap.data() as object) };
        }
      } catch {
        // ignore
      }

      const globalFreeSubjects = getGlobalFreeSubjectsFromSettings(
        settings as unknown as Record<string, unknown>,
        nowMs
      );

      if (uid && sessionToken) {
        const check = await verifySessionInFirestore(uid, sessionToken);
        const effectiveUnlocked = Array.from(
          new Set([...check.unlockedSubjects, ...globalFreeSubjects])
        );
        return jsonResponse({
          unlocked: effectiveUnlocked.length > 0,
          unlockedSubjects: check.unlockedSubjects,
          effectiveUnlockedSubjects: effectiveUnlocked,
          permanentlyUnlockedSubjects: check.permanentlyUnlockedSubjects,
          globalFreeSubjects,
          subjectAccess: check.subjectAccess,
          sessionInvalidated: Boolean(check.sessionInvalidated),
          pricePerSubject: SUBJECT_PRICE_BDT,
          settings,
          serverTime,
        });
      }

      return jsonResponse({
        unlocked: globalFreeSubjects.length > 0,
        unlockedSubjects: [],
        effectiveUnlockedSubjects: globalFreeSubjects,
        permanentlyUnlockedSubjects: [],
        globalFreeSubjects,
        subjectAccess: {},
        sessionInvalidated: false,
        pricePerSubject: SUBJECT_PRICE_BDT,
        settings,
        serverTime,
      });
    }

    if (method === "POST") {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      const { code, deviceId, uid: bodyUid, email } = body;
      const activeUid = bodyUid || headerUid || storedUid;
      if (!activeUid) {
        return jsonResponse(
          {
            success: false,
            message:
              "আনলক কোড ব্যবহার করার আগে অনুগ্রহ করে রেজিস্ট্রেশন বা লগইন করুন।",
          },
          401
        );
      }
      const normalizedCode = String(code || "")
        .toUpperCase()
        .trim();
      if (!normalizedCode) {
        return jsonResponse(
          { success: false, message: "অনুগ্রহ করে আনলক কোডটি লিখুন।" },
          400
        );
      }

      const nowMs = Date.now();
      const now = new Date(nowMs).toISOString();

      try {
        const txResult = await runTransaction(db, async (transaction) => {
          const codeRef = doc(db, "unlock_codes", normalizedCode);
          const userRef = doc(db, "users", String(activeUid));
          const readingRef = doc(db, "user_reading_data", String(activeUid));

          const [codeSnap, userSnap] = await Promise.all([
            transaction.get(codeRef),
            transaction.get(userRef),
          ]);

          if (!codeSnap.exists()) {
            throw {
              status: 404,
              message:
                "❌ ভুল আনলক কোড! অনুগ্রহ করে সঠিক কোডটি লিখে আবার চেষ্টা করুন।",
            };
          }

          const codeData = codeSnap.data() as Record<string, unknown>;

          if (codeData.disabled) {
            throw {
              status: 403,
              message:
                "🚫 এই আনলক কোডটি অ্যাডমিন কর্তৃক নিষ্ক্রিয় (Disabled) করা হয়েছে।",
            };
          }

          if (codeData.expiresAt && typeof codeData.expiresAt === "string") {
            const expMs = Date.parse(codeData.expiresAt);
            if (!isNaN(expMs) && nowMs > expMs) {
              throw {
                status: 403,
                message:
                  "⏳ এই আনলক কোডটির ব্যবহারের মেয়াদ (Redeem Expiry) শেষ হয়ে গেছে।",
              };
            }
          }

          const maxUses =
            typeof codeData.maxUses === "number" && codeData.maxUses >= 1
              ? codeData.maxUses
              : 1;
          const redeemers: CodeRedeemer[] = Array.isArray(codeData.redeemers)
            ? [...(codeData.redeemers as CodeRedeemer[])]
            : codeData.used && codeData.usedByUid
            ? [
                {
                  uid: String(codeData.usedByUid),
                  email: (codeData.usedByEmail as string) || null,
                  deviceId: (codeData.usedByDevice as string) || null,
                  redeemedAt:
                    (codeData.usedAt as string) ||
                    (codeData.createdAt as string) ||
                    now,
                },
              ]
            : [];
          const usedCount =
            typeof codeData.usedCount === "number"
              ? Math.max(codeData.usedCount, redeemers.length)
              : Math.max(redeemers.length, codeData.used ? 1 : 0);

          const userData = userSnap.exists()
            ? (userSnap.data() as Record<string, unknown>)
            : {};

          const existingRedeemedCodes = Array.isArray(userData.redeemedCodes)
            ? (userData.redeemedCodes as string[])
            : [];

          const alreadyRedeemedByUser =
            redeemers.some((r) => r.uid === String(activeUid)) ||
            (maxUses === 1 &&
              codeData.used &&
              codeData.usedByUid === String(activeUid)) ||
            existingRedeemedCodes.includes(normalizedCode);

          if (alreadyRedeemedByUser) {
            throw {
              status: 403,
              message:
                "⚠️ আপনি ইতিমধ্যে এই আনলক কোডটি ব্যবহার করেছেন। একই কোড একজন ইউজার দুইবার ব্যবহার করতে পারবেন না।",
            };
          }

          if (usedCount >= maxUses || (maxUses === 1 && codeData.used)) {
            throw {
              status: 403,
              message:
                maxUses === 1
                  ? "⚠️ এই আনলক কোডটি ইতিমধ্যে ব্যবহৃত হয়েছে। প্রতিটি কোড শুধুমাত্র একবার ব্যবহারযোগ্য।"
                  : `⚠️ এই কোডটির ব্যবহারের সীমা (${maxUses} জন) পূর্ণ হয়ে গেছে।`,
            };
          }

          const assignedSubjectIds =
            Array.isArray(codeData.assignedSubjectIds) &&
            codeData.assignedSubjectIds.length > 0
              ? (codeData.assignedSubjectIds as string[]).filter((id) =>
                  ALL_SUBJECT_IDS.includes(id)
                )
              : [...ALL_SUBJECT_IDS];

          const durationDays =
            typeof codeData.accessDurationDays === "number" &&
            codeData.accessDurationDays > 0
              ? codeData.accessDurationDays
              : null;
          const isCodePermanent = durationDays === null;
          const codeAccessExpiresAt = isCodePermanent
            ? null
            : new Date(nowMs + durationDays * 24 * 60 * 60 * 1000).toISOString();

          const newUsedCount = usedCount + 1;
          const newRedeemers: CodeRedeemer[] = [
            ...redeemers,
            {
              uid: String(activeUid),
              email: email || (userData.email as string) || null,
              deviceId: String(deviceId || headerDevice || "capacitor"),
              redeemedAt: now,
            },
          ];

          const prevActiveSubjects = normalizeUnlocked(userData, nowMs);
          const prevPermanentSubjects = getPermanentlyUnlocked(userData);
          const subjectAccessMap: Record<string, UserSubjectAccessRecord> = {
            ...((userData.subjectAccess || {}) as Record<
              string,
              UserSubjectAccessRecord
            >),
          };

          for (const permId of prevPermanentSubjects) {
            if (!subjectAccessMap[permId]) {
              subjectAccessMap[permId] = {
                userId: String(activeUid),
                subjectId: permId,
                unlockCode: (userData.unlockCode as string) || "LEGACY",
                unlockDate: (userData.createdAt as string) || now,
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

            if (isCodePermanent || wasAlreadyPermanent) {
              subjectAccessMap[subId] = {
                userId: String(activeUid),
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
                userId: String(activeUid),
                subjectId: subId,
                unlockCode: normalizedCode,
                unlockDate: now,
                status: "active",
                isPermanent: false,
                expiresAt: bestExpiresAt,
              };
            }
          }

          const mergedRedeemedCodes = Array.from(
            new Set([...existingRedeemedCodes, normalizedCode])
          );

          const updatedUserDraft = {
            ...userData,
            uid: String(activeUid),
            unlockedSubjects: Array.from(
              new Set([...prevActiveSubjects, ...assignedSubjectIds])
            ),
            subjectAccess: subjectAccessMap,
          };

          const activeUnlocked = normalizeUnlocked(updatedUserDraft, nowMs);
          const permanentUnlocked = getPermanentlyUnlocked(updatedUserDraft);
          const newlyUnlocked = assignedSubjectIds.filter(
            (id) => !prevActiveSubjects.includes(id)
          );

          transaction.set(
            codeRef,
            {
              ...codeData,
              code: normalizedCode,
              maxUses,
              usedCount: newUsedCount,
              redeemers: newRedeemers,
              used: newUsedCount >= maxUses,
              assignedSubjectIds,
              usedByUid: String(activeUid),
              usedByEmail: email || userData.email || null,
              usedByDevice: String(deviceId || headerDevice || "capacitor"),
              usedAt: now,
            },
            { merge: true }
          );

          transaction.set(
            userRef,
            {
              uid: String(activeUid),
              hasAccess: activeUnlocked.length > 0,
              unlockedSubjects: activeUnlocked,
              redeemedCodes: mergedRedeemedCodes,
              subjectAccess: subjectAccessMap,
              unlockCode: normalizedCode,
              unlockedAt: now,
            },
            { merge: true }
          );

          transaction.set(
            readingRef,
            {
              uid: String(activeUid),
              unlockedSubjects: permanentUnlocked,
              redeemedCodes: mergedRedeemedCodes,
              updatedAt: now,
            },
            { merge: true }
          );

          return {
            activeUnlocked,
            permanentUnlocked,
            subjectAccessMap,
            newlyUnlocked:
              newlyUnlocked.length > 0 ? newlyUnlocked : assignedSubjectIds,
            assignedSubjectIds,
            isCodePermanent,
            durationDays,
            codeAccessExpiresAt,
          };
        });

        const unlockedNames = CHAPTERS.filter((ch) =>
          txResult.assignedSubjectIds.includes(ch.id)
        )
          .map((ch) => `বই ${ch.bookNumber} (${ch.courseCode})`)
          .join(", ");

        const durationSuffix = txResult.isCodePermanent
          ? " (স্থায়ী অ্যাক্সেস)"
          : ` (${txResult.durationDays} দিনের জন্য)`;

        return jsonResponse({
          success: true,
          message: `🎉 সফলভাবে আনলক হয়েছে: ${unlockedNames}${durationSuffix}!`,
          unlockedSubjects: txResult.activeUnlocked,
          permanentlyUnlockedSubjects: txResult.permanentUnlocked,
          subjectAccess: txResult.subjectAccessMap,
          newlyUnlockedSubjects: txResult.newlyUnlocked,
          code: normalizedCode,
          isPermanentUnlock: txResult.isCodePermanent,
          accessDurationDays: txResult.durationDays,
          accessExpiresAt: txResult.codeAccessExpiresAt,
          serverTime: now,
        });
      } catch (err: unknown) {
        const customErr = err as { status?: number; message?: string };
        if (customErr && typeof customErr.status === "number" && customErr.message) {
          return jsonResponse(
            {
              success: false,
              message: customErr.message,
              serverTime: now,
            },
            customErr.status
          );
        }
        return jsonResponse(
          {
            success: false,
            message: "সার্ভার সমস্যা হয়েছে। আবার চেষ্টা করুন।",
            serverTime: now,
          },
          500
        );
      }
    }
  }

  // 4. /api/user-data
  if (pathname === "/api/user-data") {
    if (method === "GET") {
      const uid = urlObj.searchParams.get("uid") || headerUid || storedUid;
      const sessionToken =
        urlObj.searchParams.get("sessionToken") || headerToken || storedToken;
      if (!uid) {
        return jsonResponse({ data: null, unlockedSubjects: [] });
      }
      if (sessionToken) {
        const check = await verifySessionInFirestore(uid, sessionToken);
        if (!check.valid && check.sessionInvalidated) {
          return jsonResponse(
            { data: null, sessionInvalidated: true, unlockedSubjects: [] },
            401
          );
        }
      }
      try {
        const [rSnap, uSnap] = await Promise.all([
          getDoc(doc(db, "user_reading_data", uid)),
          getDoc(doc(db, "users", uid)),
        ]);
        const rData = rSnap.exists()
          ? (rSnap.data() as Record<string, unknown>)
          : null;
        const uData = uSnap.exists()
          ? (uSnap.data() as Record<string, unknown>)
          : null;
        const unlockedSubjects = uData
          ? normalizeUnlocked(uData)
          : Array.isArray(rData?.unlockedSubjects)
          ? (rData.unlockedSubjects as string[])
          : [];
        return jsonResponse({
          data: rData
            ? { ...rData, unlockedSubjects }
            : {
                uid,
                unlockedSubjects,
                bookmarks: [],
                progress: { chapterIndex: 0, pageNumber: 1, scrollPercent: 0 },
              },
          unlockedSubjects,
        });
      } catch {
        return jsonResponse({ data: null, unlockedSubjects: [] });
      }
    }

    if (method === "POST") {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      const {
        uid,
        sessionToken: bodyToken,
        bookmarks,
        progress,
        perBookProgress,
        preferences,
      } = body;
      if (!uid) {
        return jsonResponse({ success: false, message: "লগইন প্রয়োজন।" }, 400);
      }
      const token = bodyToken || headerToken || storedToken;
      if (token) {
        const check = await verifySessionInFirestore(String(uid), String(token));
        if (!check.valid && check.sessionInvalidated) {
          return jsonResponse(
            {
              success: false,
              sessionInvalidated: true,
              message: "আপনার সেশনটি অন্য ডিভাইসে লগইন হওয়ার কারণে বাতিল হয়েছে।",
            },
            401
          );
        }
      }

      const payload: Record<string, unknown> = {
        uid: String(uid),
        updatedAt: new Date().toISOString(),
      };
      if (bookmarks !== undefined) payload.bookmarks = bookmarks;
      if (progress !== undefined) payload.progress = progress;
      if (perBookProgress !== undefined)
        payload.perBookProgress = perBookProgress;
      if (preferences !== undefined) payload.preferences = preferences;

      try {
        await setDoc(doc(db, "user_reading_data", String(uid)), payload, {
          merge: true,
        });
      } catch {
        // ignore
      }

      return jsonResponse({
        success: true,
        data: payload,
      });
    }
  }

  // 5. /api/offline-lease
  if (pathname === "/api/offline-lease" && method === "POST") {
    if (!isDeviceOnline()) {
      return jsonResponse(
        {
          success: false,
          message:
            "ইন্টারনেট সংযোগ নেই! বইটি অফলাইনে ডাউনলোড করতে অনুগ্রহ করে ডাটা বা Wi-Fi চালু করুন।",
        },
        503
      );
    }

    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const {
      action = "acquire",
      uid: bodyUid,
      sessionToken: bodyToken,
      deviceId: bodyDevice,
      chapterIndex,
      subjectId: bodySubjectId,
    } = body;

    const uid = bodyUid || headerUid || storedUid;
    const sessionToken = bodyToken || headerToken || storedToken;
    const deviceId = bodyDevice || headerDevice || "capacitor";

    if (!uid || !sessionToken) {
      return jsonResponse(
        {
          success: false,
          message: "অফলাইন মোড ব্যবহার করতে অনুগ্রহ করে লগইন করুন।",
        },
        401
      );
    }

    let check;
    try {
      check = await verifySessionInFirestore(
        String(uid),
        String(sessionToken),
        true
      );
    } catch {
      return jsonResponse(
        {
          success: false,
          message:
            "ইন্টারনেট সংযোগ নেই! বইটি অফলাইনে ডাউনলোড করতে অনুগ্রহ করে ডাটা বা Wi-Fi চালু করুন।",
        },
        503
      );
    }

    if (!check.valid) {
      return jsonResponse(
        {
          success: false,
          sessionInvalidated: Boolean(check.sessionInvalidated),
          message: "আপনার লগইন সেশনটি আর সক্রিয় নেই। আবার লগইন করে চেষ্টা করুন।",
        },
        401
      );
    }

    const resolvedSubjectId =
      bodySubjectId ||
      (typeof chapterIndex === "number" && CHAPTERS[chapterIndex]
        ? CHAPTERS[chapterIndex].id
        : undefined);

    const expiresAt = new Date(
      Date.now() + OFFLINE_LEASE_DURATION_MS
    ).toISOString();

    if (action === "acquire" || action === "renew") {
      try {
        await withTimeout(
          setDoc(
            doc(db, "users", String(uid)),
            {
              offlineDeviceId: String(deviceId),
              offlineLeaseExpiresAt: expiresAt,
            },
            { merge: true }
          ),
          3500
        );
      } catch {
        return jsonResponse(
          {
            success: false,
            message:
              "ইন্টারনেট সংযোগ নেই! বইটি অফলাইনে ডাউনলোড করতে অনুগ্রহ করে ডাটা বা Wi-Fi চালু করুন।",
          },
          503
        );
      }
      return jsonResponse({
        success: true,
        expiresAt,
        offlineSubjectIds: resolvedSubjectId ? [resolvedSubjectId] : [],
        message: "অফলাইন লিজ সফলভাবে সক্রিয় হয়েছে।",
      });
    }

    if (action === "release") {
      return jsonResponse({
        success: true,
        offlineSubjectIds: [],
        message: "অফলাইন লিজ রিলিজ করা হয়েছে।",
      });
    }
  }

  // 6. /api/admin/codes
  if (pathname === "/api/admin/codes") {
    if (method === "GET") {
      const [codesSnap, settingsSnap] = await Promise.all([
        getDocs(collection(db, "unlock_codes")),
        getDoc(doc(db, "settings", "site")),
      ]);
      const codes = codesSnap.docs
        .map((d) => d.data())
        .sort(
          (a, b) =>
            new Date((b.createdAt as string) || 0).getTime() -
            new Date((a.createdAt as string) || 0).getTime()
        );
      const settings = settingsSnap.exists() ? settingsSnap.data() : {};
      return jsonResponse({
        codes,
        settings,
        notices: Array.isArray((settings as Record<string, unknown>).notices)
          ? (settings as Record<string, unknown>).notices
          : [],
        serverTime: new Date().toISOString(),
        subjects: CHAPTERS.map((ch) => ({
          id: ch.id,
          index: ch.index,
          bookNumber: ch.bookNumber,
          courseCode: ch.courseCode,
          titleBn: ch.titleBn,
        })),
      });
    }

    if (method === "POST") {
      const reqBody = init?.body ? JSON.parse(String(init.body)) : {};
      const {
        action = "generate",
        count = 1,
        customCode,
        prefix,
        codeLength = 8,
        maxUses = 1,
        accessDurationDays = null,
        expiresAt = null,
        disabled,
        note,
        code,
        settings,
        assignedSubjectIds,
        subjectIds,
        subjectId,
        enabled,
        isUnlimited,
        durationDays,
        startAt,
        endAt,
        extendDays,
        noticeTitle,
        noticeBody,
        noticeImportant,
        title,
        body: noticeBodyField,
        important,
        noticeId,
      } = reqBody;

      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();

      if (action === "generate") {
        const validSubjects: string[] = Array.isArray(assignedSubjectIds)
          ? assignedSubjectIds.filter((id: string) =>
              ALL_SUBJECT_IDS.includes(id)
            )
          : ALL_SUBJECT_IDS;
        const normalizedMaxUses = Math.min(
          Math.max(1, Math.floor(Number(maxUses) || 1)),
          10000
        );
        const normalizedDurationDays =
          accessDurationDays !== null &&
          accessDurationDays !== undefined &&
          accessDurationDays !== "" &&
          Number(accessDurationDays) > 0
            ? Math.floor(Number(accessDurationDays))
            : null;
        const normalizedExpiresAt =
          expiresAt &&
          String(expiresAt).trim() &&
          !isNaN(Date.parse(String(expiresAt)))
            ? new Date(String(expiresAt)).toISOString()
            : null;

        const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        const cleanPrefix = String(prefix || "")
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, "")
          .slice(0, 8);
        const len = Math.min(Math.max(4, Number(codeLength) || 8), 16);

        const created: string[] = [];
        const num =
          customCode && String(customCode).trim()
            ? 1
            : Math.min(Math.max(1, Number(count) || 1), 200);

        for (let i = 0; i < num; i++) {
          let newCode = "";
          if (customCode && String(customCode).trim()) {
            newCode = String(customCode).toUpperCase().trim();
          } else {
            let raw = "";
            for (let j = 0; j < len; j++) {
              raw += chars[Math.floor(Math.random() * chars.length)];
            }
            const grouped =
              raw.length >= 8 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw;
            newCode = cleanPrefix ? `${cleanPrefix}-${grouped}` : grouped;
          }
          const rec = {
            code: newCode,
            used: false,
            disabled: false,
            maxUses: normalizedMaxUses,
            usedCount: 0,
            redeemers: [],
            accessDurationDays: normalizedDurationDays,
            expiresAt: normalizedExpiresAt,
            assignedSubjectIds: validSubjects,
            note: note || "",
            createdAt: nowIso,
          };
          await setDoc(doc(db, "unlock_codes", newCode), rec, { merge: true });
          created.push(newCode);
        }

        const codesSnap = await getDocs(collection(db, "unlock_codes"));
        return jsonResponse({
          success: true,
          newCodes: created,
          codes: codesSnap.docs.map((d) => d.data()),
          serverTime: nowIso,
        });
      }

      if (action === "toggle_disable" && code) {
        const clean = String(code).toUpperCase().trim();
        await setDoc(
          doc(db, "unlock_codes", clean),
          { disabled: Boolean(disabled) },
          { merge: true }
        );
        const codesSnap = await getDocs(collection(db, "unlock_codes"));
        return jsonResponse({
          success: true,
          codes: codesSnap.docs.map((d) => d.data()),
          serverTime: nowIso,
        });
      }

      if (action === "reset" && code) {
        const clean = String(code).toUpperCase().trim();
        await setDoc(
          doc(db, "unlock_codes", clean),
          {
            used: false,
            usedCount: 0,
            redeemers: [],
            usedByUid: null,
            usedByEmail: null,
            usedByDevice: null,
            usedAt: null,
          },
          { merge: true }
        );
        const codesSnap = await getDocs(collection(db, "unlock_codes"));
        return jsonResponse({
          success: true,
          codes: codesSnap.docs.map((d) => d.data()),
          serverTime: nowIso,
        });
      }

      if (action === "delete" && code) {
        const clean = String(code).toUpperCase().trim();
        await deleteDoc(doc(db, "unlock_codes", clean));
        const codesSnap = await getDocs(collection(db, "unlock_codes"));
        return jsonResponse({
          success: true,
          codes: codesSnap.docs.map((d) => d.data()),
          serverTime: nowIso,
        });
      }

      if (action === "set_free_subjects") {
        const sSnap = await getDoc(doc(db, "settings", "site"));
        const currentSettings = (sSnap.exists() ? sSnap.data() : {}) as Record<
          string,
          unknown
        >;
        const freeSubjectsMap: Record<string, SubjectFreeWindow> = {
          ...((currentSettings.freeSubjects || {}) as Record<
            string,
            SubjectFreeWindow
          >),
        };
        const targetIds: string[] = Array.isArray(subjectIds)
          ? subjectIds.filter((id: string) => ALL_SUBJECT_IDS.includes(id))
          : subjectId && ALL_SUBJECT_IDS.includes(String(subjectId))
          ? [String(subjectId)]
          : [];

        for (const subId of targetIds) {
          if (!enabled) {
            freeSubjectsMap[subId] = {
              subjectId: subId,
              enabled: false,
              isUnlimited: false,
              durationDays: null,
              startAt: freeSubjectsMap[subId]?.startAt || nowIso,
              endAt: nowIso,
              updatedAt: nowIso,
            };
            continue;
          }
          const existingWin = freeSubjectsMap[subId];
          const parsedStartMs =
            startAt && !isNaN(Date.parse(String(startAt)))
              ? Date.parse(String(startAt))
              : nowMs;
          const effectiveStartIso = new Date(parsedStartMs).toISOString();

          if (isUnlimited) {
            freeSubjectsMap[subId] = {
              subjectId: subId,
              enabled: true,
              isUnlimited: true,
              durationDays: null,
              startAt: effectiveStartIso,
              endAt: null,
              updatedAt: nowIso,
            };
          } else if (extendDays && Number(extendDays) > 0 && existingWin) {
            const baseEndMs =
              existingWin.endAt && !isNaN(Date.parse(existingWin.endAt))
                ? Math.max(nowMs, Date.parse(existingWin.endAt))
                : nowMs;
            freeSubjectsMap[subId] = {
              subjectId: subId,
              enabled: true,
              isUnlimited: false,
              durationDays:
                (existingWin.durationDays || 0) + Number(extendDays),
              startAt: existingWin.startAt || nowIso,
              endAt: new Date(
                baseEndMs + Number(extendDays) * 24 * 60 * 60 * 1000
              ).toISOString(),
              updatedAt: nowIso,
            };
          } else {
            const days = Math.max(1, Number(durationDays) || 1);
            freeSubjectsMap[subId] = {
              subjectId: subId,
              enabled: true,
              isUnlimited: false,
              durationDays: days,
              startAt: effectiveStartIso,
              endAt:
                endAt && !isNaN(Date.parse(String(endAt)))
                  ? new Date(String(endAt)).toISOString()
                  : new Date(
                      parsedStartMs + days * 24 * 60 * 60 * 1000
                    ).toISOString(),
              updatedAt: nowIso,
            };
          }
        }

        const updatedSettings = {
          ...currentSettings,
          freeSubjects: freeSubjectsMap,
        };
        await setDoc(doc(db, "settings", "site"), updatedSettings, {
          merge: true,
        });
        return jsonResponse({
          success: true,
          settings: updatedSettings,
          serverTime: nowIso,
        });
      }

      if (action === "add_notice") {
        const effectiveTitle = noticeTitle ?? title;
        const effectiveBody = noticeBody ?? noticeBodyField;
        const effectiveImportant = noticeImportant ?? important;

        const sSnap = await getDoc(doc(db, "settings", "site"));
        const currentSettings = (sSnap.exists() ? sSnap.data() : {}) as Record<
          string,
          unknown
        >;
        const newNotice: NoticeItem = {
          id:
            "ntc_" +
            Date.now().toString(36) +
            "_" +
            Math.random().toString(36).slice(2, 6),
          title: String(effectiveTitle || "গুরুত্বপূর্ণ নোটিশ").trim(),
          body: String(effectiveBody || "").trim(),
          createdAt: nowIso,
          important: Boolean(effectiveImportant),
        };
        const nextNotices = [
          newNotice,
          ...(Array.isArray(currentSettings.notices)
            ? (currentSettings.notices as NoticeItem[])
            : []),
        ];
        const updatedSettings = {
          ...currentSettings,
          notices: nextNotices,
          announcement: newNotice.body,
        };
        await setDoc(doc(db, "settings", "site"), updatedSettings, {
          merge: true,
        });
        return jsonResponse({
          success: true,
          settings: updatedSettings,
          notices: nextNotices,
          notice: newNotice,
          serverTime: nowIso,
        });
      }

      if (action === "delete_notice" && noticeId) {
        const sSnap = await getDoc(doc(db, "settings", "site"));
        const currentSettings = (sSnap.exists() ? sSnap.data() : {}) as Record<
          string,
          unknown
        >;
        const nextNotices = (
          Array.isArray(currentSettings.notices)
            ? (currentSettings.notices as NoticeItem[])
            : []
        ).filter((n) => n.id !== String(noticeId));
        const updatedSettings = {
          ...currentSettings,
          notices: nextNotices,
          announcement: nextNotices[0]?.body || "",
        };
        await setDoc(doc(db, "settings", "site"), updatedSettings, {
          merge: true,
        });
        return jsonResponse({
          success: true,
          settings: updatedSettings,
          notices: nextNotices,
          serverTime: nowIso,
        });
      }

      if (action === "settings" && settings) {
        await setDoc(doc(db, "settings", "site"), settings, { merge: true });
        return jsonResponse({
          success: true,
          settings,
          serverTime: nowIso,
        });
      }
    }
  }

  return jsonResponse({ error: "Not found" }, 404);
}

export function installCapacitorLocalApiBridge(): void {
  if (typeof window === "undefined" || bridgeInstalled) return;
  if (!isCapacitorNativeApp()) return;

  bridgeInstalled = true;
  const nativeFetch = window.fetch.bind(window);
  (window as unknown as { __nativeFetch?: typeof fetch }).__nativeFetch =
    nativeFetch;

  window.fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    const rawUrl =
      typeof input === "string"
        ? input
        : input instanceof URL
        ? input.toString()
        : input.url;

    if (rawUrl.startsWith("/api/") || rawUrl.includes("://localhost/api/")) {
      const urlObj = new URL(rawUrl, window.location.origin);
      return handleLocalApiRequest(urlObj, init);
    }

    return nativeFetch(input, init);
  };
}
