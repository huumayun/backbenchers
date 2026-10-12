"use client";

import React, { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/context/AuthContext";
import { CHAPTERS, TOTAL_BOOK_PAGES } from "@/lib/book/chapters";
import {
  getOfflineBookData,
  searchOfflineVaultBooks,
  OfflineSearchHit,
  isDeviceOnline,
} from "@/lib/offline/offlineStore";
import OfflineDownloadModal from "@/components/OfflineDownloadModal";
import { recordReadingHeartbeat } from "@/lib/readingStats";
import {
  ChevronLeft,
  ChevronRight,
  Lock,
  List,
  X,
  Key,
  Sun,
  Moon,
  Type,
  Maximize,
  Minimize,
  Columns2,
  FileText,
  Bookmark,
  Plus,
  Trash2,
  Check,
  Home,
  Download,
  WifiOff,
  Loader2,
  Search,
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
}

interface FlipPageData {
  pageNumber: number;
  chapterIndex: number;
  chapterTitleBn: string;
  courseCode?: string;
  sectionLabel?: string;
  isFree: boolean;
  isLocked: boolean;
  html: string;
}

function FlipbookInner() {
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
    updateProgress,
    bookmarks,
    addBookmarkItem,
    removeBookmarkItem,
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

  const initialChParam = parseInt(searchParams.get("ch") || "0", 10);
  const initialPageParam = parseInt(searchParams.get("page") || "1", 10);

  const [chapterIndex, setChapterIndex] = useState(
    initialChParam >= 0 && initialChParam < CHAPTERS.length ? initialChParam : 0
  );
  const currentBook = CHAPTERS[chapterIndex] || CHAPTERS[0];
  const activeUid = profile?.uid || user?.uid || "";
  const currentBookAccessInfo = getSubjectAccessInfo(chapterIndex);
  const currentBookUnlocked = isSubjectUnlocked(chapterIndex);
  const currentBookOfflineSaved = isBookSavedOffline(chapterIndex);
  const isSavingThisBook = savingOfflineChapter === chapterIndex;
  const [isReadingOffline, setIsReadingOffline] = useState(false);
  const [offlineNotice, setOfflineNotice] = useState<string | null>(null);
  const [showOfflineDownloadAnim, setShowOfflineDownloadAnim] = useState(false);
  const [offlineDownloadDone, setOfflineDownloadDone] = useState(false);
  const [offlinePendingNotice, setOfflinePendingNotice] = useState<string | null>(null);
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);

  const handleToggleOffline = async () => {
    setOfflineNotice(null);
    if (!currentBookOfflineSaved) {
      if (!isDeviceOnline()) {
        setOfflineNotice(
          "⚠️ ইন্টারনেট সংযোগ নেই! বইটি অফলাইনে ডাউনলোড করতে অনুগ্রহ করে ডাটা বা Wi-Fi চালু করুন।"
        );
        setTimeout(() => setOfflineNotice(null), 4500);
        return;
      }
      setOfflineDownloadDone(false);
      setShowOfflineDownloadAnim(true);
      const res = await toggleOfflineBook(chapterIndex);
      if (!res.success) {
        setShowOfflineDownloadAnim(false);
        setOfflineDownloadDone(false);
        setOfflineNotice(res.message);
        setTimeout(() => setOfflineNotice(null), 4500);
        return;
      }
      setOfflinePendingNotice(res.message);
      setOfflineDownloadDone(true);
    } else {
      setShowDeleteConfirmModal(true);
    }
  };

  const handleConfirmDeleteOffline = async () => {
    setShowDeleteConfirmModal(false);
    const res = await toggleOfflineBook(chapterIndex);
    setOfflineNotice(res.message);
    setTimeout(() => setOfflineNotice(null), 3500);
  };

  const [pages, setPages] = useState<FlipPageData[]>([]);
  const [bookToc, setBookToc] = useState<BookTocData | null>(null);
  const [tocTab, setTocTab] = useState<"all" | "ka" | "kha" | "ga">("all");
  const [expandedKaRange, setExpandedKaRange] = useState<string | null>("1-10");
  const [showBookSwitcher, setShowBookSwitcher] = useState(false);

  const [loadingBook, setLoadingBook] = useState(true);
  const [currentPage, setCurrentPage] = useState(
    Math.min(Math.max(1, initialPageParam), currentBook.endPage)
  );
  const [theme, setTheme] = useState<"light" | "sepia" | "dark">("light");
  const [fontSize, setFontSize] = useState(16);
  const [showFontPopover, setShowFontPopover] = useState(false);
  const [showBookmarkPopover, setShowBookmarkPopover] = useState(false);
  const [bookmarkToast, setBookmarkToast] = useState(false);
  const [flipState, setFlipState] = useState<"idle" | "flipping-next" | "flipping-prev">("idle");
  const [showToc, setShowToc] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [twoPageMode, setTwoPageMode] = useState(false);

  // Search State (Works both Online & Offline)
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<OfflineSearchHit[]>([]);
  const [searching, setSearching] = useState(false);

  // Load saved reader theme & fontSize and prefetch offline routes
  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedTheme = localStorage.getItem("ebook_reader_theme");
    if (savedTheme === "light" || savedTheme === "sepia" || savedTheme === "dark") {
      setTheme(savedTheme);
    }
    const savedSize = parseInt(localStorage.getItem("ebook_reader_fontsize") || "", 10);
    if (!Number.isNaN(savedSize) && savedSize >= 12 && savedSize <= 24) {
      setFontSize(savedSize);
    }
    try {
      router.prefetch("/");
      router.prefetch("/read");
      router.prefetch("/dashboard");
    } catch {
      // ignore prefetch errors when offline
    }
  }, [router]);

  // Record reading heartbeat every 10s to accumulate reader study time
  useEffect(() => {
    const timer = setInterval(() => {
      recordReadingHeartbeat(10);
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  const navigateOfflineSafe = useCallback(
    (targetUrl: string) => {
      if (typeof window !== "undefined" && !isDeviceOnline()) {
        window.location.assign(targetUrl);
        return;
      }
      router.push(targetUrl);
    },
    [router]
  );

  // Global / Offline Search Effect
  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      const isOfflineNow = !isDeviceOnline();

      if (isOfflineNow) {
        try {
          const hits = await searchOfflineVaultBooks({
            query: searchQuery,
            uid: activeUid,
            deviceId,
            activePages: pages,
            activeChapterIndex: chapterIndex,
            activeChapterTitleBn: currentBook.titleBn,
          });
          setSearchResults(hits);
        } catch {
          setSearchResults([]);
        }
        setSearching(false);
        return;
      }

      try {
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

        const r = await fetch(`/api/book-content?search=${encodeURIComponent(searchQuery)}`, {
          headers,
        });
        const data = await r.json();
        if (data.sessionInvalidated) {
          handleSessionInvalidated();
          return;
        }
        setSearchResults(data.results || []);
      } catch {
        const hits = await searchOfflineVaultBooks({
          query: searchQuery,
          uid: activeUid,
          deviceId,
          activePages: pages,
          activeChapterIndex: chapterIndex,
          activeChapterTitleBn: currentBook.titleBn,
        });
        setSearchResults(hits);
      }
      setSearching(false);
    }, 280);
    return () => clearTimeout(timer);
  }, [searchQuery, activeUid, deviceId, sessionToken, handleSessionInvalidated, pages, chapterIndex, currentBook.titleBn]);

  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const pageScrollRef = useRef<HTMLDivElement>(null);
  const rightPageScrollRef = useRef<HTMLDivElement>(null);
  const rootContainerRef = useRef<HTMLDivElement>(null);

  const lastFetchedChapterRef = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    const isChapterSwitch = lastFetchedChapterRef.current !== chapterIndex;
    if (isChapterSwitch) {
      setLoadingBook(true);
      setPages([]);
      setBookToc(null);
    }
    setOfflineNotice(null);

    const loadFlipbook = async () => {
      const applyLoadedData = (loadedPages: FlipPageData[], tocData?: BookTocData) => {
        if (!active) return;
        const isBookUnlocked = isSubjectUnlocked(chapterIndex);
        const sanitizedPages = isBookUnlocked
          ? loadedPages.map((p) => ({ ...p, isLocked: false }))
          : loadedPages;
        setPages(sanitizedPages);
        if (tocData) setBookToc(tocData);
        setLoadingBook(false);

        const isNewChapter = lastFetchedChapterRef.current !== chapterIndex;
        lastFetchedChapterRef.current = chapterIndex;

        if (isNewChapter) {
          const clampedPage = Math.min(
            Math.max(1, currentPage),
            loadedPages.length || currentBook.endPage
          );
          updateProgress({
            chapterIndex,
            pageNumber: clampedPage,
            pageOffset: 0,
            scrollPercent: Math.round(
              (clampedPage / (loadedPages.length || currentBook.endPage)) * 100
            ),
            mode: "flipbook",
          });
        }
      };

      const tryOfflineFallback = async () => {
        const cached = await getOfflineBookData({
          chapterIndex,
          uid: activeUid,
          deviceId,
          mode: "flipbook",
        });
        if (cached.expired && cached.message) {
          if (active && !isDeviceOnline()) setOfflineNotice(cached.message);
          return false;
        }
        if (cached.found && Array.isArray(cached.pages) && cached.pages.length > 0) {
          if (active) setIsReadingOffline(!isDeviceOnline());
          applyLoadedData(
            cached.pages as FlipPageData[],
            (cached.toc as BookTocData) || undefined
          );
          return true;
        }
        return false;
      };

      // 1. Always check encrypted IndexedDB vault FIRST if book is unlocked so saved offline books open instantaneously!
      if (currentBookUnlocked) {
        const loadedFromVault = await tryOfflineFallback();
        if (loadedFromVault) return;
      }

      if (!isDeviceOnline()) {
        if (active) {
          setPages([]);
          setBookToc(null);
          setIsReadingOffline(false);
          setLoadingBook(false);
          setOfflineNotice(
            "আপনি এখন অফলাইনে আছেন। এই বইটি অফলাইনে সেভ করা নেই। বইটি পড়তে বা অফলাইনে ডাউনলোড করতে ইন্টারনেট সংযোগ চালু করুন।"
          );
        }
        return;
      }

      try {
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

        const r = await fetch(`/api/book-content?mode=flipbook&chapter=${chapterIndex}`, {
          headers,
          cache: "no-store",
        });
        const data = await r.json();
        if (!active) return;
        if (!r.ok || data.offline || data.error) {
          throw new Error(data.error || "Network offline");
        }
        if (data.sessionInvalidated) {
          handleSessionInvalidated();
          return;
        }
        setIsReadingOffline(false);
        applyLoadedData(data.pages || [], data.toc);
      } catch {
        const ok = await tryOfflineFallback();
        if (!ok && active) {
          setPages([]);
          setBookToc(null);
          setIsReadingOffline(false);
          setLoadingBook(false);
          setOfflineNotice(
            "আপনি এখন অফলাইনে আছেন। এই বইটি অফলাইনে সেভ করা নেই। বইটি পড়তে বা অফলাইনে ডাউনলোড করতে ইন্টারনেট সংযোগ চালু করুন।"
          );
        }
      }
    };

    loadFlipbook();

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

  const totalPages = pages.length || currentBook.endPage;
  const step = twoPageMode && currentPage > 1 ? 2 : 1;

  const goToPage = useCallback(
    (targetPage: number, direction?: "next" | "prev") => {
      const clamped = Math.min(Math.max(1, targetPage), totalPages);
      if (clamped === currentPage) return;

      const dir = direction || (clamped > currentPage ? "next" : "prev");
      setFlipState(dir === "next" ? "flipping-next" : "flipping-prev");

      setTimeout(() => {
        setCurrentPage(clamped);
        setFlipState("idle");
        pageScrollRef.current?.scrollTo({ top: 0 });
        rightPageScrollRef.current?.scrollTo({ top: 0 });
        const pageObj = pages[clamped - 1];
        if (pageObj) {
          updateProgress({
            chapterIndex: pageObj.chapterIndex,
            pageNumber: clamped,
            pageOffset: 0,
            scrollPercent: Math.round((clamped / totalPages) * 100),
            mode: "flipbook",
          });
        }
      }, 220);
    },
    [currentPage, totalPages, pages, updateProgress]
  );

  const jumpToQuestion = useCallback(
    (targetPage: number, questionId: string) => {
      setShowToc(false);
      const clamped = Math.min(Math.max(1, targetPage), totalPages);
      const isSamePage = clamped === currentPage;

      if (!isSamePage) {
        const dir = clamped > currentPage ? "next" : "prev";
        setFlipState(dir === "next" ? "flipping-next" : "flipping-prev");
        setTimeout(() => {
          setCurrentPage(clamped);
          setFlipState("idle");
        }, 180);
      }

      updateProgress({
        chapterIndex,
        pageNumber: clamped,
        pageOffset: 0,
        scrollPercent: Math.round((clamped / totalPages) * 100),
        mode: "flipbook",
      });

      setTimeout(
        () => {
          const el = document.getElementById(questionId);
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "start" });
            el.classList.add("q-highlight-flash");
            setTimeout(() => el.classList.remove("q-highlight-flash"), 2400);
          } else {
            pageScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
          }
        },
        isSamePage ? 80 : 280
      );
    },
    [currentPage, totalPages, chapterIndex, updateProgress]
  );

  const handleNext = useCallback(() => {
    if (currentPage >= totalPages) return;
    goToPage(Math.min(totalPages, currentPage + step), "next");
  }, [currentPage, totalPages, step, goToPage]);

  const handlePrev = useCallback(() => {
    if (currentPage <= 1) return;
    goToPage(Math.max(1, currentPage - step), "prev");
  }, [currentPage, step, goToPage]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowRight") handleNext();
      if (e.key === "ArrowLeft") handlePrev();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleNext, handlePrev]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.changedTouches[0].screenX;
    touchStartY.current = e.changedTouches[0].screenY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const dx = touchStartX.current - e.changedTouches[0].screenX;
    const dy = touchStartY.current - e.changedTouches[0].screenY;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.3) {
      if (dx > 0) handleNext();
      else handlePrev();
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      rootContainerRef.current?.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  };

  const cycleTheme = () => {
    setTheme((prev) => {
      const next = prev === "light" ? "sepia" : prev === "sepia" ? "dark" : "light";
      if (typeof window !== "undefined") {
        localStorage.setItem("ebook_reader_theme", next);
      }
      return next;
    });
  };

  const changeFontSize = (delta: number) => {
    setFontSize((prev) => {
      const next = Math.min(24, Math.max(12, prev + delta));
      if (typeof window !== "undefined") {
        localStorage.setItem("ebook_reader_fontsize", String(next));
      }
      return next;
    });
  };

  // Filter bookmarks ONLY for this specific book/subject!
  const currentBookBookmarks = bookmarks.filter(
    (b) => b.chapterIndex === chapterIndex
  );
  const isCurrentPageBookmarked = currentBookBookmarks.some(
    (b) => b.pageNumber === currentPage
  );

  const pageData = pages[currentPage - 1];
  const secondPageData =
    twoPageMode && currentPage < totalPages ? pages[currentPage] : null;

  const outerBg =
    theme === "dark"
      ? "bg-[#0E0E0D] text-[#E5E4E0]"
      : theme === "sepia"
      ? "bg-[#EAE0C8] text-[#2C241B]"
      : "bg-[#EFECE6] text-[#1C1C1E]";

  const paperBg =
    theme === "dark"
      ? "bg-[#181816] text-[#E5E4E0] border-white/10"
      : theme === "sepia"
      ? "bg-[#F6EFE0] text-[#2C241B] border-black/10"
      : "bg-[#FAF9F6] text-[#1C1C1E] border-black/5";

  const renderPageContent = (
    pData: FlipPageData,
    scrollRef: React.RefObject<HTMLDivElement | null>
  ) => (
    <>
      {/* Book Title Header */}
      <div className="pt-4 sm:pt-6 pb-2.5 px-4 sm:px-10 text-center shrink-0 border-b border-current/5">
        <p className="text-[10px] sm:text-xs font-medium opacity-50 tracking-wide">
          বই {currentBook.bookNumber} • কোর্স {pData.courseCode || currentBook.courseCode}
        </p>
        <h2 className="text-sm sm:text-xl font-extrabold mt-0.5 truncate">
          {pData.chapterTitleBn.replace(/^[০-৯1-9]+\.\s*/, "")}
        </h2>
      </div>

      {/* Page Body */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overflow-x-hidden w-full max-w-full px-4 sm:px-10 lg:px-14 pt-3 sm:pt-5 pb-10 flip-clean-scope"
        style={{ fontSize: `${fontSize}px` }}
      >
        {!pData.isLocked ? (
          <div className="w-full max-w-full overflow-x-hidden" dangerouslySetInnerHTML={{ __html: pData.html }} />
        ) : (
          <div className="py-8 px-4 flex flex-col items-center justify-center text-center">
            <div className="rounded-3xl border border-black/10 dark:border-white/10 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md p-6 sm:p-8 text-center space-y-4 shadow-xl max-w-md w-full">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400 mx-auto flex items-center justify-center">
                <Lock size={22} />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-bold text-[#141413] dark:text-white">
                  বই {currentBook.bookNumber}-এর পৃষ্ঠা {pData.pageNumber} লক করা
                </h3>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-sm mx-auto leading-relaxed">
                  {!isLoggedIn
                    ? "বইটি পড়তে এবং আনলক করতে প্রথমে আপনার অ্যাকাউন্টে লগইন করুন।"
                    : `${currentBook.titleBn}-এর সম্পূর্ণ পৃষ্ঠা ও উত্তর পড়তে এবং আনলক কোড এন্টার করতে বিস্তারিত আনলক পেজে যান।`}
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
      </div>

      {/* Page Bottom Footer */}
      <div className="px-4 sm:px-10 py-2 sm:py-2.5 border-t border-current/5 flex items-center justify-between text-xs shrink-0 z-10 bg-inherit">
        <button
          onClick={handlePrev}
          disabled={currentPage <= 1}
          className="flex items-center gap-0.5 font-semibold opacity-70 hover:opacity-100 disabled:opacity-20 py-1 px-2 cursor-pointer"
        >
          <ChevronLeft size={15} /> আগের পৃষ্ঠা
        </button>
        <span className="text-[11px] sm:text-xs opacity-45 font-mono">
          — {pData.pageNumber} —
        </span>
        <button
          onClick={handleNext}
          disabled={currentPage >= totalPages}
          className="flex items-center gap-0.5 font-semibold opacity-70 hover:opacity-100 disabled:opacity-20 py-1 px-2 cursor-pointer"
        >
          পরের পৃষ্ঠা <ChevronRight size={15} />
        </button>
      </div>
    </>
  );

  return (
    <div
      ref={rootContainerRef}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className={`h-dvh overflow-hidden flex flex-col justify-between transition-colors duration-300 ${outerBg}`}
    >
      {/* Clean Flipbook Typography, Diagrams & Responsive Tables */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .flip-clean-scope,
            .flip-clean-scope .section-content,
            .flip-clean-scope .question-item {
              font-family: 'Hind Siliguri', 'SolaimanLipi', Georgia, serif;
              line-height: 1.82;
              width: 100%;
              max-width: 100%;
              box-sizing: border-box;
              overflow-x: hidden;
              overflow-wrap: break-word;
              word-wrap: break-word;
              word-break: break-word;
            }
            .flip-clean-scope .subject-header-banner,
            .flip-clean-scope .running-header {
              display: none !important;
            }
            .flip-clean-scope .section-badge {
              display: inline-block;
              font-size: 0.78em;
              font-weight: 700;
              padding: 4px 12px;
              border-radius: 999px;
              margin-bottom: 14px;
              background: rgba(128,128,128,0.12);
              max-width: 100%;
            }
            .flip-clean-scope .question-item {
              margin-bottom: 18px;
              padding-bottom: 14px;
              border-bottom: 1px solid rgba(128,128,128,0.12);
            }
            .flip-clean-scope .question-item:last-child {
              border-bottom: none;
            }
            .flip-clean-scope .question-item p,
            .flip-clean-scope .question-item h3,
            .flip-clean-scope .question-item h4,
            .flip-clean-scope .question-item li {
              margin: 6px 0;
              text-align: left;
              max-width: 100%;
              overflow-wrap: break-word;
              word-break: break-word;
            }
            @media (min-width: 768px) {
              .flip-clean-scope .question-item p {
                text-align: justify;
              }
            }
            .flip-clean-scope ul,
            .flip-clean-scope ol {
              margin: 6px 0 10px 1.2em;
              padding: 0;
              max-width: 100%;
            }
            /* Diagrams / Flowcharts / ASCII Art inside <pre> */
            .flip-clean-scope pre {
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
            .flip-clean-scope pre code {
              font-family: inherit;
              font-size: inherit;
              background: transparent;
              padding: 0;
              white-space: inherit;
            }
            @media (max-width: 639px) {
              .flip-clean-scope pre {
                font-size: clamp(9.5px, 2.4vw, 11.5px);
                line-height: 1.35;
                padding: 10px;
                white-space: pre-wrap;
                word-break: break-word;
              }
            }
            /* SVG & Images: never exceed screen width */
            .flip-clean-scope svg,
            .flip-clean-scope img {
              max-width: 100% !important;
              height: auto !important;
              display: block;
              margin: 10px auto;
            }
            /* Responsive Tables that fit inside phone screen without overflowing */
            .flip-clean-scope table {
              width: 100%;
              max-width: 100%;
              border-collapse: collapse;
              font-size: 0.9em;
              margin: 12px 0;
              box-sizing: border-box;
            }
            .flip-clean-scope th,
            .flip-clean-scope td {
              border: 1px solid rgba(128,128,128,0.22);
              padding: 7px 10px;
              overflow-wrap: break-word;
              word-break: break-word;
            }
            @media (max-width: 639px) {
              .flip-clean-scope table {
                font-size: 0.8em;
                table-layout: fixed;
              }
              .flip-clean-scope th,
              .flip-clean-scope td {
                padding: 5px 6px;
              }
            }
            .flip-clean-scope th {
              background: rgba(128,128,128,0.08);
              font-weight: 700;
            }
            @keyframes realisticTurnNext {
              0% { transform: perspective(1600px) rotateY(0deg); opacity: 1; }
              50% { transform: perspective(1600px) rotateY(-22deg) scale(0.98); opacity: 0.88; }
              100% { transform: perspective(1600px) rotateY(0deg); opacity: 1; }
            }
            @keyframes realisticTurnPrev {
              0% { transform: perspective(1600px) rotateY(0deg); opacity: 1; }
              50% { transform: perspective(1600px) rotateY(22deg) scale(0.98); opacity: 0.88; }
              100% { transform: perspective(1600px) rotateY(0deg); opacity: 1; }
            }
            .turn-next { animation: realisticTurnNext 0.24s ease-out; transform-origin: left center; }
            .turn-prev { animation: realisticTurnPrev 0.24s ease-out; transform-origin: right center; }
            .q-highlight-flash {
              background: rgba(245, 158, 11, 0.16) !important;
              border-radius: 14px;
              padding: 10px 12px !important;
              transition: background 0.4s ease;
            }
          `,
        }}
      />

      {/* Minimal Top Bar (Expands nicely on PC) */}
      <header className="px-4 sm:px-10 h-12 sm:h-14 flex items-center justify-between max-w-7xl mx-auto w-full shrink-0">
        <Link
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navigateOfflineSafe("/");
          }}
          className="flex items-center gap-1 text-xs sm:text-sm font-medium opacity-70 hover:opacity-100 py-1"
        >
          <ChevronLeft size={17} />
          <span>হোম</span>
        </Link>

        <span className="text-[11px] sm:text-xs opacity-55 font-mono">
          বই {currentBook.bookNumber} • পৃষ্ঠা {currentPage}
          {secondPageData ? `–${secondPageData.pageNumber}` : ""} / {totalPages}
          {isReadingOffline ? " • অফলাইন মোড" : ""}
        </span>

        <div className="flex items-center gap-2">
          {/* Desktop 1-page / 2-page spread toggle */}
          <button
            onClick={() => setTwoPageMode(!twoPageMode)}
            className="hidden xl:flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full bg-black/5 hover:bg-black/10 dark:bg-white/10 transition cursor-pointer"
            title="১ পৃষ্ঠা / ২ পৃষ্ঠা মোড"
          >
            {twoPageMode ? <FileText size={13} /> : <Columns2 size={13} />}
            <span>{twoPageMode ? "১ পৃষ্ঠা" : "২ পৃষ্ঠা (বই মোড)"}</span>
          </button>

          {currentBookUnlocked ? (
            <button
              onClick={handleToggleOffline}
              disabled={isSavingThisBook}
              className={`text-[11px] sm:text-xs font-semibold px-2.5 sm:px-3 py-1 rounded-full flex items-center gap-1.5 cursor-pointer transition shadow-xs ${
                currentBookOfflineSaved
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-500/60 shadow-[0_2px_8px_rgba(16,185,129,0.35)] active:scale-95"
                  : "bg-black/6 hover:bg-black/10 dark:bg-white/10"
              }`}
              title={
                currentBookOfflineSaved
                  ? "বইটি অফলাইনে সংরক্ষিত আছে (মুছে ফেলতে ক্লিক করুন)"
                  : "অ্যাপের ভেতরে অফলাইনে পড়ার জন্য সেভ করুন"
              }
            >
              {isSavingThisBook ? (
                <>
                  <Loader2 size={11} className="animate-spin" />
                  <span>সেভ হচ্ছে...</span>
                </>
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
          ) : (
            <button
              onClick={() => navigateToUnlockOrLogin(chapterIndex)}
              className="text-[11px] sm:text-xs font-bold px-3 py-1 rounded-full bg-amber-400 text-amber-950 hover:bg-amber-300 shadow-xs flex items-center gap-1 cursor-pointer transition"
            >
              <Key size={11} /> আনলক
            </button>
          )}

          <button
            onClick={() => setShowSearch(true)}
            className="w-8 h-8 rounded-full flex items-center justify-center opacity-70 hover:opacity-100 cursor-pointer"
            title="সার্চ করুন"
          >
            <Search size={16} />
          </button>
        </div>
      </header>

      {offlineNotice && (
        <div className="max-w-xl mx-auto px-4 pb-1.5 w-full shrink-0">
          <div className="bg-[#141413] text-white text-[11px] font-medium px-3.5 py-2 rounded-xl flex items-center justify-between gap-2 shadow-md">
            <span className="flex items-center gap-1.5">
              <WifiOff size={12} className="shrink-0 opacity-80" />
              <span>{offlineNotice}</span>
            </span>
            <button
              onClick={() => setOfflineNotice(null)}
              className="opacity-60 hover:opacity-100 cursor-pointer"
            >
              <X size={12} />
            </button>
          </div>
        </div>
      )}

      {(currentBookAccessInfo.badgeType === "free" ||
        currentBookAccessInfo.badgeType === "timed") && (
        <div className="max-w-xl mx-auto px-4 pb-1.5 w-full shrink-0">
          <div
            className={`rounded-xl px-3.5 py-1.5 border flex items-center justify-between gap-2 text-[11px] font-bold shadow-2xs ${
              currentBookAccessInfo.badgeType === "free"
                ? "bg-emerald-500/12 border-emerald-500/25 text-emerald-950 dark:text-emerald-200"
                : "bg-amber-500/12 border-amber-500/25 text-amber-950 dark:text-amber-200"
            }`}
          >
            <span className="truncate">
              {currentBookAccessInfo.badgeType === "free" ? "🎁 ফ্রি" : "⏳ টাইমড"} • বই {currentBook.bookNumber}:{" "}
              {currentBookAccessInfo.countdownTextBn ||
                currentBookAccessInfo.badgeTextBn}
            </span>
            <button
              type="button"
              onClick={() => navigateToUnlockOrLogin(chapterIndex)}
              className="underline underline-offset-2 shrink-0 cursor-pointer"
            >
              স্থায়ী আনলক →
            </button>
          </div>
        </div>
      )}

      {/* Center Book Page Card: Mobile stays compact, PC expands large & full-screen! */}
      <main className="flex-1 flex items-center justify-center px-2.5 sm:px-8 lg:px-12 pb-16 sm:pb-20 min-h-0">
        <div className="relative flex items-center justify-center w-full max-w-7xl h-full">
          {/* Desktop Left Turn Button */}
          <button
            onClick={handlePrev}
            disabled={currentPage <= 1}
            className="hidden sm:flex w-11 h-11 lg:w-12 lg:h-12 rounded-full bg-black/5 hover:bg-black/15 dark:bg-white/10 items-center justify-center mr-4 lg:mr-6 disabled:opacity-15 transition cursor-pointer shrink-0 shadow-xs"
            title="আগের পৃষ্ঠা"
          >
            <ChevronLeft size={22} />
          </button>

          {/* The Paper Page(s) — Mobile: max-w-[540px], PC: md:max-w-[820px] lg:max-w-[960px] xl:max-w-[1180px] */}
          <div
            className={`w-full ${
              secondPageData
                ? "max-w-[1260px] grid grid-cols-2"
                : "max-w-[540px] sm:max-w-[720px] md:max-w-[840px] lg:max-w-[960px] xl:max-w-[1040px] flex flex-col"
            } h-full sm:max-h-[84vh] rounded-2xl sm:rounded-[32px] border shadow-[0_20px_60px_rgba(0,0,0,0.09)] relative overflow-hidden transition-all ${paperBg} ${
              flipState === "flipping-next"
                ? "turn-next"
                : flipState === "flipping-prev"
                ? "turn-prev"
                : ""
            }`}
          >
            {loadingBook ? (
              <div className="flex-1 col-span-2 flex flex-col items-center justify-center gap-3 opacity-50">
                <div className="animate-spin w-6 h-6 border-2 border-current border-t-transparent rounded-full" />
                <span className="text-xs tracking-widest uppercase">লোড হচ্ছে...</span>
              </div>
            ) : !pageData ? (
              <div className="flex-1 col-span-2 flex flex-col items-center justify-center p-6 text-center space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-black/5 dark:bg-white/10 flex items-center justify-center">
                  <WifiOff size={22} className="opacity-70" />
                </div>
                <div className="space-y-1.5 max-w-sm">
                  <h3 className="text-sm sm:text-base font-bold">
                    {currentBook.titleBn}
                  </h3>
                  <p className="text-xs opacity-75 leading-relaxed">
                    {offlineNotice ||
                      "আপনি এখন অফলাইনে আছেন। এই বইটি অফলাইনে সেভ করা নেই। বইটি পড়তে বা অফলাইনে ডাউনলোড করতে ইন্টারনেট সংযোগ চালু করুন।"}
                  </p>
                </div>
                <div className="flex items-center gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={() => navigateOfflineSafe("/")}
                    className="px-4 py-2 rounded-full border border-current/20 text-xs font-bold cursor-pointer"
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
            ) : secondPageData ? (
              <>
                <div className="flex flex-col justify-between h-full overflow-hidden border-r border-current/10">
                  {renderPageContent(pageData, pageScrollRef)}
                </div>
                <div className="flex flex-col justify-between h-full overflow-hidden">
                  {renderPageContent(secondPageData, rightPageScrollRef)}
                </div>
              </>
            ) : (
              renderPageContent(pageData, pageScrollRef)
            )}
          </div>

          {/* Desktop Right Turn Button */}
          <button
            onClick={handleNext}
            disabled={currentPage >= totalPages}
            className="hidden sm:flex w-11 h-11 lg:w-12 lg:h-12 rounded-full bg-black/5 hover:bg-black/15 dark:bg-white/10 items-center justify-center ml-4 lg:ml-6 disabled:opacity-15 transition cursor-pointer shrink-0 shadow-xs"
            title="পরের পৃষ্ঠা"
          >
            <ChevronRight size={22} />
          </button>
        </div>
      </main>

      {/* Typography Popover */}
      {showFontPopover && (
        <div className="fixed bottom-18 app-popover-above-dock left-1/2 -translate-x-1/2 z-50 bg-[#1C1C1E] text-white rounded-2xl px-4 py-3 shadow-2xl flex items-center gap-3">
          <button
            onClick={() => changeFontSize(-1)}
            className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold cursor-pointer"
          >
            A-
          </button>
          <span className="font-mono text-xs">{fontSize}</span>
          <button
            onClick={() => changeFontSize(1)}
            className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-sm font-bold cursor-pointer"
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

      {/* Bookmark Popover — ONLY shows current book's bookmarks */}
      {showBookmarkPopover && (
        <div className="fixed bottom-18 app-popover-above-dock left-1/2 -translate-x-1/2 z-50 w-[92vw] max-w-sm bg-[#FAF9F6] text-[#141413] rounded-3xl p-4 shadow-[0_24px_70px_rgba(0,0,0,0.2)] border border-black/10">
          <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-black/8">
            <div className="min-w-0">
              <span className="text-xs font-extrabold flex items-center gap-1.5 text-[#141413]">
                <Bookmark size={14} /> বই {currentBook.bookNumber}-এর বুকমার্ক (
                {currentBookBookmarks.length})
              </span>
              <span className="text-[10px] opacity-55 block truncate mt-0.5">
                {currentBook.titleBn.replace(/^[০-৯1-9]+\.\s*/, "")}
              </span>
            </div>
            <button
              onClick={() => setShowBookmarkPopover(false)}
              className="w-7 h-7 rounded-full bg-black/5 hover:bg-black/10 flex items-center justify-center cursor-pointer shrink-0"
            >
              <X size={14} />
            </button>
          </div>

          <button
            onClick={async () => {
              const chTitle = currentBook.titleBn;
              await addBookmarkItem({
                chapterIndex,
                chapterTitle: chTitle,
                pageNumber: currentPage,
                pageOffset: pageScrollRef.current?.scrollTop || 0,
                mode: "flipbook",
                label: `বই ${currentBook.bookNumber}: ${chTitle.replace(/^[০-৯1-9]+\.\s*/, "")} • পৃষ্ঠা ${currentPage}`,
              });
              setBookmarkToast(true);
              setTimeout(() => setBookmarkToast(false), 2000);
            }}
            className="w-full bg-[#141413] text-white hover:opacity-90 font-bold text-xs py-2.5 px-3 rounded-full flex items-center justify-center gap-1.5 mb-3 transition cursor-pointer"
          >
            <Plus size={14} /> বই {currentBook.bookNumber} • পৃষ্ঠা {currentPage} বুকমার্ক করুন
          </button>

          {currentBookBookmarks.length === 0 ? (
            <p className="text-[11px] opacity-55 text-center py-4 bg-white rounded-2xl border border-black/6 px-3 leading-relaxed">
              এই বইয়ে এখনো কোনো বুকমার্ক নেই। উপরের বাটনে ক্লিক করে পৃষ্ঠা সেভ করুন।
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
                      onClick={() => {
                        goToPage(bm.pageNumber);
                        setShowBookmarkPopover(false);
                      }}
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
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-3 pt-2.5 border-t border-black/8 flex items-center justify-between text-[11px]">
            <Link
              href="/?bookmarks=1"
              onClick={(e) => {
                e.preventDefault();
                navigateOfflineSafe("/?bookmarks=1");
              }}
              className="text-[#141413]/75 hover:text-[#141413] underline underline-offset-2 font-bold"
            >
              সব বিষয়ের বুকমার্ক ({bookmarks.length})
            </Link>
            <Link
              href="/"
              onClick={(e) => {
                e.preventDefault();
                navigateOfflineSafe("/");
              }}
              className="text-[#141413]/75 hover:text-[#141413] flex items-center gap-1 font-bold"
            >
              <Home size={12} /> হোম
            </Link>
          </div>
        </div>
      )}

      {/* Bookmark Toast */}
      {bookmarkToast && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 bg-[#111111] text-white px-4 py-2 rounded-full shadow-xl flex items-center gap-1.5 text-xs font-medium">
          <Check size={14} /> বই {currentBook.bookNumber} • পৃষ্ঠা {currentPage} বুকমার্ক সেভ করা হয়েছে
        </div>
      )}

      {/* Bottom Floating Pill Dock */}
      <div className="fixed bottom-3.5 sm:bottom-5 app-bottom-dock inset-x-0 z-40 flex items-center justify-center px-2">
        <div className="flex items-center gap-1 sm:gap-2 max-w-full">
          {/* Home Circle Button */}
          <Link
            href="/"
            onClick={(e) => {
              e.preventDefault();
              navigateOfflineSafe("/");
            }}
            className="w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-[#111111] text-white shadow-xl flex items-center justify-center active:scale-95 transition cursor-pointer shrink-0"
            title="হোমে ফিরে যান"
          >
            <Home size={15} />
          </Link>

          {/* Pill 1: Page / TOC (Opens ক-বিভাগ, খ-বিভাগ, গ-বিভাগ সূচিপত্র) */}
          <button
            onClick={() => {
              setShowToc(true);
              setShowBookmarkPopover(false);
              setShowFontPopover(false);
            }}
            className="h-9 sm:h-11 px-3 sm:px-4 rounded-full bg-[#111111] text-white shadow-xl flex items-center gap-1 sm:gap-1.5 text-[11px] sm:text-xs font-medium cursor-pointer shrink-0"
            title="ক, খ ও গ বিভাগের সূচিপত্র"
          >
            <List size={14} className="opacity-80" />
            <span className="font-mono">
              {currentPage}/{totalPages}
            </span>
          </button>

          {/* Pill 2: Read | Flipbook Toggle */}
          <div className="h-9 sm:h-11 p-1 rounded-full bg-[#111111] text-white shadow-xl flex items-center shrink-0">
            <button
              onClick={() =>
                navigateOfflineSafe(
                  `/read?ch=${chapterIndex}&page=${currentPage}`
                )
              }
              className="h-7 sm:h-9 px-2.5 sm:px-4 rounded-full text-white/80 text-[11px] sm:text-xs font-medium flex items-center justify-center transition cursor-pointer"
            >
              Read
            </button>
            <span className="h-7 sm:h-9 px-2.5 sm:px-4 rounded-full bg-white text-black text-[11px] sm:text-xs font-bold flex items-center justify-center">
              Flipbook
            </span>
          </div>

          {/* Circle Icon 1: Theme */}
          <button
            onClick={cycleTheme}
            className="w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-[#111111] text-white shadow-xl flex items-center justify-center cursor-pointer shrink-0"
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
            className="w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-[#111111] text-white shadow-xl flex items-center justify-center cursor-pointer shrink-0"
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
            className={`w-9 h-9 sm:w-11 sm:h-11 rounded-full shadow-xl flex items-center justify-center cursor-pointer shrink-0 relative ${
              showBookmarkPopover || isCurrentPageBookmarked
                ? "bg-white text-black border border-black/15"
                : "bg-[#111111] text-white"
            }`}
            title="এই বইয়ের বুকমার্ক"
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

          {/* Circle Icon 4: Fullscreen (PC) */}
          <button
            onClick={toggleFullscreen}
            className="hidden sm:flex w-11 h-11 rounded-full bg-[#111111] text-white shadow-xl items-center justify-center cursor-pointer shrink-0"
            title="Fullscreen মোড"
          >
            {isFullscreen ? <Minimize size={15} /> : <Maximize size={15} />}
          </button>
        </div>
      </div>

      {/* Search Modal (Works Online & Offline) */}
      {showSearch && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-start justify-center p-4 pt-14"
          onClick={() => setShowSearch(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-white text-[#1C1C1E] rounded-3xl p-5 shadow-2xl max-h-[80vh] flex flex-col"
          >
            <div className="flex items-center gap-2 pb-3 border-b border-black/10">
              <Search size={16} className="opacity-40" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="প্রশ্ন বা টপিক সার্চ করুন..."
                autoFocus
                className="flex-1 text-sm outline-none bg-transparent"
              />
              <button
                onClick={() => setShowSearch(false)}
                className="opacity-50 p-1 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto pt-3 space-y-2">
              {searching && (
                <p className="text-xs opacity-50 text-center py-6">
                  খোঁজা হচ্ছে...
                </p>
              )}
              {!searching &&
                searchResults.map((res, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setShowSearch(false);
                      if (res.chapterIndex !== chapterIndex) {
                        setChapterIndex(res.chapterIndex);
                      }
                      setTimeout(() => goToPage(res.pageNumber), 120);
                    }}
                    className="w-full text-left p-3 rounded-2xl hover:bg-black/5 transition block cursor-pointer"
                  >
                    <div className="flex items-center justify-between text-xs font-bold mb-1">
                      <span className="truncate">{res.chapterTitleBn}</span>
                      <span className="font-mono opacity-60 shrink-0 ml-2">
                        পৃ. {res.pageNumber}
                      </span>
                    </div>
                    <p className="text-xs opacity-70 line-clamp-2">
                      {res.snippet}
                    </p>
                  </button>
                ))}
              {!searching &&
                searchQuery.trim().length >= 2 &&
                searchResults.length === 0 && (
                  <p className="text-xs opacity-50 text-center py-6">
                    কোনো ফলাফল পাওয়া যায়নি
                  </p>
                )}
            </div>
          </div>
        </div>
      )}

      {/* Responsive TOC Sheet — এই বইয়ের ক, খ ও গ বিভাগের সূচিপত্র */}
      {showToc && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-stretch sm:justify-end"
          onClick={() => setShowToc(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-md bg-[#FAF9F6] text-[#1C1C1E] max-h-[85dvh] sm:max-h-full sm:h-full rounded-t-3xl sm:rounded-none flex flex-col p-5 sm:p-6 overflow-hidden shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-2 pb-3 mb-3 border-b border-black/10 shrink-0">
              <div className="min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-wider opacity-55 block">
                  বই {currentBook.bookNumber} • কোর্স {currentBook.courseCode} • সূচিপত্র
                </span>
                <h3 className="font-extrabold text-sm sm:text-base truncate mt-0.5">
                  {currentBook.titleBn.replace(/^[০-৯1-9]+\.\s*/, "")}
                </h3>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => setShowBookSwitcher(!showBookSwitcher)}
                  className="text-[11px] font-bold px-2.5 py-1.5 rounded-full bg-black/6 hover:bg-black/10 transition cursor-pointer"
                >
                  {showBookSwitcher ? "সূচিপত্র দেখুন" : "অন্য বই ▾"}
                </button>
                <button
                  onClick={() => setShowToc(false)}
                  className="w-8 h-8 rounded-full bg-black/5 hover:bg-black/10 flex items-center justify-center cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {showBookSwitcher ? (
              /* Optional Switcher for the 7 Books */
              <div className="space-y-1.5 flex-1 overflow-y-auto pr-1">
                <p className="text-xs font-bold opacity-55 mb-2">
                  ৭টি বই থেকে যেকোনো বই নির্বাচন করুন:
                </p>
                {CHAPTERS.map((ch) => (
                  <button
                    key={ch.id}
                    onClick={() => {
                      setChapterIndex(ch.index);
                      setCurrentPage(1);
                      setShowBookSwitcher(false);
                    }}
                    className={`w-full text-left p-3.5 rounded-2xl transition flex items-center justify-between text-xs sm:text-sm cursor-pointer ${
                      chapterIndex === ch.index
                        ? "bg-[#141413] text-white"
                        : "hover:bg-black/5 text-[#141413]"
                    }`}
                  >
                    <div className="min-w-0 pr-2">
                      <span className="text-[10px] font-bold opacity-60 block">
                        বই {ch.bookNumber} • কোর্স {ch.courseCode}
                      </span>
                      <span className="font-bold truncate block">
                        {ch.titleBn.replace(/^[০-৯1-9]+\.\s*/, "")}
                      </span>
                    </div>
                    <span className="font-mono text-xs opacity-60 shrink-0 ml-2">
                      ১–{ch.endPage} পৃ.
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <>
                {/* Page Slider */}
                <div className="mb-3 shrink-0">
                  <div className="flex items-center justify-between text-[11px] opacity-60 mb-1">
                    <span>পৃষ্ঠা স্লাইডার:</span>
                    <span className="font-mono font-bold">
                      পৃষ্ঠা {currentPage} / {totalPages}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={totalPages}
                    value={currentPage}
                    onChange={(e) => goToPage(parseInt(e.target.value, 10))}
                    className="w-full accent-black cursor-pointer"
                  />
                </div>

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
                          const isExpanded =
                            expandedKaRange === grp.rangeLabel;
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
                              setShowToc(false);
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
                                  ক-বিভাগের বাকি প্রশ্নসমূহ (১১–{currentBook.questionCounts.kaBn.replace("টি", "")})
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
                              setShowToc(false);
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
                              setShowToc(false);
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
          </div>
        </div>
      )}

      {/* Dynamic Offline Download Progress Animation */}
      <OfflineDownloadModal
        isOpen={showOfflineDownloadAnim}
        isCompleted={offlineDownloadDone}
        bookNumber={currentBook.bookNumber}
        bookTitle={currentBook.titleBn}
        totalPages={currentBook.endPage - currentBook.startPage + 1}
        onComplete={() => {
          setShowOfflineDownloadAnim(false);
          setOfflineDownloadDone(false);
          if (offlinePendingNotice) {
            setOfflineNotice(offlinePendingNotice);
            setOfflinePendingNotice(null);
            setTimeout(() => setOfflineNotice(null), 3500);
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
                আপনি কি <span className="font-bold text-[#141413] dark:text-white">বই {currentBook.bookNumber}</span> ({currentBook.titleBn})-এর সংরক্ষিত অফলাইন ডেটা মুছে ফেলতে চান?
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

export default function FlipbookPage() {
  return (
    <Suspense
      fallback={
        <div className="h-dvh bg-[#FAF9F6] flex items-center justify-center">
          <div className="animate-spin w-6 h-6 border-2 border-black border-t-transparent rounded-full" />
        </div>
      }
    >
      <FlipbookInner />
    </Suspense>
  );
}
