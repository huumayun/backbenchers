"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import { User, onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase/config";
import { loginUser, registerUser, logoutUser } from "@/lib/firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { BOOK_INFO, CHAPTERS } from "@/lib/book/chapters";
import {
  getSavedOfflineChaptersSync,
  saveBookForOfflineApp,
  removeBookFromOfflineApp,
  wipeAllOfflineBooks,
  renewAllOfflineLeasesOnServer,
} from "@/lib/offline/offlineStore";
import { installCapacitorLocalApiBridge } from "@/lib/capacitor/localApiBridge";

if (typeof window !== "undefined") {
  installCapacitorLocalApiBridge();
}


export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  hasAccess: boolean;
  unlockedSubjects?: string[];
  role: "reader" | "admin";
  unlockCode?: string | null;
  subjectAccess?: Record<string, { unlockCode?: string; unlockDate?: string }>;
  redeemedCodes?: string[];
}

export interface SiteSettingsClient {
  price: string;
  regularPrice?: number;
  offerPrice?: number;
  isOfferActive?: boolean;
  contactChannel?: "telegram" | "whatsapp" | "both";
  pricePerSubject?: number;
  paymentMethods: string;
  whatsappNumber: string;
  contactWhatsApp: string;
  telegramUsername: string;
  contactTelegram: string;
  freePagesLimit: number;
  announcement: string;
}

export interface LocalBookmark {
  id: string;
  pageNumber: number;
  chapterIndex: number;
  chapterTitle: string;
  label: string;
  pageOffset?: number;
  mode?: "read" | "flipbook";
  createdAt: string;
}

export interface ReadingProgressData {
  chapterIndex: number;
  pageNumber: number;
  pageOffset?: number;
  scrollPercent: number;
  mode?: "read" | "flipbook";
  hasReadBefore?: boolean;
  updatedAt?: string;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  isLoggedIn: boolean;
  loading: boolean;
  hasAccess: boolean;
  hasAllSubjectsUnlocked: boolean;
  unlockedSubjects: string[];
  isSubjectUnlocked: (subjectIdOrChapterIndex: string | number) => boolean;
  isAdmin: boolean;
  deviceId: string;
  accessToken: string | null;
  sessionToken: string | null;
  unlockedCode: string | null;
  settings: SiteSettingsClient;
  showUnlockModal: boolean;
  setShowUnlockModal: (open: boolean) => void;
  sessionAlertMessage: string | null;
  clearSessionAlert: () => void;
  handleSessionInvalidated: (reason?: string) => void;
  signIn: (email: string, password: string) => Promise<{ success: boolean; message: string }>;
  signUp: (
    name: string,
    email: string,
    password: string
  ) => Promise<{ success: boolean; message: string }>;
  signOutUser: () => Promise<void>;
  unlockWithCode: (code: string) => Promise<{
    success: boolean;
    message: string;
    unlockedSubjects?: string[];
    newlyUnlockedSubjects?: string[];
  }>;
  refreshProfile: () => Promise<void>;
  bookmarks: LocalBookmark[];
  addBookmarkItem: (bm: Omit<LocalBookmark, "id" | "createdAt">) => Promise<void>;
  removeBookmarkItem: (id: string) => Promise<void>;
  progress: ReadingProgressData;
  perBookProgress: Record<string, ReadingProgressData>;
  updateProgress: (data: Partial<ReadingProgressData>) => void;
  offlineBookIndices: number[];
  savingOfflineChapter: number | null;
  isBookSavedOffline: (chapterIndex: number) => boolean;
  toggleOfflineBook: (chapterIndex: number) => Promise<{
    success: boolean;
    saved: boolean;
    message: string;
  }>;
}

const DEFAULT_SETTINGS: SiteSettingsClient = {
  price: "৳৪৯ (প্রতি বিষয়)",
  regularPrice: 49,
  offerPrice: 39,
  isOfferActive: false,
  contactChannel: "both",
  paymentMethods: BOOK_INFO.paymentMethods,
  whatsappNumber: BOOK_INFO.whatsappNumber,
  contactWhatsApp: BOOK_INFO.contactWhatsApp,
  telegramUsername: BOOK_INFO.telegramUsername,
  contactTelegram: BOOK_INFO.contactTelegram,
  freePagesLimit: BOOK_INFO.freePagesLimit,
  announcement:
    "আপনার পছন্দের বিষয় সিলেক্ট করে মেসেজ পাঠিয়ে আনলক কোড সংগ্রহ করুন।",
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  isLoggedIn: false,
  loading: true,
  hasAccess: false,
  hasAllSubjectsUnlocked: false,
  unlockedSubjects: [],
  isSubjectUnlocked: () => false,
  isAdmin: false,
  deviceId: "",
  accessToken: null,
  sessionToken: null,
  unlockedCode: null,
  settings: DEFAULT_SETTINGS,
  showUnlockModal: false,
  setShowUnlockModal: () => {},
  sessionAlertMessage: null,
  clearSessionAlert: () => {},
  handleSessionInvalidated: () => {},
  signIn: async () => ({ success: false, message: "" }),
  signUp: async () => ({ success: false, message: "" }),
  signOutUser: async () => {},
  unlockWithCode: async () => ({ success: false, message: "" }),
  refreshProfile: async () => {},
  bookmarks: [],
  addBookmarkItem: async () => {},
  removeBookmarkItem: async () => {},
  progress: {
    chapterIndex: 0,
    pageNumber: 1,
    pageOffset: 0,
    scrollPercent: 0,
    mode: "read",
    hasReadBefore: false,
  },
  perBookProgress: {},
  updateProgress: () => {},
  offlineBookIndices: [],
  savingOfflineChapter: null,
  isBookSavedOffline: () => false,
  toggleOfflineBook: async () => ({ success: false, saved: false, message: "" }),
});

