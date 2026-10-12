"use client";

import React, { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth, LocalBookmark } from "@/lib/context/AuthContext";
import { CHAPTERS, TOTAL_BOOK_PAGES } from "@/lib/book/chapters";
import {
  getOfflineBookData,
  searchOfflineVaultBooks,
  isDeviceOnline,
} from "@/lib/offline/offlineStore";
import OfflineDownloadModal from "@/components/OfflineDownloadModal";
import { recordReadingHeartbeat } from "@/lib/readingStats";
import {
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  Search,
  Bookmark,
  Lock,
  X,
  Check,
  List,
  Type,
  Key,
  Download,
  Trash2,
  Plus,
  Home,
} from "lucide-react";

interface TocQuestionItem {
  id: string;
  qNumber: number;
  sectionIndex: number;
  sectionLabel: string;
  title: string;
  pageNumber: number;
}

interface TocKaRangeGroup {
  rangeLabel: string;
  rangeLabelBn: string;
  startQ: number;
  endQ: number;
  firstQuestionId: string;
  pageNumber: number;
  endPageNumber: number;
  questions: TocQuestionItem[];
}

interface BookTocData {
  chapterIndex: number;
  bookNumber: number;
  kaRanges: TocKaRangeGroup[];
  kaQuestions: TocQuestionItem[];
  khaQuestions: TocQuestionItem[];
  gaQuestions: TocQuestionItem[];
  isTocLocked?: boolean;
  lockedKaCount?: number;
  lockedKhaCount?: number;
  lockedGaCount?: number;
  totalLockedQuestions?: number;
}

interface ChapterPageItem {
  pageNumber: number;
  sectionLabel?: string;
  isFree: boolean;
  isLocked: boolean;
  html: string;
}

interface SearchResultItem {
  pageNumber: number;
  chapterIndex: number;
  chapterTitleBn: string;
  sectionLabel?: string;
  snippet: string;
  isLocked: boolean;
}

