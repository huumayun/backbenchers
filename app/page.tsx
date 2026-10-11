"use client";

import React, { useRef, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth, LocalBookmark } from "@/lib/context/AuthContext";
import { CHAPTERS, BOOK_INFO } from "@/lib/book/chapters";
import UnlockModal from "@/components/ui/UnlockModal";
import {
  Lock,
  Unlock,
  Key,
  BookOpen,
  Layers,
  Download,
  User,
  ChevronLeft,
  ChevronRight,
  Bookmark,
  Trash2,
  X,
  Check,
  WifiOff,
  Loader2,
  ShieldCheck,
} from "lucide-react";

const COVER_PALETTES = [
  { bg: "bg-[#1B4332]", text: "text-[#F8F9FA]", accent: "bg-[#D4AF37] text-black" },
  { bg: "bg-[#E63946]", text: "text-white", accent: "bg-black text-white" },
  { bg: "bg-[#FFB703]", text: "text-[#111111]", accent: "bg-[#111111] text-white" },
  { bg: "bg-[#1D3557]", text: "text-white", accent: "bg-[#A8DADC] text-[#1D3557]" },
  { bg: "bg-[#264653]", text: "text-white", accent: "bg-[#E9C46A] text-black" },
  { bg: "bg-[#2B2D42]", text: "text-white", accent: "bg-[#EF233C] text-white" },
  { bg: "bg-[#3A5A40]", text: "text-white", accent: "bg-[#DAD7CD] text-black" },
];