function getOrCreateDeviceId(): string {
  if (typeof window === "undefined") return "server";
  let devId = localStorage.getItem("ebook_device_id");
  if (!devId) {
    devId =
      "dev_" +
      Math.random().toString(36).substring(2, 10) +
      "_" +
      Date.now().toString(36);
    localStorage.setItem("ebook_device_id", devId);
  }
  return devId;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [unlockedSubjects, setUnlockedSubjects] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [deviceId, setDeviceId] = useState("");
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [unlockedCode, setUnlockedCode] = useState<string | null>(null);
  const [settings, setSettings] = useState<SiteSettingsClient>(DEFAULT_SETTINGS);
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [sessionAlertMessage, setSessionAlertMessage] = useState<string | null>(null);
  const [bookmarks, setBookmarks] = useState<LocalBookmark[]>([]);
  const [offlineBookIndices, setOfflineBookIndices] = useState<number[]>([]);
  const [savingOfflineChapter, setSavingOfflineChapter] = useState<number | null>(null);
  const [progress, setProgress] = useState<ReadingProgressData>({
    chapterIndex: 0,
    pageNumber: 1,
    pageOffset: 0,
    scrollPercent: 0,
    mode: "read",
    hasReadBefore: false,
  });
  const [perBookProgress, setPerBookProgress] = useState<
    Record<string, ReadingProgressData>
  >({});
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSessionAlert = useCallback(() => {
    setSessionAlertMessage(null);
  }, []);

  const handleSessionInvalidated = useCallback((reason?: string) => {
    try {
      logoutUser().catch(() => {});
    } catch {
      // ignore
    }
    try {
      const savedProfRaw = localStorage.getItem("ebook_user_profile");
      const savedUid = savedProfRaw ? JSON.parse(savedProfRaw)?.uid : null;
      wipeAllOfflineBooks(savedUid);
    } catch {
      wipeAllOfflineBooks();
    }
    setOfflineBookIndices([]);
    setUser(null);
    setProfile(null);
    setUnlockedSubjects([]);
    setSessionToken(null);
    setUnlockedCode(null);
    try {
      localStorage.removeItem("ebook_user_profile");
      localStorage.removeItem("ebook_session_token");
      localStorage.removeItem("ebook_access_token");
      document.cookie = "ebook_session_token=; path=/; max-age=0";
      document.cookie = "ebook_uid=; path=/; max-age=0";
    } catch {
      // ignore
    }
    setSessionAlertMessage(
      reason ||
        "অন্য একটি ডিভাইস বা ব্রাউজারে আপনার অ্যাকাউন্টে লগইন করায় এই ডিভাইসের সেশনটি স্বয়ংক্রিয়ভাবে লগআউট হয়েছে এবং এই ডিভাইসের অফলাইন বইগুলো মুছে ফেলা হয়েছে।"
    );
  }, []);

  // Verify active session & fetch unlocked subjects from server
  const verifySessionWithServer = useCallback(
    async (uid: string, token: string) => {
      if (!uid || !token) return;
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      try {
        const res = await fetch(
          `/api/auth?uid=${encodeURIComponent(uid)}&sessionToken=${encodeURIComponent(
            token
          )}`,
          {
            headers: {
              "x-user-uid": uid,
              "x-session-token": token,
            },
            cache: "no-store",
          }
        );

        if (res.status === 401) {
          const data = await res.json().catch(() => ({}));
          if (data.sessionInvalidated) {
            handleSessionInvalidated(data.message);
          }
          return;
        }

        if (res.ok) {
          const data = await res.json();
          if (data.sessionInvalidated) {
            handleSessionInvalidated(data.message);
            return;
          }
          if (Array.isArray(data.unlockedSubjects)) {
            const incoming = data.unlockedSubjects as string[];

            setUnlockedSubjects((prev) => {
              const merged = Array.from(new Set([...prev, ...incoming]));
              const prevSorted = [...prev].sort();
              const mergedSorted = [...merged].sort();

              // Self-heal Firestore if local state has unlocked subjects that a cold Vercel instance missed
              if (merged.length > incoming.length) {
                setDoc(
                  doc(db, "users", uid),
                  {
                    uid,
                    unlockedSubjects: merged,
                    hasAccess: merged.length > 0,
                  },
                  { merge: true }
                ).catch(() => {});
                setDoc(
                  doc(db, "user_reading_data", uid),
                  {
                    uid,
                    unlockedSubjects: merged,
                    updatedAt: new Date().toISOString(),
                  },
                  { merge: true }
                ).catch(() => {});
              }

              if (
                prevSorted.length === mergedSorted.length &&
                prevSorted.every((val, idx) => val === mergedSorted[idx])
              ) {
                return prev;
              }
              return merged;
            });

            setProfile((prev) => {
              if (!prev) return prev;
              const prevList = Array.isArray(prev.unlockedSubjects)
                ? prev.unlockedSubjects
                : [];
              const merged = Array.from(new Set([...prevList, ...incoming]));
              const prevSorted = [...prevList].sort();
              const mergedSorted = [...merged].sort();
              if (
                prevSorted.length === mergedSorted.length &&
                prevSorted.every((val, idx) => val === mergedSorted[idx]) &&
                prev.hasAccess === merged.length > 0
              ) {
                return prev;
              }
              const updated: UserProfile = {
                ...prev,
                unlockedSubjects: merged,
                hasAccess: merged.length > 0,
              };
              try {
                localStorage.setItem(
                  "ebook_user_profile",
                  JSON.stringify(updated)
                );
              } catch {
                // ignore
              }
              return updated;
            });
          }
        }
      } catch {
        // ignore network hiccup
      }
    },
    [handleSessionInvalidated]
  );

  // Sync user's bookmarks & reading progress to Firebase Firestore + /api/user-data when logged in
  const pushUserDataToCloud = useCallback(
    async (
      uid: string,
      payload: {
        bookmarks?: LocalBookmark[];
        progress?: ReadingProgressData;
        perBookProgress?: Record<string, ReadingProgressData>;
        unlockedSubjects?: string[];
      },
      activeToken?: string | null
    ) => {
      if (!uid) return;
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      const now = new Date().toISOString();

      try {
        await setDoc(
          doc(db, "user_reading_data", uid),
          {
            uid,
            ...payload,
            updatedAt: now,
          },
          { merge: true }
        );
      } catch {
        // Fallback if Firestore rules require server write
      }

      try {
        const res = await fetch("/api/user-data", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(activeToken ? { "x-session-token": activeToken } : {}),
            "x-user-uid": uid,
          },
          body: JSON.stringify({
            uid,
            sessionToken: activeToken || undefined,
            ...payload,
          }),
        });
        if (res.status === 401) {
          const d = await res.json().catch(() => ({}));
          if (d.sessionInvalidated) {
            handleSessionInvalidated();
          }
        }
      } catch {
        // ignore network error
      }
    },
    [handleSessionInvalidated]
  );

  // Pull & merge user's bookmarks, reading progress, and unlockedSubjects from Firebase + /api/user-data
  const syncUserDataFromCloud = useCallback(
    async (uid: string, activeToken?: string | null) => {
      if (!uid) return;
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      let cloudBm: LocalBookmark[] = [];
      let cloudProg: ReadingProgressData | null = null;
      let cloudPerBook: Record<string, ReadingProgressData> = {};
      let cloudUnlocked: string[] = [];

      // 1. Check /api/user-data first (which merges Firestore + server store + verifies session)
      try {
        const res = await fetch(
          `/api/user-data?uid=${encodeURIComponent(uid)}${
            activeToken ? `&sessionToken=${encodeURIComponent(activeToken)}` : ""
          }`,
          {
            headers: {
              "x-user-uid": uid,
              ...(activeToken ? { "x-session-token": activeToken } : {}),
            },
            cache: "no-store",
          }
        );
        if (res.status === 401) {
          const errJson = await res.json().catch(() => ({}));
          if (errJson.sessionInvalidated) {
            handleSessionInvalidated();
            return;
          }
        }
        if (res.ok) {
          const json = await res.json();
          const d = json.data;
          if (Array.isArray(json.unlockedSubjects)) {
            cloudUnlocked = json.unlockedSubjects;
          }
          if (d) {
            if (Array.isArray(d.bookmarks)) cloudBm = d.bookmarks as LocalBookmark[];
            if (d.progress) cloudProg = d.progress as ReadingProgressData;
            if (d.perBookProgress)
              cloudPerBook = d.perBookProgress as Record<string, ReadingProgressData>;
            if (Array.isArray(d.unlockedSubjects)) {
              cloudUnlocked = Array.from(
                new Set([...cloudUnlocked, ...d.unlockedSubjects])
              );
            }
          }
        }
      } catch {
        // fallback to client Firestore
      }

      // 2. Also check BOTH client-side Firestore user_reading_data/{uid} AND users/{uid}
      try {
        const [rSnap, uSnap] = await Promise.all([
          getDoc(doc(db, "user_reading_data", uid)),
          getDoc(doc(db, "users", uid)),
        ]);
        if (rSnap.exists()) {
          const d = rSnap.data();
          if (cloudBm.length === 0 && Array.isArray(d.bookmarks))
            cloudBm = d.bookmarks as LocalBookmark[];
          if (!cloudProg && d.progress)
            cloudProg = d.progress as ReadingProgressData;
          if (d.perBookProgress)
            cloudPerBook = {
              ...(d.perBookProgress as Record<string, ReadingProgressData>),
              ...cloudPerBook,
            };
          if (Array.isArray(d.unlockedSubjects)) {
            cloudUnlocked = Array.from(
              new Set([...cloudUnlocked, ...(d.unlockedSubjects as string[])])
            );
          }
        }
        if (uSnap.exists()) {
          const u = uSnap.data();
          if (Array.isArray(u.unlockedSubjects)) {
            cloudUnlocked = Array.from(
              new Set([...cloudUnlocked, ...(u.unlockedSubjects as string[])])
            );
          }
        }
      } catch {
        // ignore
      }

      if (cloudUnlocked.length > 0) {
        setUnlockedSubjects((prev) => {
          const merged = Array.from(new Set([...prev, ...cloudUnlocked]));
          const prevSorted = [...prev].sort();
          const mergedSorted = [...merged].sort();
          if (
            prevSorted.length === mergedSorted.length &&
            prevSorted.every((v, idx) => v === mergedSorted[idx])
          ) {
            return prev;
          }
          return merged;
        });
        setProfile((prev) => {
          if (!prev) return prev;
          const prevList = Array.isArray(prev.unlockedSubjects)
            ? prev.unlockedSubjects
            : [];
          const merged = Array.from(new Set([...prevList, ...cloudUnlocked]));
          const updated: UserProfile = {
            ...prev,
            unlockedSubjects: merged,
            hasAccess: merged.length > 0,
          };
          try {
            localStorage.setItem("ebook_user_profile", JSON.stringify(updated));
          } catch {
            // ignore
          }
          return updated;
        });
      }

      // Merge with local bookmarks so any guest bookmarks aren't lost on login
      let localBm: LocalBookmark[] = [];
      let localProg: ReadingProgressData | null = null;
      let localPerBook: Record<string, ReadingProgressData> = {};
      try {
        const sb = localStorage.getItem("ebook_bookmarks");
        if (sb) localBm = JSON.parse(sb);
        const sp = localStorage.getItem("ebook_progress");
        if (sp) localProg = JSON.parse(sp);
        const spb = localStorage.getItem("ebook_per_book_progress");
        if (spb) localPerBook = JSON.parse(spb);
      } catch {
        // ignore
      }

      const bmMap = new Map<string, LocalBookmark>();
      [...cloudBm, ...localBm].forEach((b) => {
        if (b && b.id) bmMap.set(b.id, b);
      });
      const mergedBm = Array.from(bmMap.values()).sort((a, b) =>
        (b.createdAt || "").localeCompare(a.createdAt || "")
      );

      let mergedProg: ReadingProgressData = {
        chapterIndex: 0,
        pageNumber: 1,
        pageOffset: 0,
        scrollPercent: 0,
        mode: "read",
        hasReadBefore: false,
      };
      if (cloudProg && localProg) {
        const cloudTime = cloudProg.updatedAt || "";
        const localTime = localProg.updatedAt || "";
        mergedProg =
          cloudProg.hasReadBefore &&
          (!localProg.hasReadBefore || cloudTime >= localTime)
            ? cloudProg
            : localProg;
      } else if (cloudProg) {
        mergedProg = cloudProg;
      } else if (localProg) {
        mergedProg = localProg;
      }

      const mergedPerBook: Record<string, ReadingProgressData> = {
        ...localPerBook,
        ...cloudPerBook,
      };

      setBookmarks(mergedBm);
      setProgress(mergedProg);
      setPerBookProgress(mergedPerBook);

      try {
        localStorage.setItem("ebook_bookmarks", JSON.stringify(mergedBm));
        localStorage.setItem("ebook_progress", JSON.stringify(mergedProg));
        localStorage.setItem(
          "ebook_per_book_progress",
          JSON.stringify(mergedPerBook)
        );
      } catch {
        // ignore
      }

      await pushUserDataToCloud(
        uid,
        {
          bookmarks: mergedBm,
          progress: mergedProg,
          perBookProgress: mergedPerBook,
        },
        activeToken
      );
    },
    [pushUserDataToCloud, handleSessionInvalidated]
  );

  // Load initial state on mount
  useEffect(() => {
    const devId = getOrCreateDeviceId();
    setDeviceId(devId);

    let initialProfile: UserProfile | null = null;
    let initialSessionToken: string | null = null;

    try {
      const savedBm = localStorage.getItem("ebook_bookmarks");
      if (savedBm) setBookmarks(JSON.parse(savedBm));

      const savedProg = localStorage.getItem("ebook_progress");
      if (savedProg) setProgress(JSON.parse(savedProg));

      const savedPerBook = localStorage.getItem("ebook_per_book_progress");
      if (savedPerBook) setPerBookProgress(JSON.parse(savedPerBook));

      const savedToken = localStorage.getItem("ebook_session_token");
      if (savedToken) {
        initialSessionToken = savedToken;
        setSessionToken(savedToken);
      }

      const savedProfile = localStorage.getItem("ebook_user_profile");
      if (savedProfile) {
        initialProfile = JSON.parse(savedProfile);
        setProfile(initialProfile);
        if (Array.isArray(initialProfile?.unlockedSubjects)) {
          setUnlockedSubjects(initialProfile.unlockedSubjects);
        }
        if (initialProfile?.uid) {
          setOfflineBookIndices(getSavedOfflineChaptersSync(initialProfile.uid));
        }
      }
    } catch {
      // ignore
    }

    // Load site settings when online
    if (typeof navigator === "undefined" || navigator.onLine) {
      fetch("/api/unlock")
        .then((r) => r.json())
        .then((d) => {
          if (d.settings) setSettings((prev) => ({ ...prev, ...d.settings }));
        })
        .catch(() => {});
    }

    // Register Service Worker & warm offline cache with all loaded scripts/styles & routes
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      const sendWarmCacheMsg = (sw: ServiceWorker | null) => {
        if (!sw) return;
        const loadedUrls: string[] = [];
        document
          .querySelectorAll<HTMLScriptElement>("script[src]")
          .forEach((s) => {
            if (s.src && s.src.startsWith(window.location.origin)) {
              loadedUrls.push(s.src);
            }
          });
        document
          .querySelectorAll<HTMLLinkElement>("link[rel='stylesheet'][href]")
          .forEach((l) => {
            if (l.href && l.href.startsWith(window.location.origin)) {
              loadedUrls.push(l.href);
            }
          });
        sw.postMessage({ type: "WARM_OFFLINE_CACHE", urls: loadedUrls });
      };

      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          sendWarmCacheMsg(
            reg.active || reg.waiting || reg.installing || navigator.serviceWorker.controller
          );
        })
        .catch(() => {});

      navigator.serviceWorker.ready
        .then((reg) => {
          sendWarmCacheMsg(reg.active || navigator.serviceWorker.controller);
        })
        .catch(() => {});
    }

    if (initialProfile?.uid && initialSessionToken) {
      verifySessionWithServer(initialProfile.uid, initialSessionToken);
      syncUserDataFromCloud(initialProfile.uid, initialSessionToken);
      renewAllOfflineLeasesOnServer(
        initialProfile.uid,
        devId,
        initialSessionToken
      );
    }

    const onBackOnline = () => {
      try {
        const profRaw = localStorage.getItem("ebook_user_profile");
        const tok = localStorage.getItem("ebook_session_token");
        const prof = profRaw ? JSON.parse(profRaw) : null;
        if (prof?.uid && tok) {
          verifySessionWithServer(prof.uid, tok);
          renewAllOfflineLeasesOnServer(prof.uid, devId, tok);
          const bmRaw = localStorage.getItem("ebook_bookmarks");
          const progRaw = localStorage.getItem("ebook_progress");
          const perBookRaw = localStorage.getItem("ebook_per_book_progress");
          pushUserDataToCloud(
            prof.uid,
            {
              bookmarks: bmRaw ? JSON.parse(bmRaw) : undefined,
              progress: progRaw ? JSON.parse(progRaw) : undefined,
              perBookProgress: perBookRaw ? JSON.parse(perBookRaw) : undefined,
            },
            tok
          );
        }
      } catch {
        // ignore
      }
    };
    window.addEventListener("online", onBackOnline);

    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => {
      window.removeEventListener("online", onBackOnline);
      unsubscribe();
    };
  }, [verifySessionWithServer, syncUserDataFromCloud, pushUserDataToCloud]);

  // Periodic Single-Session Heartbeat (checks every 15s and on window focus)
  useEffect(() => {
    const activeUid = profile?.uid || user?.uid;
    if (!activeUid || !sessionToken) return;

    const interval = setInterval(() => {
      verifySessionWithServer(activeUid, sessionToken);
    }, 15000);

    const onFocus = () => {
      verifySessionWithServer(activeUid, sessionToken);
    };

    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [profile?.uid, user?.uid, sessionToken, verifySessionWithServer]);

  const signIn = async (
    email: string,
    password: string
  ): Promise<{ success: boolean; message: string }> => {
    const devId = deviceId || getOrCreateDeviceId();
    setSessionAlertMessage(null);

    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "login",
          email: email.trim(),
          password,
          deviceId: devId,
        }),
      });
      const data = await res.json();

      if (res.ok && data.success && data.user) {
        const userUnlocked: string[] = Array.isArray(data.unlockedSubjects)
          ? data.unlockedSubjects
          : Array.isArray(data.user.unlockedSubjects)
          ? data.user.unlockedSubjects
          : [];

        const userProf: UserProfile = {
          uid: data.user.uid,
          email: data.user.email,
          displayName: data.user.displayName,
          hasAccess: userUnlocked.length > 0,
          unlockedSubjects: userUnlocked,
          role: data.user.role || "reader",
          unlockCode: data.user.unlockCode || null,
        };

        setProfile(userProf);
        setUnlockedSubjects(userUnlocked);
        setOfflineBookIndices(getSavedOfflineChaptersSync(userProf.uid));
        localStorage.setItem("ebook_user_profile", JSON.stringify(userProf));

        if (data.sessionToken) {
          setSessionToken(data.sessionToken);
          localStorage.setItem("ebook_session_token", data.sessionToken);
        }
        if (data.unlockedCode) {
          setUnlockedCode(data.unlockedCode);
        }

        await syncUserDataFromCloud(userProf.uid, data.sessionToken);
        loginUser(email.trim(), password).catch(() => {});
        return { success: true, message: "লগইন সফল হয়েছে!" };
      }

      // Fallback: if user exists in Firebase Auth directly
      try {
        const fbUser = await loginUser(email.trim(), password);
        const sessRes = await fetch("/api/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "firebase_session",
            uid: fbUser.uid,
            email: fbUser.email,
            deviceId: devId,
          }),
        });
        const sessData = await sessRes.json();

        const userUnlocked: string[] = Array.isArray(sessData.unlockedSubjects)
          ? sessData.unlockedSubjects
          : [];
        const userProf: UserProfile = {
          uid: fbUser.uid,
          email: fbUser.email || email.trim(),
          displayName:
            fbUser.displayName || email.trim().split("@")[0] || "পাঠক",
          hasAccess: userUnlocked.length > 0,
          unlockedSubjects: userUnlocked,
          role: "reader",
        };
        setProfile(userProf);
        setUnlockedSubjects(userUnlocked);
        setOfflineBookIndices(getSavedOfflineChaptersSync(fbUser.uid));
        localStorage.setItem("ebook_user_profile", JSON.stringify(userProf));
        if (sessData.sessionToken) {
          setSessionToken(sessData.sessionToken);
          localStorage.setItem("ebook_session_token", sessData.sessionToken);
        }
        await syncUserDataFromCloud(fbUser.uid, sessData.sessionToken);
        return { success: true, message: "লগইন সফল হয়েছে!" };
      } catch {
        return {
          success: false,
          message: data.message || "ইমেইল বা পাসওয়ার্ড সঠিক নয়।",
        };
      }
    } catch {
      return { success: false, message: "লগইন করা যায়নি। আবার চেষ্টা করুন।" };
    }
  };

  const signUp = async (
    name: string,
    email: string,
    password: string
  ): Promise<{ success: boolean; message: string }> => {
    const devId = deviceId || getOrCreateDeviceId();
    setSessionAlertMessage(null);
    let firebaseUid: string | undefined;

    try {
      const fbUser = await registerUser(email.trim(), password, name.trim());
      firebaseUid = fbUser.uid;
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === "auth/email-already-in-use") {
        return {
          success: false,
          message: "এই ইমেইলে আগেই অ্যাকাউন্ট আছে। লগইন করুন।",
        };
      }
      if (code === "auth/invalid-email") {
        return { success: false, message: "ইমেইল ঠিকানা সঠিক নয়।" };
      }
    }

    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "register",
          displayName: name.trim(),
          email: email.trim(),
          password,
          firebaseUid,
          deviceId: devId,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        return {
          success: false,
          message: data.message || "রেজিস্ট্রেশন ব্যর্থ হয়েছে।",
        };
      }

      const userProf: UserProfile = {
        uid: data.user.uid,
        email: data.user.email,
        displayName: data.user.displayName,
        hasAccess: false,
        unlockedSubjects: [],
        role: "reader",
      };
      setProfile(userProf);
      setUnlockedSubjects([]);
      setOfflineBookIndices([]);
      localStorage.setItem("ebook_user_profile", JSON.stringify(userProf));

      if (data.sessionToken) {
        setSessionToken(data.sessionToken);
        localStorage.setItem("ebook_session_token", data.sessionToken);
      }

      await syncUserDataFromCloud(userProf.uid, data.sessionToken);
      return { success: true, message: "অ্যাকাউন্ট তৈরি সফল হয়েছে!" };
    } catch {
      return {
        success: false,
        message: "রেজিস্ট্রেশন হয়নি। আবার চেষ্টা করুন।",
      };
    }
  };

  const signOutUser = async () => {
    const activeUid = profile?.uid || user?.uid;
    try {
      await wipeAllOfflineBooks(activeUid);
    } catch {
      // ignore
    }
    setOfflineBookIndices([]);
    try {
      await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout", uid: activeUid }),
      });
    } catch {
      // ignore
    }
    try {
      await logoutUser();
    } catch {
      // ignore
    }
    setUser(null);
    setProfile(null);
    setUnlockedSubjects([]);
    setSessionToken(null);
    setUnlockedCode(null);
    try {
      localStorage.removeItem("ebook_user_profile");
      localStorage.removeItem("ebook_session_token");
      localStorage.removeItem("ebook_access_token");
    } catch {
      // ignore
    }
  };

  const refreshProfile = async () => {
    const activeUid = profile?.uid || user?.uid;
    if (activeUid && sessionToken) {
      await verifySessionWithServer(activeUid, sessionToken);
    }
  };

  const unlockWithCode = async (code: string) => {
    const devId = deviceId || getOrCreateDeviceId();
    const activeUid = profile?.uid || user?.uid || null;
    const activeEmail = profile?.email || user?.email || null;

    if (!activeUid) {
      return {
        success: false,
        message:
          "আনলক কোড ব্যবহার করার আগে অনুগ্রহ করে লগইন বা রেজিস্ট্রেশন করুন।",
      };
    }

    try {
      const res = await fetch("/api/unlock", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(sessionToken ? { "x-session-token": sessionToken } : {}),
          "x-user-uid": activeUid,
        },
        body: JSON.stringify({
          code: code.trim(),
          deviceId: devId,
          uid: activeUid,
          email: activeEmail,
          sessionToken,
        }),
      });
      const data = await res.json();

      if (res.status === 401 && data.sessionInvalidated) {
        handleSessionInvalidated(data.message);
        return {
          success: false,
          message:
            data.message ||
            "অন্য ডিভাইসে লগইন হওয়ার কারণে এই সেশনটি লগআউট হয়েছে।",
        };
      }

      if (data.success) {
        const mergedList: string[] = Array.isArray(data.unlockedSubjects)
          ? data.unlockedSubjects
          : [];
        setUnlockedSubjects(mergedList);

        if (data.code) {
          localStorage.setItem("ebook_unlocked_code", data.code);
          setUnlockedCode(data.code);
        }
        if (profile) {
          const updatedProfile: UserProfile = {
            ...profile,
            hasAccess: mergedList.length > 0,
            unlockedSubjects: mergedList,
            unlockCode: data.code || profile.unlockCode,
          };
          setProfile(updatedProfile);
          localStorage.setItem(
            "ebook_user_profile",
            JSON.stringify(updatedProfile)
          );
        }
      }
      return {
        success: Boolean(data.success),
        message: data.message || "",
        unlockedSubjects: data.unlockedSubjects || [],
        newlyUnlockedSubjects: data.newlyUnlockedSubjects || [],
      };
    } catch {
      return {
        success: false,
        message: "সার্ভারের সাথে সংযোগ করা যায়নি। আবার চেষ্টা করুন।",
      };
    }
  };

  const addBookmarkItem = async (
    bm: Omit<LocalBookmark, "id" | "createdAt">
  ) => {
    const newItem: LocalBookmark = {
      ...bm,
      id: "bm_" + Date.now().toString(36),
      createdAt: new Date().toISOString(),
    };
    const activeUid = profile?.uid || user?.uid || null;

    setBookmarks((prev) => {
      const updated = [newItem, ...prev];
      try {
        localStorage.setItem("ebook_bookmarks", JSON.stringify(updated));
      } catch {
        // ignore
      }
      if (activeUid) {
        pushUserDataToCloud(activeUid, { bookmarks: updated }, sessionToken);
      }
      return updated;
    });
  };

  const removeBookmarkItem = async (id: string) => {
    const activeUid = profile?.uid || user?.uid || null;

    setBookmarks((prev) => {
      const updated = prev.filter((b) => b.id !== id);
      try {
        localStorage.setItem("ebook_bookmarks", JSON.stringify(updated));
      } catch {
        // ignore
      }
      if (activeUid) {
        pushUserDataToCloud(activeUid, { bookmarks: updated }, sessionToken);
      }
      return updated;
    });
  };

  const updateProgress = useCallback(
    (newProg: Partial<ReadingProgressData>) => {
      const activeUid = profile?.uid || user?.uid || null;
      const now = new Date().toISOString();

      setProgress((prev) => {
        const nextChapter =
          newProg.chapterIndex !== undefined
            ? newProg.chapterIndex
            : prev.chapterIndex;
        const nextPage =
          newProg.pageNumber !== undefined
            ? newProg.pageNumber
            : prev.pageNumber;
        const nextOffset =
          newProg.pageOffset !== undefined
            ? newProg.pageOffset
            : prev.pageOffset || 0;
        const nextPct =
          newProg.scrollPercent !== undefined
            ? newProg.scrollPercent
            : prev.scrollPercent;
        const nextMode =
          newProg.mode !== undefined ? newProg.mode : prev.mode;

        if (
          prev.hasReadBefore &&
          prev.chapterIndex === nextChapter &&
          prev.pageNumber === nextPage &&
          prev.mode === nextMode &&
          Math.abs((prev.scrollPercent || 0) - nextPct) < 2 &&
          Math.abs((prev.pageOffset || 0) - nextOffset) < 40
        ) {
          return prev;
        }

        const updated: ReadingProgressData = {
          ...prev,
          ...newProg,
          hasReadBefore: true,
          updatedAt: now,
        };
        try {
          localStorage.setItem("ebook_progress", JSON.stringify(updated));
        } catch {
          // ignore
        }

        setPerBookProgress((prevMap) => {
          const nextMap = {
            ...prevMap,
            [String(updated.chapterIndex)]: updated,
          };
          try {
            localStorage.setItem(
              "ebook_per_book_progress",
              JSON.stringify(nextMap)
            );
          } catch {
            // ignore
          }

          if (activeUid) {
            if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
            syncTimerRef.current = setTimeout(() => {
              pushUserDataToCloud(
                activeUid,
                {
                  progress: updated,
                  perBookProgress: nextMap,
                },
                sessionToken
              );
            }, 2500);
          }
          return nextMap;
        });

        return updated;
      });
    },
    [profile?.uid, user?.uid, sessionToken, pushUserDataToCloud]
  );

  const isSubjectUnlocked = useCallback(
    (subjectIdOrChapterIndex: string | number): boolean => {
      if (profile?.role === "admin") return true;
      const effectiveList = Array.from(
        new Set([...unlockedSubjects, ...(profile?.unlockedSubjects || [])])
      );
      if (typeof subjectIdOrChapterIndex === "number") {
        const ch = CHAPTERS[subjectIdOrChapterIndex];
        return Boolean(ch && effectiveList.includes(ch.id));
      }
      return effectiveList.includes(subjectIdOrChapterIndex);
    },
    [unlockedSubjects, profile?.unlockedSubjects, profile?.role]
  );

  const isBookSavedOffline = useCallback(
    (chapterIndex: number): boolean => {
      return offlineBookIndices.includes(chapterIndex);
    },
    [offlineBookIndices]
  );

  const toggleOfflineBook = useCallback(
    async (
      chapterIndex: number
    ): Promise<{ success: boolean; saved: boolean; message: string }> => {
      const activeUid = profile?.uid || user?.uid || "";
      const devId = deviceId || getOrCreateDeviceId();

      if (!activeUid || !sessionToken) {
        return {
          success: false,
          saved: false,
          message: "অফলাইনে বই সেভ করতে অনুগ্রহ করে লগইন করুন।",
        };
      }

      if (!isSubjectUnlocked(chapterIndex)) {
        return {
          success: false,
          saved: false,
          message: "শুধুমাত্র আনলক করা বই অ্যাপের অফলাইনে সেভ করা যাবে।",
        };
      }

      setSavingOfflineChapter(chapterIndex);
      try {
        if (offlineBookIndices.includes(chapterIndex)) {
          const res = await removeBookFromOfflineApp({
            chapterIndex,
            uid: activeUid,
            deviceId: devId,
            sessionToken,
          });
          if (res.success) {
            setOfflineBookIndices((prev) =>
              prev.filter((idx) => idx !== chapterIndex)
            );
          }
          return {
            success: res.success,
            saved: false,
            message: res.message,
          };
        } else {
          const res = await saveBookForOfflineApp({
            chapterIndex,
            uid: activeUid,
            deviceId: devId,
            sessionToken,
          });
          if (res.success) {
            setOfflineBookIndices((prev) =>
              Array.from(new Set([...prev, chapterIndex]))
            );
          }
          return {
            success: res.success,
            saved: res.success,
            message: res.message,
          };
        }
      } finally {
        setSavingOfflineChapter(null);
      }
    },
    [
      profile?.uid,
      user?.uid,
      deviceId,
      sessionToken,
      isSubjectUnlocked,
      offlineBookIndices,
    ]
  );

  const effectiveUnlockedList = Array.from(
    new Set([...unlockedSubjects, ...(profile?.unlockedSubjects || [])])
  );
  const isLoggedIn = Boolean(profile || user);
  const hasAccess =
    effectiveUnlockedList.length > 0 || profile?.role === "admin";
  const hasAllSubjectsUnlocked =
    profile?.role === "admin" ||
    CHAPTERS.every((ch) => effectiveUnlockedList.includes(ch.id));
  const isAdmin = profile?.role === "admin";

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        isLoggedIn,
        loading,
        hasAccess,
        hasAllSubjectsUnlocked,
        unlockedSubjects,
        isSubjectUnlocked,
        isAdmin,
        deviceId,
        accessToken: sessionToken,
        sessionToken,
        unlockedCode,
        settings,
        showUnlockModal,
        setShowUnlockModal,
        sessionAlertMessage,
        clearSessionAlert,
        handleSessionInvalidated,
        signIn,
        signUp,
        signOutUser,
        unlockWithCode,
        refreshProfile,
        bookmarks,
        addBookmarkItem,
        removeBookmarkItem,
        progress,
        perBookProgress,
        updateProgress,
        offlineBookIndices,
        savingOfflineChapter,
        isBookSavedOffline,
        toggleOfflineBook,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