function ReaderInner() {
  const {
    unlockedSubjects,
    isSubjectUnlocked,
    getSubjectAccessInfo,
    deviceId,
    sessionToken,
    profile,
    user,
    isLoggedIn,
    handleSessionInvalidated,
    addBookmarkItem,
    removeBookmarkItem,
    bookmarks,
    updateProgress,
    setShowUnlockModal,
    isBookSavedOffline,
    toggleOfflineBook,
    savingOfflineChapter,
  } = useAuth();

  const router = useRouter();
  const searchParams = useSearchParams();

  const navigateToUnlockOrLogin = (chIdx = chapterIndex) => {
    if (isLoggedIn) {
      router.push(`/unlock?ch=${chIdx}`);
    } else {
      router.push(
        `/login?redirect=${encodeURIComponent(`/unlock?ch=${chIdx}`)}`
      );
    }
  };

  const initCh = parseInt(searchParams.get("ch") || "0", 10);
  const initPage = parseInt(searchParams.get("page") || "0", 10);
  const initOffset = parseInt(searchParams.get("offset") || "0", 10);

  const [chapterIndex, setChapterIndex] = useState(
    initCh >= 0 && initCh < CHAPTERS.length ? initCh : 0
  );
  const [pages, setPages] = useState<ChapterPageItem[]>([]);
  const [bookToc, setBookToc] = useState<BookTocData | null>(null);
  const [tocTab, setTocTab] = useState<"all" | "ka" | "kha" | "ga">("all");
  const [expandedKaRange, setExpandedKaRange] = useState<string | null>("1-10");
  const [showBookSwitcher, setShowBookSwitcher] = useState(false);

  const [fetching, setFetching] = useState(true);
  const [theme, setTheme] = useState<"light" | "sepia" | "dark">("light");
  const [fontSize, setFontSize] = useState(16);

  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem("ebook_reader_theme");
      if (
        savedTheme === "light" ||
        savedTheme === "sepia" ||
        savedTheme === "dark"
      ) {
        setTheme(savedTheme);
      }
      const savedFont = parseInt(
        localStorage.getItem("ebook_reader_fontsize") || "",
        10
      );
      if (!isNaN(savedFont) && savedFont >= 12 && savedFont <= 26) {
        setFontSize(savedFont);
      }
    } catch {
      // ignore
    }
    try {
      router.prefetch("/");
      router.prefetch("/flipbook");
      router.prefetch("/dashboard");
    } catch {
      // ignore
    }
  }, [router]);

  const navigateOfflineSafe = useCallback(
    (targetHref: string) => {
      const startPath =
        typeof window !== "undefined" ? window.location.pathname : "";
      router.push(targetHref);
      if (typeof window !== "undefined" && !isDeviceOnline()) {
        setTimeout(() => {
          if (window.location.pathname === startPath) {
            window.location.href = targetHref;
          }
        }, 350);
      }
    },
    [router]
  );

  const [showTocSheet, setShowTocSheet] = useState(false);
  const [showFontPopover, setShowFontPopover] = useState(false);
  const [showBookmarkPopover, setShowBookmarkPopover] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [globalResults, setGlobalResults] = useState<SearchResultItem[]>([]);
  const [searchingGlobal, setSearchingGlobal] = useState(false);
  const [bookmarkToast, setBookmarkToast] = useState(false);
  const [offlineToastMsg, setOfflineToastMsg] = useState<string | null>(null);
  const [offlineErrorBanner, setOfflineErrorBanner] = useState<string | null>(null);
  const [readingFromOfflineVault, setReadingFromOfflineVault] = useState(false);
  const [activePageNum, setActivePageNum] = useState(initPage || 1);
  const [visiblePagesLimit, setVisiblePagesLimit] = useState(
    initPage ? Math.max(3, initPage + 2) : 3
  );
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Auto-hide header on scroll down, show on scroll up
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const lastScrollYRef = useRef<number>(0);

  // Prevent repeated unwanted scroll-to-top resets while user is reading
  const initialScrollDoneRef = useRef<boolean>(false);
  const userHasScrolledRef = useRef<boolean>(false);
  const activePageNumRef = useRef<number>(activePageNum);
  activePageNumRef.current = activePageNum;
  const updateProgressRef = useRef(updateProgress);
  updateProgressRef.current = updateProgress;

  // Ref to track exact target page & scroll offset across chapter switches
  const pendingScrollRef = useRef<{ page: number; offset: number } | null>(
    initPage ? { page: initPage, offset: initOffset } : null
  );

  const contentRef = useRef<HTMLDivElement>(null);
  const currentChapter = CHAPTERS[chapterIndex] || CHAPTERS[0];

  // Reveal header automatically whenever user opens TOC, Bookmark, Font, or Search menus
  useEffect(() => {
    if (showTocSheet || showFontPopover || showBookmarkPopover || showSearchModal) {
      setIsHeaderVisible(true);
    }
  }, [showTocSheet, showFontPopover, showBookmarkPopover, showSearchModal]);

  const ensurePageRendered = useCallback((pageNum: number) => {
    setVisiblePagesLimit((prev) => Math.max(prev, pageNum + 2));
  }, []);

  // Scroll to exact page + exact offset inside that page
  const scrollToPageAndOffset = useCallback(
    (pageNum: number, offset = 0) => {
      ensurePageRendered(pageNum);
      const tryScroll = () => {
        const el = document.getElementById(`reader-page-${pageNum}`);
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        const absoluteElementTop = rect.top + window.scrollY;
        const targetY = Math.max(0, absoluteElementTop + offset - 64);
        window.scrollTo({ top: targetY, behavior: "smooth" });
        setActivePageNum(pageNum);
        return true;
      };

      if (!tryScroll()) {
        setTimeout(tryScroll, 60);
      }
      return true;
    },
    [ensurePageRendered]
  );

  // Scroll directly to a specific question ID (or its page if locked)
  const jumpToQuestion = useCallback(
    (pageNum: number, questionId: string) => {
      setShowTocSheet(false);
      ensurePageRendered(pageNum);
      setActivePageNum(pageNum);
      setTimeout(() => {
        const qEl = document.getElementById(questionId);
        if (qEl) {
          const rect = qEl.getBoundingClientRect();
          const targetY = Math.max(0, rect.top + window.scrollY - 76);
          window.scrollTo({ top: targetY, behavior: "smooth" });
          qEl.classList.add("q-highlight-flash");
          setTimeout(() => qEl.classList.remove("q-highlight-flash"), 2400);
        } else {
          scrollToPageAndOffset(pageNum, 0);
        }
      }, 70);
    },
    [ensurePageRendered, scrollToPageAndOffset]
  );

  const lastQueryStringRef = useRef<string>("");
  const lastFetchedChapterRef = useRef<number | null>(null);

  // Sync URL query changes (e.g. when navigating to a bookmark URL)
  useEffect(() => {
    const queryStr = searchParams.toString();
    if (queryStr === lastQueryStringRef.current) return;
    lastQueryStringRef.current = queryStr;

    const qCh = parseInt(searchParams.get("ch") || "-1", 10);
    const qPage = parseInt(searchParams.get("page") || "0", 10);
    const qOffset = parseInt(searchParams.get("offset") || "0", 10);

    if (qCh >= 0 && qCh < CHAPTERS.length && qCh !== chapterIndex) {
      initialScrollDoneRef.current = false;
      pendingScrollRef.current = qPage ? { page: qPage, offset: qOffset } : null;
      setChapterIndex(qCh);
    } else if (qPage > 0 && !initialScrollDoneRef.current) {
      initialScrollDoneRef.current = true;
      pendingScrollRef.current = { page: qPage, offset: qOffset };
      setTimeout(() => {
        if (pendingScrollRef.current) {
          scrollToPageAndOffset(
            pendingScrollRef.current.page,
            pendingScrollRef.current.offset
          );
          pendingScrollRef.current = null;
        }
      }, 150);
    }
  }, [searchParams, chapterIndex, scrollToPageAndOffset]);

  // Record reading heartbeat every 10s to accumulate reader study time
  useEffect(() => {
    const timer = setInterval(() => {
      recordReadingHeartbeat(10);
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  const activeUid = profile?.uid || user?.uid || "";
  const currentBookAccessInfo = getSubjectAccessInfo(chapterIndex);
  const currentBookUnlocked = isSubjectUnlocked(chapterIndex);
  const currentBookOfflineSaved = isBookSavedOffline(chapterIndex);

  const [showOfflineDownloadAnim, setShowOfflineDownloadAnim] = useState(false);
  const [offlineDownloadDone, setOfflineDownloadDone] = useState(false);
  const [offlinePendingMsg, setOfflinePendingMsg] = useState<string | null>(null);
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);

  const handleToggleOfflineSave = async () => {
    if (!currentBookOfflineSaved) {
      if (!isDeviceOnline()) {
        setOfflineToastMsg(
          "⚠️ ইন্টারনেট সংযোগ নেই! বইটি অফলাইনে ডাউনলোড করতে অনুগ্রহ করে ডাটা বা Wi-Fi চালু করুন।"
        );
        setTimeout(() => setOfflineToastMsg(null), 4500);
        return;
      }
      setOfflineDownloadDone(false);
      setShowOfflineDownloadAnim(true);
      const res = await toggleOfflineBook(chapterIndex);
      if (!res.success) {
        setShowOfflineDownloadAnim(false);
        setOfflineDownloadDone(false);
        setOfflineToastMsg(res.message);
        setTimeout(() => setOfflineToastMsg(null), 4500);
        return;
      }
      setOfflinePendingMsg(res.message);
      setOfflineDownloadDone(true);
    } else {
      setShowDeleteConfirmModal(true);
    }
  };

  const handleConfirmDeleteOffline = async () => {
    setShowDeleteConfirmModal(false);
    const res = await toggleOfflineBook(chapterIndex);
    setOfflineToastMsg(res.message);
    setTimeout(() => setOfflineToastMsg(null), 4000);
  };

  useEffect(() => {
    let active = true;
    const isChapterSwitch = lastFetchedChapterRef.current !== chapterIndex;
    if (isChapterSwitch) {
      setFetching(true);
      setPages([]);
      setBookToc(null);
    }
    setOfflineErrorBanner(null);

    const applyLoadedData = (
      loadedPages: ChapterPageItem[],
      tocData: BookTocData | null,
      fromVault: boolean
    ) => {
      if (!active) return;
      const isBookUnlocked = isSubjectUnlocked(chapterIndex);
      const sanitizedPages = isBookUnlocked
        ? loadedPages.map((p) => ({ ...p, isLocked: false }))
        : loadedPages;
      setPages(sanitizedPages);
      if (tocData) setBookToc(tocData);
      setReadingFromOfflineVault(fromVault);
      setFetching(false);

      const isNewChapter = lastFetchedChapterRef.current !== chapterIndex;
      lastFetchedChapterRef.current = chapterIndex;

      if (isNewChapter) {
        const firstPage = loadedPages[0]?.pageNumber || currentChapter.startPage;
        const target = pendingScrollRef.current;
        const initialActivePage = target?.page || firstPage;
        setVisiblePagesLimit((prev) =>
          Math.max(prev, Math.max(3, initialActivePage + 2))
        );
        setActivePageNum(initialActivePage);

        updateProgress({
          chapterIndex,
          pageNumber: initialActivePage,
          pageOffset: target?.offset || 0,
          scrollPercent: Math.round(
            (initialActivePage / currentChapter.endPage) * 100
          ),
          mode: "read",
        });

        if (target && target.page) {
          setTimeout(() => {
            scrollToPageAndOffset(target.page, target.offset);
            pendingScrollRef.current = null;
          }, 220);
        } else if (
          !userHasScrolledRef.current &&
          typeof window !== "undefined" &&
          window.scrollY > 0
        ) {
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      }
    };

    const loadBook = async () => {
      // 1. Always check encrypted IndexedDB vault FIRST if book is unlocked so saved offline books open instantaneously!
      const vault = await getOfflineBookData({
        chapterIndex,
        uid: activeUid,
        deviceId,
        mode: "chapter",
      });
      if (!active) return;
      if (
        currentBookUnlocked &&
        vault.found &&
        !vault.expired &&
        Array.isArray(vault.pages) &&
        vault.pages.length > 0
      ) {
        applyLoadedData(
          vault.pages as ChapterPageItem[],
          (vault.toc as BookTocData) || null,
          !isDeviceOnline()
        );
        return;
      }

      const isOfflineNow = !isDeviceOnline();
      if (isOfflineNow) {
        setPages([]);
        setBookToc(null);
        setReadingFromOfflineVault(false);
        if (vault.found && vault.expired) {
          setOfflineErrorBanner(
            vault.message ||
              "অফলাইন মেয়াদ শেষ হয়েছে। ইন্টারনেট চালু করে পুনরায় প্রবেশ করুন।"
          );
        } else {
          setOfflineErrorBanner(
            "আপনি এখন অফলাইনে আছেন। এই বইটি অফলাইনে সেভ করা নেই। বইটি পড়তে বা অফলাইনে ডাউনলোড করতে ইন্টারনেট সংযোগ চালু করুন।"
          );
        }
        setFetching(false);
        return;
      }

      // 2. Fetch from server when online, fallback to encrypted vault if network fails
      const headers: Record<string, string> = {};
      if (deviceId) headers["x-device-id"] = deviceId;
      if (activeUid) headers["x-user-uid"] = activeUid;
      if (sessionToken) headers["x-session-token"] = sessionToken;
      const effectiveUnlocked = Array.from(
        new Set([...unlockedSubjects, ...(profile?.unlockedSubjects || [])])
      );
      if (effectiveUnlocked.length > 0) {
        headers["x-unlocked-subjects"] = effectiveUnlocked.join(",");
      }

      try {
        const r = await fetch(
          `/api/book-content?mode=chapter&chapter=${chapterIndex}`,
          {
            headers,
            cache: "no-store",
          }
        );
        const data = await r.json();
        if (!active) return;
        if (!r.ok || data.offline || data.error) {
          throw new Error(data.error || "Network offline");
        }
        if (data.sessionInvalidated) {
          handleSessionInvalidated();
          return;
        }
        applyLoadedData(data.pages || [], data.toc || null, false);
      } catch {
        if (!active) return;
        // Fallback to encrypted IndexedDB vault if network request failed
        const fallbackVault = await getOfflineBookData({
          chapterIndex,
          uid: activeUid,
          deviceId,
          mode: "chapter",
        });
        if (!active) return;
        if (
          fallbackVault.found &&
          !fallbackVault.expired &&
          Array.isArray(fallbackVault.pages) &&
          fallbackVault.pages.length > 0
        ) {
          applyLoadedData(
            fallbackVault.pages as ChapterPageItem[],
            (fallbackVault.toc as BookTocData) || null,
            true
          );
          return;
        }
        setPages([]);
        setBookToc(null);
        setReadingFromOfflineVault(false);
        if (fallbackVault.found && fallbackVault.expired) {
          setOfflineErrorBanner(fallbackVault.message || null);
        } else {
          setOfflineErrorBanner(
            "আপনি এখন অফলাইনে আছেন। এই বইটি অফলাইনে সেভ করা নেই। বইটি পড়তে বা অফলাইনে ডাউনলোড করতে ইন্টারনেট সংযোগ চালু করুন।"
          );
        }
        setFetching(false);
      }
    };

    loadBook();

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    chapterIndex,
    currentBookUnlocked,
    deviceId,
    activeUid,
    sessionToken,
  ]);

  // Global search (supports both Online API and Offline Encrypted Vault + Loaded Pages)
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q || q.length < 2) {
      setGlobalResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchingGlobal(true);

      const isOffline = !isDeviceOnline();
      if (isOffline) {
        const localHits = await searchOfflineVaultBooks({
          query: q,
          uid: activeUid,
          deviceId,
          fallbackPages: pages,
        });
        setGlobalResults(localHits);
        setSearchingGlobal(false);
        return;
      }

      const headers: Record<string, string> = {};
      if (deviceId) headers["x-device-id"] = deviceId;
      if (activeUid) headers["x-user-uid"] = activeUid;
      if (sessionToken) headers["x-session-token"] = sessionToken;
      const effectiveUnlocked = Array.from(
        new Set([...unlockedSubjects, ...(profile?.unlockedSubjects || [])])
      );
      if (effectiveUnlocked.length > 0) {
        headers["x-unlocked-subjects"] = effectiveUnlocked.join(",");
      }

      try {
        const r = await fetch(
          `/api/book-content?search=${encodeURIComponent(q)}`,
          { headers, cache: "no-store" }
        );
        const d = await r.json();
        if (d.sessionInvalidated) {
          handleSessionInvalidated();
        }
        setGlobalResults(d.results || []);
      } catch {
        const localHits = await searchOfflineVaultBooks({
          query: q,
          uid: activeUid,
          deviceId,
          fallbackPages: pages,
        });
        setGlobalResults(localHits);
      } finally {
        setSearchingGlobal(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [
    searchQuery,
    deviceId,
    activeUid,
    sessionToken,
    handleSessionInvalidated,
    pages,
  ]);

  // Real-time Scroll Spy: detects exact active page & offset inside that page as user scrolls
  useEffect(() => {
    const onScroll = () => {
      const currentScrollY = window.scrollY;
      const scrollDelta = currentScrollY - lastScrollYRef.current;

      if (Math.abs(currentScrollY) > 20) {
        userHasScrolledRef.current = true;
      }

      // Auto-hide header on scroll down, show on scroll up or near top
      if (currentScrollY <= 60) {
        setIsHeaderVisible(true);
      } else if (scrollDelta > 8) {
        // Scrolling down -> hide header
        setIsHeaderVisible(false);
      } else if (scrollDelta < -8) {
        // Scrolling up -> reveal header
        setIsHeaderVisible(true);
      }
      lastScrollYRef.current = currentScrollY;

      const viewportCheckY = currentScrollY + window.innerHeight * 0.32;
      let detectedPage = activePageNumRef.current;
      let detectedOffset = 0;

      const sections = document.querySelectorAll<HTMLElement>(
        "section[id^='reader-page-']"
      );
      sections.forEach((sec) => {
        const top = sec.offsetTop;
        if (top <= viewportCheckY) {
          const num = parseInt(sec.id.replace("reader-page-", ""), 10);
          if (!isNaN(num)) {
            detectedPage = num;
            detectedOffset = Math.max(0, Math.round(currentScrollY - top));
          }
        }
      });

      if (detectedPage !== activePageNumRef.current) {
        setActivePageNum(detectedPage);
      }

      // Progressive loading scroll trigger
      const distFromBottom =
        document.documentElement.scrollHeight -
        (currentScrollY + window.innerHeight);
      if (distFromBottom < 1000) {
        setVisiblePagesLimit((prev) => {
          if (prev >= pages.length) return prev;
          return Math.min(prev + 3, pages.length);
        });
      }

      const maxScroll =
        document.documentElement.scrollHeight - window.innerHeight;
      const pct =
        maxScroll > 0
          ? Math.min(100, Math.round((currentScrollY / maxScroll) * 100))
          : 0;

      updateProgressRef.current({
        chapterIndex,
        pageNumber: detectedPage,
        pageOffset: detectedOffset,
        scrollPercent: pct,
        mode: "read",
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [chapterIndex, pages.length]);

  const goToChapter = useCallback(
    (idx: number, targetPage?: number, targetOffset = 0) => {
      if (idx < 0 || idx >= CHAPTERS.length) return;
      setShowTocSheet(false);
      setShowBookmarkPopover(false);
      setIsHeaderVisible(true);

      if (idx === chapterIndex) {
        if (targetPage) {
          scrollToPageAndOffset(targetPage, targetOffset);
        } else {
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      } else {
        userHasScrolledRef.current = false;
        initialScrollDoneRef.current = false;
        pendingScrollRef.current = targetPage
          ? { page: targetPage, offset: targetOffset }
          : null;
        setChapterIndex(idx);
      }
    },
    [chapterIndex, scrollToPageAndOffset]
  );

  // Detect currently visible question text & exact offset inside current page
  const handleQuickBookmark = async () => {
    const pageEl = document.getElementById(`reader-page-${activePageNum}`);
    let pageOffset = 0;
    let questionSnippet = "";

    if (pageEl) {
      const pageTop = pageEl.getBoundingClientRect().top + window.scrollY;
      pageOffset = Math.max(0, Math.round(window.scrollY - pageTop));

      // Find the question item closest to top of viewport
      const questions = pageEl.querySelectorAll<HTMLElement>(
        ".question-item, h3, h4, p"
      );
      for (const q of Array.from(questions)) {
        const rect = q.getBoundingClientRect();
        if (rect.bottom > 80 && rect.top < window.innerHeight * 0.65) {
          const rawText = (q.textContent || "").replace(/\s+/g, " ").trim();
          if (rawText.length > 4) {
            questionSnippet = rawText.slice(0, 48);
            break;
          }
        }
      }
    }

    const cleanChapter = currentChapter.titleBn.replace(/^[০-৯1-9]+\.\s*/, "");
    const label = questionSnippet
      ? `${questionSnippet}... (পৃ. ${activePageNum})`
      : `${cleanChapter} • পৃষ্ঠা ${activePageNum}`;

    await addBookmarkItem({
      chapterIndex,
      chapterTitle: currentChapter.titleBn,
      pageNumber: activePageNum,
      pageOffset,
      mode: "read",
      label,
    });
    setBookmarkToast(true);
    setTimeout(() => setBookmarkToast(false), 2000);
  };

  const handleJumpToBookmark = (bm: LocalBookmark) => {
    goToChapter(bm.chapterIndex, bm.pageNumber, bm.pageOffset || 0);
  };

  const cycleTheme = () => {
    setTheme((prev) => {
      const next =
        prev === "light" ? "sepia" : prev === "sepia" ? "dark" : "light";
      try {
        localStorage.setItem("ebook_reader_theme", next);
      } catch {
        // ignore
      }
      return next;
    });
  };

  const unlockedPages = pages.filter((p) => !p.isLocked);
  const lockedPages = pages.filter((p) => p.isLocked);
  const visibleUnlockedPages = unlockedPages.slice(0, visiblePagesLimit);
  const hasMoreUnlockedPages = visiblePagesLimit < unlockedPages.length;

  // Progressive loading observer for the bottom sentinel
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisiblePagesLimit((prev) => {
            if (prev >= unlockedPages.length) return prev;
            return Math.min(prev + 3, unlockedPages.length);
          });
        }
      },
      { rootMargin: "600px 0px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [unlockedPages.length]);

  // Filter bookmarks ONLY for this specific book/subject!
  const currentBookBookmarks = bookmarks.filter(
    (b) => b.chapterIndex === chapterIndex
  );
  const isCurrentPageBookmarked = currentBookBookmarks.some(
    (b) => b.pageNumber === activePageNum
  );

  const themeClasses =
    theme === "dark"
      ? "bg-[#141413] text-[#E5E4E0]"
      : theme === "sepia"
      ? "bg-[#F4ECD8] text-[#2C241B]"
      : "bg-[#FAF9F6] text-[#1C1C1E]";

  return (
    <div
      className={`min-h-dvh overflow-x-hidden transition-colors duration-300 ${themeClasses}`}
    >
      {/* Mobile-Responsive Editorial Typography */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .editorial-book-content,
            .editorial-book-content .section-content,
            .editorial-book-content .question-item {
              font-family: 'Hind Siliguri', 'SolaimanLipi', Georgia, serif;
              line-height: 1.82;
              letter-spacing: 0.01em;
              width: 100%;
              max-width: 100%;
              box-sizing: border-box;
              overflow-x: hidden;
              overflow-wrap: break-word;
              word-break: break-word;
            }
            .editorial-book-content .subject-header,
            .editorial-book-content .part-header {
              border-top: 1px solid ${
                theme === "dark" ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"
              };
              border-bottom: 1px solid ${
                theme === "dark" ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"
              };
              padding: 12px 0;
              margin: 22px 0 16px 0;
              text-align: center;
              font-weight: 700;
            }
            .editorial-book-content .question-item {
              margin-bottom: 22px;
              padding-bottom: 18px;
              border-bottom: 1px solid ${
                theme === "dark" ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)"
              };
            }
            .editorial-book-content .question-item:last-child {
              border-bottom: none;
            }
            .editorial-book-content .question-item p {
              margin: 6px 0;
              text-align: left;
              max-width: 100%;
              overflow-wrap: break-word;
              word-break: break-word;
            }
            @media (min-width: 640px) {
              .editorial-book-content .question-item p {
                text-align: justify;
              }
            }
            .editorial-book-content .question-item strong {
              font-weight: 700;
              color: ${theme === "dark" ? "#FFFFFF" : "#000000"};
            }
            .editorial-book-content .question-item h3,
            .editorial-book-content .question-item h4,
            .editorial-book-content .question-item h5 {
              font-size: 1.05em;
              font-weight: 700;
              margin: 12px 0 6px 0;
              color: ${theme === "dark" ? "#F3F4F6" : "#111827"};
            }
            .editorial-book-content ul,
            .editorial-book-content ol {
              margin: 6px 0 10px 1.25em;
              padding: 0;
              max-width: 100%;
            }
            .editorial-book-content li {
              margin-bottom: 5px;
            }
            /* Diagrams / Flowcharts / ASCII Art inside <pre> */
            .editorial-book-content pre {
              display: block;
              width: 100%;
              max-width: 100%;
              box-sizing: border-box;
              overflow-x: auto;
              -webkit-overflow-scrolling: touch;
              background: rgba(128, 128, 128, 0.07);
              border: 1px solid rgba(128, 128, 128, 0.16);
              border-radius: 14px;
              padding: 12px 14px;
              margin: 10px 0;
              font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
              font-size: 0.78em;
              line-height: 1.4;
              white-space: pre;
            }
            .editorial-book-content pre code {
              font-family: inherit;
              font-size: inherit;
              background: transparent;
              padding: 0;
              white-space: inherit;
            }
            @media (max-width: 639px) {
              .editorial-book-content pre {
                font-size: clamp(9.5px, 2.4vw, 11.5px);
                line-height: 1.35;
                padding: 10px;
                white-space: pre-wrap;
                word-break: break-word;
              }
            }
            .editorial-book-content svg,
            .editorial-book-content img {
              max-width: 100% !important;
              height: auto !important;
              display: block;
              margin: 10px auto;
            }
            /* Responsive Tables that fit inside phone screen */
            .editorial-book-content table {
              width: 100%;
              max-width: 100%;
              border-collapse: collapse;
              margin: 14px 0;
              font-size: 0.9em;
              box-sizing: border-box;
            }
            .editorial-book-content th,
            .editorial-book-content td {
              border: 1px solid ${
                theme === "dark" ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.12)"
              };
              padding: 7px 10px;
              text-align: left;
              overflow-wrap: break-word;
              word-break: break-word;
            }
            @media (max-width: 639px) {
              .editorial-book-content table {
                font-size: 0.8em;
                table-layout: fixed;
              }
              .editorial-book-content th,
              .editorial-book-content td {
                padding: 5px 6px;
              }
            }
            .editorial-book-content th {
              background: ${
                theme === "dark" ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)"
              };
              font-weight: 700;
            }
            .editorial-book-content .cover-page,
            .editorial-book-content .disclaimer-page,
            .editorial-book-content .back-cover-page {
              padding: 16px 0;
              text-align: center;
            }
            .q-highlight-flash {
              background: rgba(245, 158, 11, 0.16) !important;
              border-radius: 14px;
              padding: 10px 12px !important;
              transition: background 0.4s ease;
            }
          `,
        }}
      />

      {/* Minimal Top Bar (Fixed at top: hides on scroll down, shows on scroll up or tap) */}
      <header
        className={`fixed top-0 inset-x-0 z-30 px-4 sm:px-8 h-12 sm:h-14 flex items-center justify-between transition-all duration-300 ease-in-out ${
          isHeaderVisible
            ? "translate-y-0 opacity-100"
            : "-translate-y-full opacity-0 pointer-events-none"
        } ${
          theme === "dark"
            ? "bg-[#141413]/95"
            : theme === "sepia"
            ? "bg-[#F4ECD8]/95"
            : "bg-[#FAF9F6]/95"
        } backdrop-blur-md`}
      >
        <Link
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navigateOfflineSafe("/");
          }}
          className="flex items-center gap-1 text-xs sm:text-sm font-medium opacity-70 active:opacity-100 py-1"
        >
          <ChevronLeft size={17} />
          <span>হোম</span>
        </Link>

        <div className="text-center truncate px-2">
          <span className="text-[10px] sm:text-[11px] uppercase tracking-widest opacity-55 block truncate font-semibold">
            বই {currentChapter.bookNumber} • কোর্স {currentChapter.courseCode} • পৃ.{" "}
            {activePageNum}/{currentChapter.endPage}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {!currentBookUnlocked ? (
            <button
              type="button"
              onClick={() => navigateToUnlockOrLogin(chapterIndex)}
              className="text-[11px] font-bold px-3 py-1 rounded-full bg-amber-400 text-amber-950 hover:bg-amber-300 shadow-xs flex items-center gap-1 cursor-pointer transition"
            >
              <Key size={11} /> {isLoggedIn ? "আনলক" : "লগইন"}
            </button>
          ) : (
            <button
              onClick={handleToggleOfflineSave}
              disabled={savingOfflineChapter === chapterIndex}
              className={`text-[11px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5 transition cursor-pointer shadow-xs ${
                currentBookOfflineSaved
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-500/60 shadow-[0_2px_8px_rgba(16,185,129,0.35)] active:scale-95"
                  : "bg-black text-white hover:bg-gray-800 dark:bg-white dark:text-black"
              }`}
              title={
                currentBookOfflineSaved
                  ? "বইটি অফলাইনে সংরক্ষিত আছে (মুছে ফেলতে ক্লিক করুন)"
                  : "ইন্টারনেট ছাড়া সরাসরি পড়ার জন্য অফলাইনে সেভ করুন"
              }
            >
              {savingOfflineChapter === chapterIndex ? (
                <span>সেভ হচ্ছে...</span>
              ) : currentBookOfflineSaved ? (
                <>
                  <Check size={12} strokeWidth={3} className="text-white" />
                  <span>অফলাইন</span>
                </>
              ) : (
                <>
                  <Download size={11} />
                  <span>অফলাইনে সেভ</span>
                </>
              )}
            </button>
          )}
          <button
            onClick={handleQuickBookmark}
            className="p-1.5 rounded-full opacity-75 hover:opacity-100 cursor-pointer"
            title="বর্তমান অবস্থান বুকমার্ক করুন"
          >
            <Bookmark
              size={16}
              className={isCurrentPageBookmarked ? "fill-current" : ""}
            />
          </button>
        </div>
      </header>

      {/* Main Editorial Reading Column */}
      <main
        ref={contentRef}
        onClick={() => {
          if (!isHeaderVisible) setIsHeaderVisible(true);
        }}
        className="max-w-[650px] sm:max-w-2xl md:max-w-3xl lg:max-w-4xl mx-auto px-4 sm:px-10 pt-16 sm:pt-20 pb-36"
      >
        {offlineToastMsg && (
          <div className="mb-5 bg-[#141413] text-[#FAF9F6] rounded-2xl px-4 py-3 text-xs font-bold flex items-center justify-between gap-3 shadow-md">
            <span>{offlineToastMsg}</span>
            <button
              onClick={() => setOfflineToastMsg(null)}
              className="opacity-70 hover:opacity-100 cursor-pointer shrink-0"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {readingFromOfflineVault && (
          <div className="mb-5 bg-black/5 border border-black/10 rounded-2xl px-4 py-2.5 text-center text-[11px] font-bold opacity-80">
            📴 আপনি বর্তমানে অ্যাপের এনক্রিপ্টেড অফলাইন স্টোরেজ থেকে বইটি পড়ছেন (ইন্টারনেট সংযোগ ছাড়াই সচল)
          </div>
        )}

        {(currentBookAccessInfo.badgeType === "free" ||
          currentBookAccessInfo.badgeType === "timed") && (
          <div
            className={`mb-5 rounded-2xl px-4 py-2.5 border flex flex-wrap items-center justify-between gap-2.5 text-xs shadow-2xs ${
              currentBookAccessInfo.badgeType === "free"
                ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-950 dark:text-emerald-200"
                : "bg-amber-500/10 border-amber-500/25 text-amber-950 dark:text-amber-200"
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-extrabold truncate">
                {currentBookAccessInfo.badgeType === "free" ? "🎁 ফ্রি অ্যাক্সেস" : "⏳ টাইমড অ্যাক্সেস"} • বই {currentChapter.bookNumber} ({currentChapter.titleBn}):
              </span>
              <span className="font-mono font-bold px-2 py-0.5 rounded-full bg-black/10 dark:bg-white/10 shrink-0">
                {currentBookAccessInfo.countdownTextBn ||
                  currentBookAccessInfo.badgeTextBn}
              </span>
            </div>
            <button
              type="button"
              onClick={() => navigateToUnlockOrLogin(chapterIndex)}
              className="text-[11px] font-bold underline underline-offset-2 cursor-pointer shrink-0 hover:opacity-80"
            >
              কোড দিয়ে স্থায়ী আনলক করুন →
            </button>
          </div>
        )}

        {offlineErrorBanner && (
          <div className="my-8 bg-white dark:bg-zinc-900 border border-black/15 dark:border-white/15 rounded-3xl p-6 text-center space-y-4 shadow-md max-w-md mx-auto">
            <p className="text-xs sm:text-sm font-bold text-[#141413] dark:text-white leading-relaxed">
              {offlineErrorBanner}
            </p>
            <div className="flex items-center justify-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => navigateOfflineSafe("/")}
                className="px-4 py-2 rounded-full border border-black/15 dark:border-white/20 text-xs font-bold cursor-pointer"
              >
                হোমে ফিরে যান
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="px-4 py-2 rounded-full bg-[#141413] text-white dark:bg-white dark:text-black text-xs font-bold cursor-pointer"
              >
                পুনরায় চেষ্টা করুন
              </button>
            </div>
          </div>
        )}

        {/* Minimal Book Header */}
        <div className="text-center mb-8 sm:mb-12">
          <p className="text-[11px] sm:text-xs font-medium opacity-55 mb-1 tracking-wide">
            বই {currentChapter.bookNumber} • কোর্স {currentChapter.courseCode} (মোট{" "}
            {currentChapter.endPage} পৃষ্ঠা)
          </p>
          <h1 className="text-xl sm:text-3xl font-extrabold tracking-tight leading-snug px-2">
            {currentChapter.titleBn}
          </h1>

          {/* Section Pills (ক, খ, গ বিভাগ) — only show when book content is available */}
          {!offlineErrorBanner && pages.length > 0 && currentChapter.sections && (
            <div className="flex items-center justify-center gap-1.5 sm:gap-2 mt-4 flex-wrap">
              {currentChapter.sections.map((sec, idx) => {
                const isSecLocked = !currentBookUnlocked && idx > 0;
                return (
                  <button
                    key={sec.id}
                    onClick={() => {
                      if (isSecLocked) {
                        navigateToUnlockOrLogin(chapterIndex);
                        return;
                      }
                      const ok = scrollToPageAndOffset(sec.startPage, 0);
                      if (!ok) navigateToUnlockOrLogin(chapterIndex);
                    }}
                    className={`inline-flex items-center gap-1.5 text-[11px] sm:text-xs px-3 py-1 rounded-full border transition cursor-pointer ${
                      theme === "dark"
                        ? "border-white/15 active:bg-white/10 text-gray-300"
                        : "border-black/15 active:bg-black/5 text-gray-700"
                    }`}
                  >
                    <span>{sec.label.split(" ")[0]}</span>
                    {!currentBookUnlocked ? (
                      idx === 0 ? (
                        <span className="opacity-75">(১০টি ফ্রি)</span>
                      ) : (
                        <Lock size={12} className="opacity-75 shrink-0" />
                      )
                    ) : (
                      <span>
                        ({sec.questionCountBn}) • পৃ. {sec.startPage}–{sec.endPage}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {fetching ? (
          <div className="py-20 text-center space-y-3 opacity-50">
            <div className="animate-spin w-6 h-6 border-2 border-current border-t-transparent rounded-full mx-auto" />
            <p className="text-xs tracking-widest uppercase">লোড হচ্ছে...</p>
          </div>
        ) : pages.length > 0 ? (
          <div
            className="editorial-book-content"
            style={{ fontSize: `${fontSize}px` }}
          >
            {visibleUnlockedPages.map((p) => (
              <section
                key={p.pageNumber}
                id={`reader-page-${p.pageNumber}`}
                className="mb-8 scroll-mt-16"
              >
                <div className="flex items-center gap-3 my-5 opacity-45 text-[11px] font-mono">
                  <div className="h-px flex-1 bg-current opacity-40" />
                  <span>
                    বই {currentChapter.bookNumber} • পৃষ্ঠা {p.pageNumber}/
                    {currentChapter.endPage}
                  </span>
                  <div className="h-px flex-1 bg-current opacity-40" />
                </div>

                <div dangerouslySetInnerHTML={{ __html: p.html }} />
              </section>
            ))}

            {/* Progressive Scroll Loading Sentinel */}
            {hasMoreUnlockedPages && (
              <div
                ref={sentinelRef}
                className="py-8 flex items-center justify-center gap-2 text-xs opacity-50 select-none"
              >
                <div className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full" />
                <span>পরবর্তী পৃষ্ঠা লোড হচ্ছে...</span>
              </div>
            )}

            {/* Locked Pages Blur + Unlock Prompt */}
            {!hasMoreUnlockedPages && lockedPages.length > 0 && (
              <div className="mt-6 relative">
                <div className="select-none pointer-events-none blur-[4px] opacity-40 space-y-3 mb-5 text-sm">
                  <p>
                    ১। (ক) উদ্ভিদের বৃদ্ধি ও পরিবর্ধনের বিভিন্ন পর্যায়সমূহ আলোচনা কর। (খ) ফটোপিরিয়ডিজম ও ভার্নালাইজেশনের গুরুত্ব ব্যাখ্যা কর।
                  </p>
                  <p>
                    উঃ উদ্ভিদের জীবনচক্রে অঙ্গজ বৃদ্ধি থেকে প্রজনন পর্যায়ে রূপান্তরের ক্ষেত্রে আলোক পর্যায়কাল অত্যন্ত গুরুত্বপূর্ণ ভূমিকা পালন করে...
                  </p>
                </div>

                {/* Sleek Locked Notice + Unlock Page Link */}
                <div className="rounded-3xl border border-black/10 dark:border-white/10 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md p-6 sm:p-8 text-center space-y-4 shadow-xl max-w-md mx-auto">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400 mx-auto flex items-center justify-center">
                    <Lock size={22} />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-[#141413] dark:text-white">
                      বই {currentChapter.bookNumber}-এর বাকি {lockedPages.length}টি পৃষ্ঠা লক করা
                    </h3>
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-sm mx-auto leading-relaxed">
                      {!isLoggedIn
                        ? "বইটি পড়তে এবং আনলক কোড ব্যবহার করতে প্রথমে আপনার অ্যাকাউন্টে লগইন করুন।"
                        : `${currentChapter.titleBn}-এর সম্পূর্ণ প্রশ্ন ও উত্তর পড়তে এবং আনলক কোড এন্টার করতে বিস্তারিত আনলক পেজে যান।`}
                    </p>
                  </div>
                  <div>
                    <Link
                      href={
                        !isLoggedIn
                          ? `/login?redirect=${encodeURIComponent(`/unlock?ch=${chapterIndex}`)}`
                          : `/unlock?ch=${chapterIndex}`
                      }
                      className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-amber-400 hover:bg-amber-300 text-amber-950 font-bold text-xs sm:text-sm shadow-md transition active:scale-95 cursor-pointer"
                    >
                      <Key size={14} />
                      <span>
                        {!isLoggedIn
                          ? "লগইন করে আনলক করুন →"
                          : "বই আনলক করুন (বিস্তারিত পেজ) →"}
                      </span>
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {/* Book Prev / Next Footer */}
            {!hasMoreUnlockedPages && (
              <div className="mt-12 pt-6 border-t border-current/10 flex items-center justify-between text-xs sm:text-sm">
                <button
                  onClick={() => goToChapter(chapterIndex - 1)}
                  disabled={chapterIndex <= 0}
                  className="flex items-center gap-1 font-medium opacity-75 disabled:opacity-20 py-2 cursor-pointer"
                >
                  <ChevronLeft size={17} /> আগের বই
                </button>
                <span className="text-xs opacity-40 font-mono">
                  বই {currentChapter.bookNumber}/{CHAPTERS.length}
                </span>
                <button
                  onClick={() => goToChapter(chapterIndex + 1)}
                  disabled={chapterIndex >= CHAPTERS.length - 1}
                  className="flex items-center gap-1 font-medium opacity-75 disabled:opacity-20 py-2 cursor-pointer"
                >
                  পরের বই <ChevronRight size={17} />
                </button>
              </div>
            )}
          </div>
        ) : null}
      </main>

      {/* Bottom Soft Fade Blur */}
      <div
        className={`fixed bottom-0 inset-x-0 h-24 pointer-events-none z-30 bg-gradient-to-t ${
          theme === "dark"
            ? "from-[#141413] via-[#141413]/85 to-transparent"
            : theme === "sepia"
            ? "from-[#F4ECD8] via-[#F4ECD8]/85 to-transparent"
            : "from-[#FAF9F6] via-[#FAF9F6]/85 to-transparent"
        }`}
      />

      {/* Typography Popover */}
      {showFontPopover && (
        <div className="fixed bottom-20 app-popover-above-dock left-1/2 -translate-x-1/2 z-50 bg-[#1C1C1E] text-white rounded-2xl px-4 py-3 shadow-2xl border border-white/10 flex items-center gap-3">
          <span className="text-xs opacity-70">ফন্ট</span>
          <button
            onClick={() =>
              setFontSize((f) => {
                const next = Math.max(13, f - 1);
                try {
                  localStorage.setItem("ebook_reader_fontsize", String(next));
                } catch {}
                return next;
              })
            }
            className="w-8 h-8 rounded-full bg-white/10 active:bg-white/20 flex items-center justify-center text-xs font-bold cursor-pointer"
          >
            A-
          </button>
          <span className="font-mono text-xs w-6 text-center">{fontSize}</span>
          <button
            onClick={() =>
              setFontSize((f) => {
                const next = Math.min(24, f + 1);
                try {
                  localStorage.setItem("ebook_reader_fontsize", String(next));
                } catch {}
                return next;
              })
            }
            className="w-8 h-8 rounded-full bg-white/10 active:bg-white/20 flex items-center justify-center text-sm font-bold cursor-pointer"
          >
            A+
          </button>
          <button
            onClick={() => setShowFontPopover(false)}
            className="opacity-60 p-1 cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Bookmark Popover right above the bottom dock — ONLY shows current book's bookmarks */}
      {showBookmarkPopover && (
        <div className="fixed bottom-20 app-popover-above-dock left-1/2 -translate-x-1/2 z-50 w-[92vw] max-w-sm bg-[#FAF9F6] text-[#141413] rounded-3xl p-4 shadow-[0_24px_70px_rgba(0,0,0,0.2)] border border-black/10">
          <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-black/8">
            <div className="min-w-0">
              <span className="text-xs font-extrabold flex items-center gap-1.5 text-[#141413]">
                <Bookmark size={14} /> বই {currentChapter.bookNumber}-এর বুকমার্ক (
                {currentBookBookmarks.length})
              </span>
              <span className="text-[10px] opacity-55 block truncate mt-0.5">
                {currentChapter.titleBn.replace(/^[০-৯1-9]+\.\s*/, "")}
              </span>
            </div>
            <button
              onClick={() => setShowBookmarkPopover(false)}
              className="w-7 h-7 rounded-full bg-black/5 hover:bg-black/10 flex items-center justify-center cursor-pointer shrink-0"
            >
              <X size={14} />
            </button>
          </div>

          {/* Save Current Exact Spot Button */}
          <button
            onClick={handleQuickBookmark}
            className="w-full bg-[#141413] text-white hover:opacity-90 font-bold text-xs py-2.5 px-3 rounded-full flex items-center justify-center gap-1.5 mb-3 transition cursor-pointer"
          >
            <Plus size={14} /> এই প্রশ্ন / পৃষ্ঠা {activePageNum} বুকমার্ক করুন
          </button>

          {currentBookBookmarks.length === 0 ? (
            <p className="text-[11px] opacity-55 text-center py-4 bg-white rounded-2xl border border-black/6 px-3 leading-relaxed">
              এই বইয়ে এখনো কোনো বুকমার্ক নেই। উপরের বাটনে ক্লিক করে বর্তমান পৃষ্ঠা বা প্রশ্ন সেভ করুন।
            </p>
          ) : (
            <div className="max-h-52 overflow-y-auto no-scrollbar bg-white rounded-2xl border border-black/8 divide-y divide-black/6">
              {currentBookBookmarks.map((bm) => {
                const cleanLabel = bm.label.replace(/\s*\(পৃ\.\s*\d+\)\s*$/, "");
                return (
                  <div
                    key={bm.id}
                    className="flex items-center justify-between gap-2 hover:bg-[#FAF9F6] px-3 py-2.5 transition"
                  >
                    <button
                      onClick={() => handleJumpToBookmark(bm)}
                      className="flex-1 text-left min-w-0 flex items-center gap-2 cursor-pointer"
                    >
                      <span className="text-[10px] font-mono font-bold bg-black/6 text-[#141413] px-1.5 py-0.5 rounded shrink-0">
                        পৃ. {bm.pageNumber}
                      </span>
                      <span className="text-xs font-bold text-[#141413] truncate">
                        {cleanLabel}
                      </span>
                    </button>
                    <button
                      onClick={() => removeBookmarkItem(bm.id)}
                      className="p-1.5 text-black/35 hover:text-red-600 rounded-full shrink-0 cursor-pointer"
                      title="মুছে ফেলুন"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-3 pt-2.5 border-t border-black/8 flex items-center justify-between text-[11px]">
            <button
              onClick={() => navigateOfflineSafe("/?bookmarks=1")}
              className="text-[#141413]/75 hover:text-[#141413] underline underline-offset-2 font-bold cursor-pointer"
            >
              সব বিষয়ের বুকমার্ক ({bookmarks.length})
            </button>
            <button
              onClick={() => navigateOfflineSafe("/")}
              className="text-[#141413]/75 hover:text-[#141413] flex items-center gap-1 font-bold cursor-pointer"
            >
              <Home size={12} /> হোম
            </button>
          </div>
        </div>
      )}

      {/* Mobile-Fitted iOS Floating Bottom Pill Dock (Always stays visible; never hides on scroll) */}
      <div className="fixed bottom-4 sm:bottom-5 app-bottom-dock inset-x-0 z-40 flex items-center justify-center px-2 pointer-events-none">
        <div className="flex items-center gap-1 sm:gap-2 max-w-full pointer-events-auto">
          {/* Home Circle Button */}
          <button
            onClick={() => navigateOfflineSafe("/")}
            className="w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-[#111111] text-white shadow-xl flex items-center justify-center active:scale-95 transition cursor-pointer shrink-0"
            title="হোমে ফিরে যান"
          >
            <Home size={15} />
          </button>

          {/* Left Pill: TOC & Page of Current Standalone Book */}
          <button
            onClick={() => {
              setShowTocSheet(true);
              setShowBookmarkPopover(false);
              setShowFontPopover(false);
            }}
            className="h-9 sm:h-11 px-2.5 sm:px-4 rounded-full bg-[#111111] text-white shadow-xl flex items-center gap-1 sm:gap-1.5 text-[11px] sm:text-xs font-medium active:scale-95 transition cursor-pointer shrink-0"
            title="ক, খ ও গ বিভাগের সূচিপত্র"
          >
            <List size={14} className="opacity-80" />
            <span className="font-mono">
              {activePageNum}/{currentChapter.endPage}
            </span>
          </button>

          {/* Center Segmented Pill: Read | Flipbook */}
          <div className="h-9 sm:h-11 p-1 rounded-full bg-[#111111] text-white shadow-xl flex items-center shrink-0">
            <span className="h-7 sm:h-9 px-2.5 sm:px-4 rounded-full bg-white text-black text-[11px] sm:text-xs font-bold flex items-center justify-center">
              Read
            </span>
            <button
              onClick={() =>
                navigateOfflineSafe(
                  `/flipbook?ch=${chapterIndex}&page=${activePageNum}`
                )
              }
              className="h-7 sm:h-9 px-2.5 sm:px-4 rounded-full text-white/80 text-[11px] sm:text-xs font-medium flex items-center justify-center transition cursor-pointer"
            >
              Flipbook
            </button>
          </div>

          {/* Circle Icon 1: Theme */}
          <button
            onClick={cycleTheme}
            className="w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-[#111111] text-white shadow-xl flex items-center justify-center active:scale-95 transition cursor-pointer shrink-0"
            title="থিম"
          >
            {theme === "dark" ? <Moon size={15} /> : <Sun size={15} />}
          </button>

          {/* Circle Icon 2: Typography */}
          <button
            onClick={() => {
              setShowFontPopover(!showFontPopover);
              setShowBookmarkPopover(false);
            }}
            className="w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-[#111111] text-white shadow-xl flex items-center justify-center active:scale-95 transition cursor-pointer shrink-0"
            title="ফন্ট সাইজ"
          >
            <Type size={15} />
          </button>

          {/* Circle Icon 3: Bookmark (Only counts current book's bookmarks!) */}
          <button
            onClick={() => {
              setShowBookmarkPopover(!showBookmarkPopover);
              setShowFontPopover(false);
            }}
            className={`w-9 h-9 sm:w-11 sm:h-11 rounded-full shadow-xl flex items-center justify-center active:scale-95 transition cursor-pointer shrink-0 relative ${
              showBookmarkPopover || isCurrentPageBookmarked
                ? "bg-white text-black border border-black/15"
                : "bg-[#111111] text-white"
            }`}
            title="এই বইয়ের বুকমার্ক করুন ও দেখুন"
          >
            <Bookmark
              size={15}
              className={isCurrentPageBookmarked ? "fill-current" : ""}
            />
            {currentBookBookmarks.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-400 text-black text-[9px] font-black flex items-center justify-center">
                {currentBookBookmarks.length}
              </span>
            )}
          </button>

          {/* Circle Icon 4: Search */}
          <button
            onClick={() => {
              setShowSearchModal(true);
              setShowBookmarkPopover(false);
              setShowFontPopover(false);
            }}
            className="w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-[#111111] text-white shadow-xl flex items-center justify-center active:scale-95 transition cursor-pointer shrink-0"
            title="সার্চ"
          >
            <Search size={15} />
          </button>
        </div>
      </div>

      {/* Responsive TOC Sheet — এই বইয়ের ক, খ ও গ বিভাগের সূচিপত্র */}
      {showTocSheet && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-stretch sm:justify-end"
          onClick={() => setShowTocSheet(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-md bg-[#FAF9F6] text-[#1C1C1E] max-h-[85dvh] sm:max-h-full sm:h-full rounded-t-3xl sm:rounded-none flex flex-col shadow-2xl p-5 sm:p-6 overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-2 pb-3 mb-3 border-b border-black/10 shrink-0">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-widest opacity-55">
                  বই {currentChapter.bookNumber} • কোর্স {currentChapter.courseCode} • সূচিপত্র
                </p>
                <h2 className="text-sm sm:text-base font-extrabold truncate mt-0.5">
                  {currentChapter.titleBn.replace(/^[০-৯1-9]+\.\s*/, "")}
                </h2>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => setShowBookSwitcher(!showBookSwitcher)}
                  className="text-[11px] font-bold px-2.5 py-1.5 rounded-full bg-black/6 hover:bg-black/10 transition cursor-pointer"
                >
                  {showBookSwitcher ? "সূচিপত্র দেখুন" : "অন্য বই ▾"}
                </button>
                <button
                  onClick={() => setShowTocSheet(false)}
                  className="w-8 h-8 rounded-full bg-black/5 hover:bg-black/10 flex items-center justify-center cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {showBookSwitcher ? (
              <div className="space-y-1.5 flex-1 overflow-y-auto pr-1">
                <p className="text-xs font-bold opacity-55 mb-2">
                  ৭টি বই থেকে যেকোনো বই নির্বাচন করুন:
                </p>
                {CHAPTERS.map((ch, idx) => {
                  const isActive = idx === chapterIndex;
                  const chUnlocked = isSubjectUnlocked(ch.id);
                  return (
                    <button
                      key={ch.id}
                      onClick={() => {
                        setShowBookSwitcher(false);
                        goToChapter(idx, 1, 0);
                      }}
                      className={`w-full text-left p-3.5 rounded-2xl transition flex items-center justify-between gap-2 cursor-pointer ${
                        isActive
                          ? "bg-[#111111] text-white"
                          : "hover:bg-black/5 text-[#1C1C1E]"
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-xs sm:text-sm truncate">
                          বই {ch.bookNumber}: {ch.titleBn.replace(/^[০-৯1-9]+\.\s*/, "")}
                        </div>
                        <div className="text-[11px] opacity-60 mt-0.5">
                          মোট {ch.endPage} পৃষ্ঠা • কোর্স {ch.courseCode}
                        </div>
                      </div>
                      {chUnlocked ? (
                        <span className="text-[10px] font-bold bg-emerald-500/20 text-emerald-700 px-2 py-0.5 rounded-full shrink-0">
                          Unlocked
                        </span>
                      ) : (
                        <Lock size={13} className="opacity-50 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <>
                {/* ক / খ / গ বিভাগ Filter Tabs */}
                <div className="grid grid-cols-4 gap-1 bg-black/5 p-1 rounded-2xl mb-3 shrink-0">
                  {[
                    { id: "all", label: "সব বিভাগ", locked: false },
                    { id: "ka", label: "ক-বিভাগ", locked: false },
                    {
                      id: "kha",
                      label: "খ-বিভাগ",
                      locked: !currentBookUnlocked,
                    },
                    {
                      id: "ga",
                      label: "গ-বিভাগ",
                      locked: !currentBookUnlocked,
                    },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() =>
                        setTocTab(tab.id as "all" | "ka" | "kha" | "ga")
                      }
                      className={`py-1.5 rounded-xl text-[11px] font-bold transition cursor-pointer flex items-center justify-center gap-1 ${
                        tocTab === tab.id
                          ? "bg-[#141413] text-white shadow-xs"
                          : "text-[#141413]/70 hover:text-[#141413]"
                      }`}
                    >
                      <span>{tab.label}</span>
                      {tab.locked && <Lock size={11} className="opacity-70 shrink-0" />}
                    </button>
                  ))}
                </div>

                {/* Scrollable সূচিপত্র Content */}
                <div className="flex-1 overflow-y-auto space-y-5 pr-1">
                  {/* ১. ক-বিভাগ (ফ্রি প্রিভিউতে শুধুমাত্র ১–১০ নম্বর প্রশ্ন দেখাবে, বাকিগুলো পেইড/লকড) */}
                  {(tocTab === "all" || tocTab === "ka") && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-extrabold text-[#141413] bg-black/6 px-3 py-1 rounded-full">
                          ক-বিভাগ • অতি সংক্ষিপ্ত প্রশ্ন (
                          {!currentBookUnlocked
                            ? `${bookToc?.kaQuestions.length || 10}টি ফ্রি`
                            : `${bookToc?.kaQuestions.length || 0}টি`}
                          )
                        </span>
                        <span className="text-[10px] opacity-55 font-semibold">
                          {!currentBookUnlocked
                            ? "১–১০ ফ্রি • বাকিগুলো পেইড"
                            : "১–১০, ১১–২০ ক্রমে"}
                        </span>
                      </div>

                      <div className="space-y-2">
                        {(bookToc?.kaRanges || []).map((grp) => {
                          const isExpanded = expandedKaRange === grp.rangeLabel;
                          return (
                            <div
                              key={grp.rangeLabel}
                              className="rounded-2xl border border-black/8 bg-white overflow-hidden"
                            >
                              <div className="flex items-center justify-between px-3.5 py-2.5 gap-2">
                                <button
                                  onClick={() =>
                                    jumpToQuestion(
                                      grp.pageNumber,
                                      grp.firstQuestionId
                                    )
                                  }
                                  className="flex-1 text-left flex items-center justify-between gap-2 cursor-pointer"
                                >
                                  <div>
                                    <span className="text-xs sm:text-sm font-extrabold text-[#141413] block">
                                      প্রশ্ন {grp.rangeLabelBn}{" "}
                                      <span className="text-[11px] font-mono opacity-55">
                                        ({grp.questions.length}টি ফ্রি)
                                      </span>
                                    </span>
                                    <span className="text-[10px] opacity-55 block">
                                      ক্লিক করলে সরাসরি এই অংশে যাবে
                                    </span>
                                  </div>
                                  <span className="text-[11px] font-mono font-bold bg-black/5 px-2.5 py-1 rounded-full shrink-0">
                                    পৃ. {grp.pageNumber}
                                    {grp.endPageNumber !== grp.pageNumber
                                      ? `–${grp.endPageNumber}`
                                      : ""}
                                  </span>
                                </button>

                                <button
                                  onClick={() =>
                                    setExpandedKaRange(
                                      isExpanded ? null : grp.rangeLabel
                                    )
                                  }
                                  className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-black/5 hover:bg-black/10 transition cursor-pointer shrink-0"
                                  title="এই প্রশ্নগুলো দেখুন"
                                >
                                  {isExpanded ? "বন্ধ ▴" : "প্রশ্ন ▾"}
                                </button>
                              </div>

                              {isExpanded && (
                                <div className="border-t border-black/6 bg-[#FAF9F6] px-2.5 py-2 space-y-1">
                                  {grp.questions.map((q) => (
                                    <button
                                      key={q.id}
                                      onClick={() =>
                                        jumpToQuestion(q.pageNumber, q.id)
                                      }
                                      className="w-full text-left px-2.5 py-1.5 rounded-xl hover:bg-black/6 transition flex items-start justify-between gap-2 text-xs cursor-pointer"
                                    >
                                      <span className="leading-snug text-[#141413]">
                                        {q.title}
                                      </span>
                                      <span className="text-[10px] font-mono opacity-50 shrink-0 mt-0.5">
                                        পৃ. {q.pageNumber}
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}

                        {/* ক-বিভাগের বাকি প্রশ্নগুলো (১১–৫০) লকড/পেইড কার্ড */}
                        {!currentBookUnlocked && (
                          <button
                            type="button"
                            onClick={() => {
                              setShowTocSheet(false);
                              navigateToUnlockOrLogin(chapterIndex);
                            }}
                            className="w-full text-left rounded-2xl border border-black/10 bg-white/80 hover:bg-white px-3.5 py-3 flex items-center justify-between gap-2 transition cursor-pointer"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-7 h-7 rounded-full bg-black/8 flex items-center justify-center shrink-0">
                                <Lock size={13} className="text-[#141413]" />
                              </div>
                              <div className="min-w-0">
                                <span className="text-xs font-extrabold text-[#141413] block">
                                  ক-বিভাগের বাকি প্রশ্নসমূহ (১১–{currentChapter.questionCounts.kaBn.replace("টি", "")})
                                </span>
                                <span className="text-[10px] opacity-60 block">
                                  এই প্রশ্নগুলো পেইড • দেখতে বিষয়টি আনলক করুন
                                </span>
                              </div>
                            </div>
                            <span className="text-[10px] font-extrabold bg-[#141413] text-white px-2.5 py-1 rounded-full shrink-0 flex items-center gap-1">
                              <Lock size={10} /> লকড
                            </span>
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ২. খ-বিভাগ (আনলক করা না থাকলে লকড ও পেইড দেখাবে) */}
                  {(tocTab === "all" || tocTab === "kha") && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-extrabold text-[#141413] bg-black/6 px-3 py-1 rounded-full">
                          খ-বিভাগ • সংক্ষিপ্ত প্রশ্ন
                        </span>
                        {!currentBookUnlocked ? (
                          <span className="text-[10px] font-extrabold bg-[#141413] text-white px-2.5 py-0.5 rounded-full flex items-center gap-1">
                            <Lock size={10} /> লকড
                          </span>
                        ) : (
                          <span className="text-[10px] opacity-50">
                            মোট {bookToc?.khaQuestions.length || 0}টি প্রশ্ন
                          </span>
                        )}
                      </div>

                      {currentBookUnlocked ? (
                        <div className="space-y-1.5">
                          {(bookToc?.khaQuestions || []).map((q) => (
                            <button
                              key={q.id}
                              onClick={() => jumpToQuestion(q.pageNumber, q.id)}
                              className="w-full text-left p-3 rounded-2xl bg-white hover:bg-black/5 border border-black/6 transition flex items-start justify-between gap-2.5 text-xs sm:text-[13px] cursor-pointer"
                            >
                              <span className="font-semibold text-[#141413] leading-snug">
                                {q.title}
                              </span>
                              <span className="font-mono text-[10px] font-bold bg-black/5 px-2 py-0.5 rounded-full opacity-75 shrink-0 mt-0.5">
                                পৃ. {q.pageNumber}
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-black/10 bg-white p-4 flex items-center justify-between gap-3">
                          <div className="flex items-start gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center shrink-0 mt-0.5">
                              <Lock size={14} />
                            </div>
                            <div>
                              <p className="text-xs font-extrabold text-[#141413]">
                                খ-বিভাগের প্রশ্ন ও উত্তর লক করা (পেইড)
                              </p>
                              <p className="text-[11px] opacity-65 mt-0.5 leading-relaxed">
                                খ-বিভাগের সকল সংক্ষিপ্ত প্রশ্ন ও উত্তর পেইড। সূচিপত্র ও উত্তর দেখতে বিষয়টি আনলক করুন।
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setShowTocSheet(false);
                              navigateToUnlockOrLogin(chapterIndex);
                            }}
                            className="shrink-0 bg-amber-400 text-amber-950 hover:bg-amber-300 text-[11px] font-bold px-3.5 py-2 rounded-full cursor-pointer transition shadow-xs"
                          >
                            আনলক করুন
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ৩. গ-বিভাগ (আনলক করা না থাকলে লকড ও পেইড দেখাবে) */}
                  {(tocTab === "all" || tocTab === "ga") && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-extrabold text-[#141413] bg-black/6 px-3 py-1 rounded-full">
                          গ-বিভাগ • রচনামূলক প্রশ্ন
                        </span>
                        {!currentBookUnlocked ? (
                          <span className="text-[10px] font-extrabold bg-[#141413] text-white px-2.5 py-0.5 rounded-full flex items-center gap-1">
                            <Lock size={10} /> লকড
                          </span>
                        ) : (
                          <span className="text-[10px] opacity-50">
                            মোট {bookToc?.gaQuestions.length || 0}টি প্রশ্ন
                          </span>
                        )}
                      </div>

                      {currentBookUnlocked ? (
                        <div className="space-y-1.5">
                          {(bookToc?.gaQuestions || []).map((q) => (
                            <button
                              key={q.id}
                              onClick={() => jumpToQuestion(q.pageNumber, q.id)}
                              className="w-full text-left p-3 rounded-2xl bg-white hover:bg-black/5 border border-black/6 transition flex items-start justify-between gap-2.5 text-xs sm:text-[13px] cursor-pointer"
                            >
                              <span className="font-semibold text-[#141413] leading-snug">
                                {q.title}
                              </span>
                              <span className="font-mono text-[10px] font-bold bg-black/5 px-2 py-0.5 rounded-full opacity-75 shrink-0 mt-0.5">
                                পৃ. {q.pageNumber}
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-black/10 bg-white p-4 flex items-center justify-between gap-3">
                          <div className="flex items-start gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center shrink-0 mt-0.5">
                              <Lock size={14} />
                            </div>
                            <div>
                              <p className="text-xs font-extrabold text-[#141413]">
                                গ-বিভাগের প্রশ্ন ও উত্তর লক করা (পেইড)
                              </p>
                              <p className="text-[11px] opacity-65 mt-0.5 leading-relaxed">
                                গ-বিভাগের সকল রচনামূলক প্রশ্ন ও উত্তর পেইড। সূচিপত্র ও উত্তর দেখতে বিষয়টি আনলক করুন।
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setShowTocSheet(false);
                              navigateToUnlockOrLogin(chapterIndex);
                            }}
                            className="shrink-0 bg-amber-400 text-amber-950 hover:bg-amber-300 text-[11px] font-bold px-3.5 py-2 rounded-full cursor-pointer transition shadow-xs"
                          >
                            আনলক করুন
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}

            <div className="pt-3 mt-3 border-t border-black/10 shrink-0">
              <button
                onClick={async () => {
                  setShowTocSheet(false);
                  if (!currentBookUnlocked) {
                    navigateToUnlockOrLogin(chapterIndex);
                  } else {
                    await handleToggleOfflineSave();
                  }
                }}
                disabled={savingOfflineChapter === chapterIndex}
                className="w-full bg-[#111111] text-white py-3 rounded-full text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {currentBookOfflineSaved ? (
                  <>
                    <Check size={14} /> অ্যাপ অফলাইনে সেভ করা আছে (রিমুভ করতে ক্লিক)
                  </>
                ) : (
                  <>
                    <Download size={14} /> অ্যাপের ভেতরে অফলাইনে সেভ করুন
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search Modal */}
      {showSearchModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-start justify-center p-3 pt-12 sm:pt-16">
          <div className="bg-[#FAF9F6] text-[#1C1C1E] w-full max-w-lg rounded-3xl shadow-2xl p-4 sm:p-5 overflow-hidden">
            <div className="flex items-center gap-2.5 border-b border-black/10 pb-3">
              <Search size={17} className="opacity-50 shrink-0" />
              <input
                autoFocus
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="প্রশ্ন বা টপিক খুঁজুন..."
                className="flex-1 bg-transparent text-sm focus:outline-none min-w-0"
              />
              <button
                onClick={() => setShowSearchModal(false)}
                className="p-1 rounded-full hover:bg-black/5 cursor-pointer"
              >
                <X size={17} />
              </button>
            </div>

            <div className="max-h-[60dvh] overflow-y-auto mt-3 space-y-1.5">
              {searchingGlobal ? (
                <p className="text-xs opacity-50 py-6 text-center">খোঁজা হচ্ছে...</p>
              ) : globalResults.length === 0 ? (
                <p className="text-xs opacity-50 py-6 text-center">
                  {searchQuery.trim().length < 2
                    ? "কমপক্ষে ২টি অক্ষর লিখুন"
                    : "কোনো ফলাফল পাওয়া যায়নি"}
                </p>
              ) : (
                globalResults.map((r) => (
                  <button
                    key={r.pageNumber}
                    onClick={() => {
                      goToChapter(r.chapterIndex, r.pageNumber, 0);
                      setShowSearchModal(false);
                    }}
                    className="w-full text-left p-2.5 rounded-2xl hover:bg-black/5 transition flex items-start justify-between gap-2 cursor-pointer"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-bold truncate">
                        {r.chapterTitleBn}
                      </div>
                      <p className="text-xs opacity-70 mt-0.5 line-clamp-2">
                        {r.snippet}
                      </p>
                    </div>
                    <span className="text-[10px] font-mono bg-black text-white px-2 py-0.5 rounded-full shrink-0">
                      পৃ. {r.pageNumber}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Bookmark Toast */}
      {bookmarkToast && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 bg-[#111111] text-white px-4 py-2 rounded-full shadow-xl flex items-center gap-1.5 text-xs font-medium">
          <Check size={14} /> পৃষ্ঠা {activePageNum} বুকমার্ক সেভ করা হয়েছে
        </div>
      )}

      {/* Dynamic Offline Download Progress Animation */}
      <OfflineDownloadModal
        isOpen={showOfflineDownloadAnim}
        isCompleted={offlineDownloadDone}
        bookNumber={currentChapter.bookNumber}
        bookTitle={currentChapter.titleBn}
        totalPages={currentChapter.endPage - currentChapter.startPage + 1}
        onComplete={() => {
          setShowOfflineDownloadAnim(false);
          setOfflineDownloadDone(false);
          if (offlinePendingMsg) {
            setOfflineToastMsg(offlinePendingMsg);
            setOfflinePendingMsg(null);
            setTimeout(() => setOfflineToastMsg(null), 4000);
          }
        }}
      />

      {/* Offline Book Delete Confirmation Modal */}
      {showDeleteConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div
            className="w-full max-w-sm bg-white dark:bg-[#1C1C1E] text-[#141413] dark:text-white rounded-3xl p-6 shadow-2xl border border-black/10 dark:border-white/10 text-center space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-2xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 mx-auto flex items-center justify-center">
              <Trash2 size={22} />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-[#141413] dark:text-white">
                অফলাইন বই মুছে ফেলতে চান?
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed max-w-xs mx-auto">
                আপনি কি <span className="font-bold text-[#141413] dark:text-white">বই {currentChapter.bookNumber}</span> ({currentChapter.titleBn})-এর সংরক্ষিত অফলাইন ডেটা মুছে ফেলতে চান?
              </p>
              <p className="text-[11px] text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 rounded-xl p-2.5 mt-2">
                পরবর্তীতে ইন্টারনেট ছাড়া সরাসরি পড়তে চাইলে বইটি আবার অফলাইনে সেভ করতে হবে।
              </p>
            </div>

            <div className="flex items-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirmModal(false)}
                className="flex-1 py-2.5 rounded-full border border-gray-300 dark:border-zinc-700 text-xs font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800 transition cursor-pointer"
              >
                বাতিল
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteOffline}
                className="flex-1 py-2.5 rounded-full bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-md transition cursor-pointer"
              >
                মুছে ফেলুন
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ReadPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-dvh bg-[#FAF9F6] flex items-center justify-center">
          <div className="animate-spin w-6 h-6 border-2 border-black border-t-transparent rounded-full" />
        </div>
      }
    >
      <ReaderInner />
    </Suspense>
  );
}