export default function HomePage() {
  const {
    hasAllSubjectsUnlocked,
    unlockedSubjects,
    isSubjectUnlocked,
    setShowUnlockModal,
    deviceId,
    sessionToken,
    isLoggedIn,
    profile,
    bookmarks,
    removeBookmarkItem,
    progress,
    perBookProgress,
    offlineBookIndices,
    savingOfflineChapter,
    isBookSavedOffline,
    toggleOfflineBook,
  } = useAuth();

  const router = useRouter();
  const [showBookmarksModal, setShowBookmarksModal] = useState(false);
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState<number | "all">("all");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("bookmarks") === "1") {
        setShowBookmarksModal(true);
      }
      try {
        router.prefetch("/read");
        router.prefetch("/flipbook");
        router.prefetch("/dashboard");
      } catch {
        // ignore prefetch errors when offline
      }
    }
  }, [router]);

  const shelfOneRef = useRef<HTMLDivElement>(null);
  const shelfTwoRef = useRef<HTMLDivElement>(null);

  const shelfOne = CHAPTERS.slice(0, 4);
  const shelfTwo = CHAPTERS.slice(4, 7);

  const scrollShelf = (
    ref: React.RefObject<HTMLDivElement | null>,
    dir: "left" | "right"
  ) => {
    if (!ref.current) return;
    ref.current.scrollBy({
      left: dir === "left" ? -220 : 220,
      behavior: "smooth",
    });
  };

  // Last reading book & exact URL where user left off
  const lastReadBook = CHAPTERS[progress.chapterIndex] || CHAPTERS[0];
  const lastReadPage = Math.min(
    Math.max(1, progress.pageNumber || 1),
    lastReadBook.endPage
  );
  const lastReadOffset = progress.pageOffset || 0;
  const lastReadMode = progress.mode === "flipbook" ? "flipbook" : "read";
  const continueReadHref =
    lastReadMode === "flipbook"
      ? `/flipbook?ch=${lastReadBook.index}&page=${lastReadPage}`
      : `/read?ch=${lastReadBook.index}&page=${lastReadPage}&offset=${lastReadOffset}`;

  // Group bookmarks subject-wise (by book 0..6)
  const subjectGroups = CHAPTERS.map((ch) => ({
    book: ch,
    items: bookmarks.filter((bm) => bm.chapterIndex === ch.index),
  })).filter((g) => g.items.length > 0);

  const visibleSubjectGroups =
    selectedSubjectFilter === "all"
      ? subjectGroups
      : subjectGroups.filter((g) => g.book.index === selectedSubjectFilter);

  return (
    <div className="min-h-dvh bg-[#FAF9F6] text-[#141413] pb-28 overflow-x-hidden selection:bg-black selection:text-white">
      <UnlockModal />

      {/* Hide native scrollbar on shelves */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .no-scrollbar::-webkit-scrollbar { display: none; }
            .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
          `,
        }}
      />

      {/* Minimal Top Bar */}
      <header className="max-w-4xl lg:max-w-5xl xl:max-w-6xl mx-auto px-4 sm:px-8 h-14 flex items-center justify-between gap-2.5 text-xs font-medium">
        <a
          href="/Backbencher.apk"
          download="Backbencher.apk"
          className="px-3 py-1.5 rounded-full bg-black/[0.05] hover:bg-black/10 text-[#141413] font-bold flex items-center gap-1.5 text-[11px] active:scale-95 transition cursor-pointer border border-black/10"
          title="অফলাইনে সাজেশন পড়তে Backbencher Android App ডাউনলোড করুন"
        >
          <Download size={12} />
          <span>অ্যাপ ডাউনলোড (.APK)</span>
        </a>

        <div className="flex items-center gap-2.5">
          {isLoggedIn ? (
            <>
              <button
                onClick={() => setShowUnlockModal(true)}
                className="px-3.5 py-1.5 rounded-full bg-[#111111] text-white font-bold flex items-center gap-1.5 text-[11px] active:scale-95 transition cursor-pointer shadow-xs"
              >
                <Key size={11} />
                <span>Unlock ({unlockedSubjects.length}/৭)</span>
              </button>
              <Link
                href="/dashboard"
                className="opacity-75 hover:opacity-100 transition flex items-center gap-1 py-1 font-semibold"
              >
                <User size={14} />
                <span>{profile?.displayName || "ড্যাশবোর্ড"}</span>
              </Link>
            </>
          ) : (
            <Link
              href="/login"
              className="opacity-75 hover:opacity-100 transition flex items-center gap-1 py-1 font-semibold"
            >
              <User size={14} />
              <span>লগইন / রেজিস্টার</span>
            </Link>
          )}
        </div>
      </header>

      {/* Editorial Hero Title */}
      <section className="max-w-3xl mx-auto px-4 pt-2 pb-6 sm:pb-8 text-center">
        <p className="text-[11px] sm:text-xs font-medium opacity-55 tracking-wide mb-1">
          {BOOK_INFO.university}
        </p>
        <h1 className="text-2xl sm:text-5xl font-serif font-black tracking-tight text-[#111111] leading-tight">
          {BOOK_INFO.title}
        </h1>
        <p className="text-[11px] sm:text-xs opacity-65 font-semibold mt-1.5 max-w-xs sm:max-w-md mx-auto leading-relaxed">
          বোটানি অনার্স ৩য় বর্ষ • ৭টি আলাদা বই (প্রতি বিষয় ৳৪৯ • ফ্রি প্রিভিউ উন্মুক্ত)
        </p>
        <p className="text-[11px] sm:text-[13px] text-[#141413]/75 mt-3 max-w-2xl mx-auto leading-relaxed bg-black/[0.03] border border-black/8 rounded-2xl px-4 py-3">
          প্রত্যেকটি বিষয়ের জন্য <strong>ক-বিভাগে ৫০টি</strong>, <strong>খ-বিভাগে ১৫–১৮টি</strong> এবং <strong>গ-বিভাগে ১৫–১৭টি</strong> করে প্রশ্ন ও প্রত্যেক সাজেশনের উত্তর দেওয়া আছে। এগুলো সব ব্যাকবেঞ্চারদের জন্য—যারা সারা বছর পড়েনি তাদের কথা মাথায় রেখে বানানো হয়েছে। যদি কেউ <strong>CGPA 3.50</strong>-এর উপরে তুলতে চাও, তাদের এই সাজেশনের পাশাপাশি বাকি সকল বিষয় পড়ার জন্য অনুরোধ করা হলো; কারণ এই বই থেকে <strong>৬০–৭০% কমন</strong> আসবে, ১০০% না—তাই এটি শুধুমাত্র ব্যাকবেঞ্চারদের সাজেশন।
        </p>
      </section>

      {/* Main Content */}
      <main className="max-w-4xl lg:max-w-5xl xl:max-w-6xl mx-auto px-3 sm:px-8 space-y-9 sm:space-y-12">

        {/* Shelf 1: Books 1–4 */}
        <div>
          <div className="flex items-center justify-between px-2 mb-2.5">
            <h2 className="text-xs sm:text-sm font-bold tracking-tight">
              Core Botany Books (২৩৩০০১ – ২৩৩০০৭)
            </h2>
            <div className="flex items-center gap-1.5 text-xs opacity-50">
              <span className="font-mono text-[11px]">4 books</span>
              <button
                onClick={() => scrollShelf(shelfOneRef, "left")}
                className="p-1 hover:opacity-100 cursor-pointer"
                aria-label="Scroll left"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                onClick={() => scrollShelf(shelfOneRef, "right")}
                className="p-1 hover:opacity-100 cursor-pointer"
                aria-label="Scroll right"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>

          <div className="relative pt-1 pb-3.5 sm:pb-5">
            <div
              ref={shelfOneRef}
              className="flex sm:grid sm:grid-cols-4 gap-3 sm:gap-5 overflow-x-auto no-scrollbar snap-x snap-mandatory px-3 sm:px-5 relative z-10"
            >
              {shelfOne.map((ch, idx) => {
                const palette = COVER_PALETTES[idx % COVER_PALETTES.length];
                const savedForBook = perBookProgress?.[String(ch.index)];
                const targetPage = savedForBook?.pageNumber || 1;
                const targetOffset = savedForBook?.pageOffset || 0;
                const bookUnlocked = isSubjectUnlocked(ch.id);
                const bookOffline = isBookSavedOffline(ch.index);

                return (
                  <Link
                    key={ch.id}
                    href={`/read?ch=${ch.index}&page=${targetPage}&offset=${targetOffset}`}
                    className={`snap-start shrink-0 w-[128px] sm:w-auto aspect-[3/4.2] rounded-xl p-3 sm:p-4 flex flex-col justify-between shadow-md active:scale-95 sm:hover:-translate-y-1.5 transition-all duration-300 ${palette.bg} ${palette.text}`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span
                        className={`text-[9px] sm:text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${palette.accent}`}
                      >
                        {ch.courseCode}
                      </span>
                      {bookOffline ? (
                        <span className="inline-flex items-center gap-0.5 text-[8px] sm:text-[9px] font-extrabold bg-emerald-400 text-black px-1.5 py-0.5 rounded-full shadow-xs">
                          <Check size={9} /> অফলাইন
                        </span>
                      ) : bookUnlocked ? (
                        <span className="inline-flex items-center gap-0.5 text-[8px] sm:text-[9px] font-extrabold bg-emerald-400 text-black px-1.5 py-0.5 rounded-full shadow-xs">
                          <Unlock size={9} /> Unlocked
                        </span>
                      ) : (
                        <Lock size={11} className="opacity-75" />
                      )}
                    </div>

                    <div className="my-auto py-1">
                      <p className="text-[9px] uppercase tracking-wider opacity-70 mb-0.5 font-semibold">
                        বই {ch.bookNumber}
                      </p>
                      <h3 className="font-extrabold text-xs sm:text-sm leading-snug line-clamp-3">
                        {ch.titleBn}
                      </h3>
                    </div>

                    <div className="text-[9px] sm:text-[10px] opacity-80 flex items-center justify-between border-t border-current/15 pt-1.5">
                      <span>মোট {ch.endPage} পৃষ্ঠা</span>
                      <span>{bookOffline ? "অফলাইন →" : bookUnlocked ? "আনলকড →" : "পড়ুন →"}</span>
                    </div>
                  </Link>
                );
              })}
            </div>

            {/* Frosted Amber Glass Shelf Bar */}
            <div className="absolute bottom-0 inset-x-1 sm:inset-x-0 h-11 sm:h-14 rounded-xl sm:rounded-2xl bg-amber-400/40 backdrop-blur-md border border-amber-500/30 shadow-xs z-20 pointer-events-none flex items-center justify-between px-3 sm:px-4">
              <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-neutral-500/70 border border-white/60 shadow-inner" />
              <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-neutral-500/70 border border-white/60 shadow-inner" />
            </div>
          </div>
        </div>

        {/* Shelf 2: Books 5–7 + In-App Offline Vault */}
        <div>
          <div className="flex items-center justify-between px-2 mb-2.5">
            <h2 className="text-xs sm:text-sm font-bold tracking-tight">
              Pathology, Cytology & Genetics Books (২৩৩০০৯ – ২৩৩০১৩)
            </h2>
            <div className="flex items-center gap-1.5 text-xs opacity-50">
              <span className="font-mono text-[11px]">3 books</span>
              <button
                onClick={() => scrollShelf(shelfTwoRef, "left")}
                className="p-1 hover:opacity-100 cursor-pointer"
                aria-label="Scroll left"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                onClick={() => scrollShelf(shelfTwoRef, "right")}
                className="p-1 hover:opacity-100 cursor-pointer"
                aria-label="Scroll right"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>

          <div className="relative pt-1 pb-3.5 sm:pb-5">
            <div
              ref={shelfTwoRef}
              className="flex sm:grid sm:grid-cols-4 gap-3 sm:gap-5 overflow-x-auto no-scrollbar snap-x snap-mandatory px-3 sm:px-5 relative z-10"
            >
              {shelfTwo.map((ch, idx) => {
                const palette = COVER_PALETTES[(idx + 4) % COVER_PALETTES.length];
                const savedForBook = perBookProgress?.[String(ch.index)];
                const targetPage = savedForBook?.pageNumber || 1;
                const targetOffset = savedForBook?.pageOffset || 0;
                const bookUnlocked = isSubjectUnlocked(ch.id);
                const bookOffline = isBookSavedOffline(ch.index);

                return (
                  <Link
                    key={ch.id}
                    href={`/read?ch=${ch.index}&page=${targetPage}&offset=${targetOffset}`}
                    className={`snap-start shrink-0 w-[128px] sm:w-auto aspect-[3/4.2] rounded-xl p-3 sm:p-4 flex flex-col justify-between shadow-md active:scale-95 sm:hover:-translate-y-1.5 transition-all duration-300 ${palette.bg} ${palette.text}`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span
                        className={`text-[9px] sm:text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${palette.accent}`}
                      >
                        {ch.courseCode}
                      </span>
                      {bookOffline ? (
                        <span className="inline-flex items-center gap-0.5 text-[8px] sm:text-[9px] font-extrabold bg-emerald-400 text-black px-1.5 py-0.5 rounded-full shadow-xs">
                          <Check size={9} /> অফলাইন
                        </span>
                      ) : bookUnlocked ? (
                        <span className="inline-flex items-center gap-0.5 text-[8px] sm:text-[9px] font-extrabold bg-emerald-400 text-black px-1.5 py-0.5 rounded-full shadow-xs">
                          <Unlock size={9} /> Unlocked
                        </span>
                      ) : (
                        <Lock size={11} className="opacity-75" />
                      )}
                    </div>

                    <div className="my-auto py-1">
                      <p className="text-[9px] uppercase tracking-wider opacity-70 mb-0.5 font-semibold">
                        বই {ch.bookNumber}
                      </p>
                      <h3 className="font-extrabold text-xs sm:text-sm leading-snug line-clamp-3">
                        {ch.titleBn}
                      </h3>
                    </div>

                    <div className="text-[9px] sm:text-[10px] opacity-80 flex items-center justify-between border-t border-current/15 pt-1.5">
                      <span>মোট {ch.endPage} পৃষ্ঠা</span>
                      <span>{bookOffline ? "অফলাইন →" : bookUnlocked ? "আনলকড →" : "পড়ুন →"}</span>
                    </div>
                  </Link>
                );
              })}
            </div>

            {/* Frosted Blue Glass Shelf Bar */}
            <div className="absolute bottom-0 inset-x-1 sm:inset-x-0 h-11 sm:h-14 rounded-xl sm:rounded-2xl bg-sky-400/40 backdrop-blur-md border border-sky-500/30 shadow-xs z-20 pointer-events-none flex items-center justify-between px-3 sm:px-4">
              <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-neutral-500/70 border border-white/60 shadow-inner" />
              <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-neutral-500/70 border border-white/60 shadow-inner" />
            </div>
          </div>
        </div>

        {/* Official Backbencher Android App Download Banner */}
        <section className="px-1 sm:px-0 pt-1">
          <div className="rounded-3xl bg-[#141413] text-[#FAF9F6] p-5 sm:p-7 shadow-[0_20px_50px_rgba(0,0,0,0.12)] border border-black/15 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
            <div className="flex items-start gap-4 min-w-0">
              <div className="w-13 h-13 sm:w-15 sm:h-15 rounded-2xl bg-black border border-white/15 flex items-center justify-center shrink-0 shadow-lg overflow-hidden">
                <span className="font-serif font-black text-2xl sm:text-3xl text-white tracking-tight select-none">
                  B
                </span>
              </div>
              <div className="min-w-0">
                <div className="inline-flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-wider bg-white/10 text-emerald-300 px-2.5 py-0.5 rounded-full mb-1.5">
                  <ShieldCheck size={11} />
                  <span>Official Android App • Offline Edition</span>
                </div>
                <h2 className="font-serif font-black text-base sm:text-xl text-white leading-snug">
                  অফলাইনে সাজেশন রাখতে ও সেরা রিডিং এক্সপেরিয়েন্স পেতে অ্যাপ ডাউনলোড করুন
                </h2>
                <p className="text-xs sm:text-[13px] text-white/75 mt-1.5 leading-relaxed max-w-2xl">
                  অফলাইনে সাজেশন বই সেভ করে ইন্টারনেট ছাড়াই যেকোনো সময় পড়তে এবং ফুল-স্ক্রিন ফ্লিপবুক, ডার্ক/সেপিয়া মোড ও দ্রুত সার্চের সুন্দর এক্সপেরিয়েন্স পেতে আমাদের অফিসিয়াল <strong>Backbencher</strong> Android অ্যাপটি ইনস্টল করুন।
                </p>
              </div>
            </div>

            <div className="w-full sm:w-auto shrink-0 flex flex-col items-stretch sm:items-end gap-1.5">
              <a
                href="/Backbencher.apk"
                download="Backbencher.apk"
                className="w-full sm:w-auto px-5 py-3 rounded-full bg-white text-[#141413] hover:bg-neutral-100 font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg active:scale-95 transition cursor-pointer"
              >
                <Download size={15} />
                <span>অ্যাপ ডাউনলোড করুন (.APK)</span>
              </a>
              <span className="text-[10px] text-white/50 text-center sm:text-right font-mono">
                Android 7.0+ • Safe &amp; Encrypted Offline Vault
              </span>
            </div>
          </div>
        </section>
      </main>

      {/* Subject-Wise Bookmarks Modal on Home Screen */}
      {showBookmarksModal && (
        <div
          className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-center justify-center p-3.5 sm:p-4"
          onClick={() => setShowBookmarksModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-[#FAF9F6] text-[#141413] w-full max-w-md max-h-[82dvh] rounded-3xl shadow-[0_24px_70px_rgba(0,0,0,0.18)] border border-black/10 p-5 sm:p-6 flex flex-col overflow-hidden"
          >
            {/* Minimal Editorial Header */}
            <div className="flex items-center justify-between pb-3.5 mb-3.5 border-b border-black/8 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-[#141413] text-white flex items-center justify-center shrink-0">
                  <Bookmark size={14} />
                </div>
                <div>
                  <h3 className="font-serif font-black text-base sm:text-lg tracking-tight leading-none">
                    সংরক্ষিত বুকমার্ক
                  </h3>
                  <p className="text-[11px] opacity-55 mt-1">
                    মোট {bookmarks.length}টি প্রশ্ন ও পৃষ্ঠা সেভ করা আছে
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowBookmarksModal(false)}
                className="w-8 h-8 rounded-full bg-black/5 hover:bg-black/10 flex items-center justify-center transition cursor-pointer shrink-0"
              >
                <X size={15} />
              </button>
            </div>

            {/* Subject Filter Pills */}
            {subjectGroups.length > 1 && (
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-3 mb-1 shrink-0">
                <button
                  onClick={() => setSelectedSubjectFilter("all")}
                  className={`px-3 py-1 rounded-full text-[11px] font-bold shrink-0 transition cursor-pointer ${
                    selectedSubjectFilter === "all"
                      ? "bg-[#141413] text-white"
                      : "bg-black/5 text-[#141413]/70 hover:bg-black/10"
                  }`}
                >
                  সব ({bookmarks.length})
                </button>
                {subjectGroups.map((grp) => (
                  <button
                    key={grp.book.id}
                    onClick={() => setSelectedSubjectFilter(grp.book.index)}
                    className={`px-3 py-1 rounded-full text-[11px] font-bold shrink-0 transition cursor-pointer ${
                      selectedSubjectFilter === grp.book.index
                        ? "bg-[#141413] text-white"
                        : "bg-black/5 text-[#141413]/70 hover:bg-black/10"
                    }`}
                  >
                    বই {grp.book.bookNumber} ({grp.items.length})
                  </button>
                ))}
              </div>
            )}

            {bookmarks.length === 0 ? (
              <div className="text-center py-10 bg-white rounded-2xl border border-black/8 px-5 my-1">
                <div className="w-10 h-10 rounded-full bg-black/5 flex items-center justify-center mx-auto mb-2.5">
                  <Bookmark size={18} className="opacity-40" />
                </div>
                <p className="text-xs font-bold text-[#141413]">
                  এখনো কোনো বুকমার্ক নেই
                </p>
                <p className="text-[11px] opacity-55 mt-1 leading-relaxed">
                  বই পড়ার সময় নিচের বারের বুকমার্ক আইকনে ক্লিক করে যেকোনো প্রশ্ন বা পৃষ্ঠা সেভ করে রাখুন।
                </p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto no-scrollbar space-y-4">
                {visibleSubjectGroups.map((grp) => (
                  <div key={grp.book.id} className="space-y-1.5">
                    {/* Compact Subject Divider */}
                    <div className="flex items-center justify-between px-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[10px] font-mono font-bold bg-[#141413] text-white px-2 py-0.5 rounded-full shrink-0">
                          {grp.book.courseCode}
                        </span>
                        <h4 className="text-xs font-extrabold truncate text-[#141413]">
                          বই {grp.book.bookNumber}:{" "}
                          {grp.book.titleBn.replace(/^[০-৯1-9]+\.\s*/, "")}
                        </h4>
                      </div>
                      <span className="text-[10px] font-bold opacity-45 shrink-0">
                        {grp.items.length}টি
                      </span>
                    </div>

                    {/* Clean Bookmark Cards */}
                    <div className="bg-white rounded-2xl border border-black/8 divide-y divide-black/6 overflow-hidden shadow-2xs">
                      {grp.items.map((bm: LocalBookmark) => {
                        const cleanLabel = bm.label
                          .replace(/\s*\(পৃ\.\s*\d+\)\s*$/, "")
                          .replace(
                            new RegExp(
                              `^বই\\s*${grp.book.bookNumber}:[^•]+•\\s*`
                            ),
                            ""
                          );
                        const targetHref =
                          bm.mode === "flipbook"
                            ? `/flipbook?ch=${bm.chapterIndex}&page=${bm.pageNumber}`
                            : `/read?ch=${bm.chapterIndex}&page=${
                                bm.pageNumber
                              }&offset=${bm.pageOffset || 0}`;

                        return (
                          <div
                            key={bm.id}
                            className="flex items-center justify-between gap-2.5 px-3.5 py-2.5 hover:bg-[#FAF9F6] transition"
                          >
                            <Link
                              href={targetHref}
                              onClick={() => setShowBookmarksModal(false)}
                              className="flex items-center gap-2.5 min-w-0 flex-1"
                            >
                              <span className="text-[10px] font-mono font-bold bg-black/6 text-[#141413] px-2 py-1 rounded-lg shrink-0">
                                পৃ. {bm.pageNumber}
                              </span>
                              <span className="text-xs font-bold text-[#141413] truncate">
                                {cleanLabel}
                              </span>
                            </Link>

                            <div className="flex items-center gap-1 shrink-0">
                              <Link
                                href={targetHref}
                                onClick={() => setShowBookmarksModal(false)}
                                className="text-[11px] bg-[#141413] text-white font-bold px-3 py-1 rounded-full hover:opacity-90 transition"
                              >
                                পড়ুন
                              </Link>
                              <button
                                onClick={() => removeBookmarkItem(bm.id)}
                                className="w-7 h-7 flex items-center justify-center text-black/35 hover:text-red-600 hover:bg-red-500/8 rounded-full transition cursor-pointer"
                                title="মুছে ফেলুন"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Soft Bottom Fade Blur */}
      <div className="fixed bottom-0 inset-x-0 h-24 bg-gradient-to-t from-[#FAF9F6] via-[#FAF9F6]/90 to-transparent pointer-events-none z-30" />

      {/* Bottom Floating Pill CTA */}
      <div className="fixed bottom-4 sm:bottom-6 app-bottom-dock inset-x-0 z-40 flex items-center justify-center gap-2 px-4">
        <Link
          href={continueReadHref}
          className="h-11 sm:h-12 px-5 sm:px-7 rounded-full bg-[#111111] text-white font-bold text-xs sm:text-sm shadow-2xl flex items-center gap-2 active:scale-95 transition"
        >
          <BookOpen size={15} />
          <span>Last Read</span>
        </Link>
        <Link
          href={`/flipbook?ch=${lastReadBook.index}&page=${lastReadPage}`}
          className="h-11 sm:h-12 px-3.5 sm:px-5 rounded-full bg-white text-[#111111] border border-black/15 font-bold text-xs sm:text-sm shadow-xl flex items-center gap-1.5 active:scale-95 transition"
        >
          <Layers size={15} /> Flipbook
        </Link>
        <button
          onClick={() => setShowBookmarksModal(true)}
          className="h-11 sm:h-12 px-3.5 sm:px-5 rounded-full bg-white text-[#111111] border border-black/15 font-bold text-xs sm:text-sm shadow-xl flex items-center gap-1.5 active:scale-95 transition cursor-pointer relative"
          title="বিষয়ভিত্তিক সংরক্ষিত বুকমার্ক"
        >
          <Bookmark size={15} />
          <span className="hidden sm:inline">বুকমার্ক</span>
          {bookmarks.length > 0 && (
            <span className="w-4 h-4 rounded-full bg-[#111111] text-white text-[10px] font-bold flex items-center justify-center">
              {bookmarks.length}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
