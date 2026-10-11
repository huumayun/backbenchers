"use client";

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
import type { ParsedBookPage, BookToc } from "@/lib/book/server-parser";

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

function normalizeUnlocked(user?: Record<string, unknown> | null): string[] {
  if (!user) return [];
  if (user.role === "admin") return [...ALL_SUBJECT_IDS];
  if (Array.isArray(user.unlockedSubjects) && user.unlockedSubjects.length > 0) {
    return Array.from(
      new Set(
        (user.unlockedSubjects as string[]).filter((id) =>
          ALL_SUBJECT_IDS.includes(id)
        )
      )
    );
  }
  if (user.hasAccess && !Array.isArray(user.unlockedSubjects)) {
    return [...ALL_SUBJECT_IDS];
  }
  return [];
}

async function verifySessionInFirestore(
  uid?: string | null,
  sessionToken?: string | null
): Promise<{
  valid: boolean;
  sessionInvalidated?: boolean;
  unlockedSubjects: string[];
  user?: Record<string, unknown> | null;
}> {
  if (!uid || !sessionToken) {
    return { valid: false, unlockedSubjects: [] };
  }
  const parsed = parseSessionTokenAny(sessionToken);
  if (!parsed.valid || parsed.uid !== uid || !parsed.sessionId) {
    return { valid: false, sessionInvalidated: true, unlockedSubjects: [] };
  }

  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) {
      return { valid: true, unlockedSubjects: [], user: null };
    }
    const userData = snap.data() as Record<string, unknown>;
    const activeSessionId = (userData.activeSessionId as string) || null;
    if (activeSessionId && activeSessionId !== parsed.sessionId) {
      return {
        valid: false,
        sessionInvalidated: true,
        unlockedSubjects: [],
      };
    }
    const unlockedSubjects = normalizeUnlocked(userData);
    return {
      valid: true,
      unlockedSubjects,
      user: {
        ...userData,
        uid,
        unlockedSubjects,
        hasAccess: unlockedSubjects.length > 0,
      },
    };
  } catch {
    // Fallback to cached local profile if Firestore read fails momentarily
    try {
      const localUnlocked = JSON.parse(
        localStorage.getItem("ebook_unlocked_subjects") || "[]"
      );
      return {
        valid: true,
        unlockedSubjects: Array.isArray(localUnlocked) ? localUnlocked : [],
      };
    } catch {
      return { valid: true, unlockedSubjects: [] };
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
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw new Error("Network offline");
  }

  const pathname = urlObj.pathname;
  const method = (init?.method || "GET").toUpperCase();
  const headerUid = extractHeader(init, "x-user-uid");
  const headerToken = extractHeader(init, "x-session-token");
  const headerDevice = extractHeader(init, "x-device-id");

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

    const sessionCheck =
      uid && sessionToken
        ? await verifySessionInFirestore(uid, sessionToken)
        : { valid: false, sessionInvalidated: false, unlockedSubjects: [] };

    const unlockedSubjects = sessionCheck.unlockedSubjects;
    const sessionInvalidated = Boolean(sessionCheck.sessionInvalidated);

    const { css, pages, tocs } = await loadBundledBook();

    if (search !== null) {
      const q = search.trim().toLowerCase();
      if (q.length < 2) {
        return jsonResponse({
          results: [],
          unlockedSubjects,
          sessionInvalidated,
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
        sessionInvalidated,
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
        sessionInvalidated,
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
      sessionInvalidated,
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
    if (method === "GET") {
      const uid = urlObj.searchParams.get("uid") || headerUid || storedUid;
      const sessionToken =
        urlObj.searchParams.get("sessionToken") || headerToken || storedToken;
      if (!uid || !sessionToken) {
        return jsonResponse({
          valid: false,
          sessionInvalidated: false,
          unlockedSubjects: [],
        });
      }
      const check = await verifySessionInFirestore(uid, sessionToken);
      if (!check.valid) {
        return jsonResponse(
          {
            valid: false,
            sessionInvalidated: Boolean(check.sessionInvalidated),
            unlockedSubjects: [],
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
        user: check.user || null,
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
        return jsonResponse({ success: true, message: "লগআউট সফল হয়েছে।" });
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
        const now = new Date().toISOString();
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

        const unlockedSubjects = normalizeUnlocked(userRecord);
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
          user: {
            uid: String(uid),
            email: (userRecord?.email as string) || email || "",
            displayName:
              (userRecord?.displayName as string) || displayName || "পাঠক",
            hasAccess: unlockedSubjects.length > 0,
            unlockedSubjects,
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
        "প্রতি বিষয় মাত্র ৳৪৯! আপনার পছন্দের বিষয়গুলো সিলেক্ট করে টেলিগ্রামে মেসেজ পাঠিয়ে আনলক কোড নিন।",
    };

    if (method === "GET") {
      const uid = urlObj.searchParams.get("uid") || headerUid || storedUid;
      const sessionToken =
        urlObj.searchParams.get("sessionToken") || headerToken || storedToken;

      let settings = defaultSettings;
      try {
        const sSnap = await getDoc(doc(db, "settings", "site"));
        if (sSnap.exists()) {
          settings = { ...defaultSettings, ...(sSnap.data() as object) };
        }
      } catch {
        // ignore
      }

      if (uid && sessionToken) {
        const check = await verifySessionInFirestore(uid, sessionToken);
        return jsonResponse({
          unlocked: check.unlockedSubjects.length > 0,
          unlockedSubjects: check.unlockedSubjects,
          sessionInvalidated: Boolean(check.sessionInvalidated),
          pricePerSubject: SUBJECT_PRICE_BDT,
          settings,
        });
      }

      return jsonResponse({
        unlocked: false,
        unlockedSubjects: [],
        sessionInvalidated: false,
        pricePerSubject: SUBJECT_PRICE_BDT,
        settings,
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

      const codeRef = doc(db, "unlock_codes", normalizedCode);
      const codeSnap = await getDoc(codeRef);
      if (!codeSnap.exists()) {
        return jsonResponse(
          {
            success: false,
            message:
              "❌ ভুল আনলক কোড! অনুগ্রহ করে সঠিক কোডটি লিখে আবার চেষ্টা করুন।",
          },
          404
        );
      }

      const codeData = codeSnap.data() as Record<string, unknown>;
      if (codeData.used) {
        return jsonResponse(
          {
            success: false,
            message:
              "⚠️ এই আনলক কোডটি ইতিমধ্যে ব্যবহৃত হয়েছে। প্রতিটি কোড শুধুমাত্র একবার ব্যবহারযোগ্য।",
          },
          403
        );
      }

      const assignedSubjectIds =
        Array.isArray(codeData.assignedSubjectIds) &&
        codeData.assignedSubjectIds.length > 0
          ? (codeData.assignedSubjectIds as string[]).filter((id) =>
              ALL_SUBJECT_IDS.includes(id)
            )
          : [...ALL_SUBJECT_IDS];

      const now = new Date().toISOString();
      const userRef = doc(db, "users", String(activeUid));
      const userSnap = await getDoc(userRef);
      const userData = userSnap.exists()
        ? (userSnap.data() as Record<string, unknown>)
        : {};
      const existingSubjects = normalizeUnlocked(userData);
      const mergedSubjects = Array.from(
        new Set([...existingSubjects, ...assignedSubjectIds])
      );
      const newlyUnlocked = assignedSubjectIds.filter(
        (id) => !existingSubjects.includes(id)
      );

      await Promise.all([
        setDoc(
          codeRef,
          {
            ...codeData,
            code: normalizedCode,
            used: true,
            assignedSubjectIds,
            usedByUid: String(activeUid),
            usedByEmail: email || userData.email || null,
            usedByDevice: String(deviceId || headerDevice || "capacitor"),
            usedAt: now,
          },
          { merge: true }
        ),
        setDoc(
          userRef,
          {
            uid: String(activeUid),
            hasAccess: mergedSubjects.length > 0,
            unlockedSubjects: mergedSubjects,
            unlockCode: normalizedCode,
            unlockedAt: now,
          },
          { merge: true }
        ),
        setDoc(
          doc(db, "user_reading_data", String(activeUid)),
          {
            uid: String(activeUid),
            unlockedSubjects: mergedSubjects,
            updatedAt: now,
          },
          { merge: true }
        ),
      ]);

      const unlockedNames = CHAPTERS.filter((ch) =>
        assignedSubjectIds.includes(ch.id)
      )
        .map((ch) => `বই ${ch.bookNumber} (${ch.courseCode})`)
        .join(", ");

      return jsonResponse({
        success: true,
        message: `🎉 সফলভাবে আনলক হয়েছে: ${unlockedNames}!`,
        unlockedSubjects: mergedSubjects,
        newlyUnlockedSubjects:
          newlyUnlocked.length > 0 ? newlyUnlocked : assignedSubjectIds,
        code: normalizedCode,
      });
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
        const unlockedSubjects = Array.from(
          new Set([
            ...(Array.isArray(rData?.unlockedSubjects)
              ? (rData.unlockedSubjects as string[])
              : []),
            ...normalizeUnlocked(uData),
          ])
        );
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

    const check = await verifySessionInFirestore(String(uid), String(sessionToken));
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
        await setDoc(
          doc(db, "users", String(uid)),
          {
            offlineDeviceId: String(deviceId),
            offlineLeaseExpiresAt: expiresAt,
          },
          { merge: true }
        );
      } catch {
        // ignore
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
      const [codesSnap, usersSnap] = await Promise.all([
        getDocs(collection(db, "unlock_codes")),
        getDocs(collection(db, "users")),
      ]);
      const codes = codesSnap.docs.map((d) => d.data());
      const users = usersSnap.docs.map((d) => d.data());
      return jsonResponse({
        codes,
        users,
        subjects: CHAPTERS.map((ch) => ({
          id: ch.id,
          bookNumber: ch.bookNumber,
          courseCode: ch.courseCode,
          titleBn: ch.titleBn,
        })),
      });
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
