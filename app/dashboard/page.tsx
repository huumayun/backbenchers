"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useAuth, LocalBookmark } from "@/lib/context/AuthContext";
import { CHAPTERS } from "@/lib/book/chapters";
import UnlockModal from "@/components/ui/UnlockModal";
import {
  BookOpen,
  Bookmark as BookmarkIcon,
  Trash2,
  Lock,
  Unlock,
  Layers,
  ChevronLeft,
  LogOut,
  Key,
  Home,
  Download,
  Check,
  Loader2,
  X,
} from "lucide-react";

export default function DashboardPage() {
  const {
    user,
    profile,
    isLoggedIn,
    hasAllSubjectsUnlocked,
    unlockedSubjects,
    isSubjectUnlocked,
    loading,
    bookmarks,
    removeBookmarkItem,
    progress,
    setShowUnlockModal,
    signOutUser,
    isBookSavedOffline,
    toggleOfflineBook,
    savingOfflineChapter,
  } = useAuth();

  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState<
    number | "all"
  >("all");
  const [offlineMsg, setOfflineMsg] = useState<string | null>(null);

  const handleToggleOfflineSubject = async (chapterIdx: number) => {
    setOfflineMsg(null);
    const res = await toggleOfflineBook(chapterIdx);
    setOfflineMsg(res.message);
  };

  if (loading) {
    return (
      <div className="min-h-dvh bg-[#FAF9F6] text-[#141413] flex items-center justify-center">
        <div className="animate-spin w-6 h-6 border-2 border-[#141413] border-t-transparent rounded-full" />
      </div>
    );
  }

  const lastChapter = CHAPTERS[progress.chapterIndex] || CHAPTERS[0];
  const lastPage = Math.min(
    Math.max(1, progress.pageNumber || 1),
    lastChapter.endPage
  );
  const lastOffset = progress.pageOffset || 0;

  // Group bookmarks subject-wise (by book 0..6)
  const subjectGroups = CHAPTERS.map((ch) => ({
    book: ch,
    items: bookmarks.filter((bm) => bm.chapterIndex === ch.index),
  })).filter((g) => g.items.length > 0);

  const visibleSubjectGroups =
    selectedSubjectFilter === "all"
      ? subjectGroups
      : subjectGroups.filter((g) => g.book.index === selectedSubjectFilter);

  const displayName =
    profile?.displayName ||
    user?.displayName ||
    (profile?.email || user?.email || "প্রিয় পাঠক").split("@")[0];
  const displayEmail = profile?.email || user?.email || "";

  return (
    <div className="min-h-dvh bg-[#FAF9F6] text-[#141413] pb-28 selection:bg-black selection:text-white">
      <UnlockModal />

      {/* Minimal Top Bar (Matching Home Page) */}
      <header className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between text-xs font-medium">
        <Link
          href="/"
          className="flex items-center gap-1 opacity-70 hover:opacity-100 transition py-1 font-semibold"
        >
          <ChevronLeft size={16} />
          <span>হোম</span>
        </Link>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowUnlockModal(true)}
            className="px-3.5 py-1.5 rounded-full bg-[#141413] text-white font-bold flex items-center gap-1.5 text-[11px] active:scale-95 transition cursor-pointer"
          >
            <Key size={11} />
            <span>Unlock ({unlockedSubjects.length}/৭)</span>
          </button>
          {isLoggedIn && (
            <button
              onClick={signOutUser}
              className="px-3 py-1.5 rounded-full bg-black/5 hover:bg-black/10 text-[#141413] font-semibold flex items-center gap-1 text-[11px] transition cursor-pointer"
            >
              <LogOut size={12} />
              <span>লগআউট</span>
            </button>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 pt-2 space-y-5">
        {/* Clean Editorial User Header */}
        <section className="bg-white rounded-3xl border border-black/8 p-5 sm:p-6 flex items-center justify-between flex-wrap gap-4 shadow-2xs">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-11 h-11 rounded-full bg-[#141413] text-white flex items-center justify-center font-serif font-bold text-base shrink-0">
              {displayName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-xl font-serif font-black tracking-tight truncate">
                {displayName}
              </h1>
              {displayEmail ? (
                <p className="text-xs opacity-55 truncate">{displayEmail}</p>
              ) : (
                <p className="text-xs opacity-55">লগইন করা নেই</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-bold bg-[#FAF9F6] border border-black/10 px-3 py-1.5 rounded-full">
              আনলকড: {unlockedSubjects.length}/৭টি বিষয়
            </span>
            {!hasAllSubjectsUnlocked && (
              <button
                onClick={() => setShowUnlockModal(true)}
                className="bg-[#141413] hover:opacity-90 text-white text-xs font-bold px-3.5 py-1.5 rounded-full transition cursor-pointer"
              >
                + বিষয় আনলক
              </button>
            )}
          </div>
        </section>

        {/* Last Read Compact Card */}
        <section className="bg-white rounded-3xl border border-black/8 p-5 shadow-2xs flex items-center justify-between flex-wrap gap-3">
          <div className="min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wider opacity-50 block">
              Last Read • বই {lastChapter.bookNumber} (পৃষ্ঠা {lastPage}/
              {lastChapter.endPage})
            </span>
            <h2 className="text-sm sm:text-base font-extrabold truncate mt-0.5">
              {lastChapter.titleBn.replace(/^[০-৯1-9]+\.\s*/, "")}
            </h2>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Link
              href={`/read?ch=${lastChapter.index}&page=${lastPage}&offset=${lastOffset}`}
              className="bg-[#141413] text-white text-xs font-bold px-4 py-2 rounded-full flex items-center gap-1.5 hover:opacity-90 transition"
            >
              <BookOpen size={13} />
              <span>Last Read</span>
            </Link>
            <Link
              href={`/flipbook?ch=${lastChapter.index}&page=${lastPage}`}
              className="bg-black/5 hover:bg-black/10 text-[#141413] text-xs font-bold px-3.5 py-2 rounded-full flex items-center gap-1.5 transition"
            >
              <Layers size={13} />
              <span>Flipbook</span>
            </Link>
          </div>
        </section>

        {/* 7 Subjects Access List */}
        <section className="bg-white rounded-3xl border border-black/8 p-5 shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs sm:text-sm font-extrabold tracking-tight">
              সকল বিষয় ({unlockedSubjects.length}/৭টি আনলকড)
            </h2>
            {!hasAllSubjectsUnlocked && (
              <button
                onClick={() => setShowUnlockModal(true)}
                className="text-[11px] font-bold underline underline-offset-2 opacity-70 hover:opacity-100 cursor-pointer"
              >
                আনলক কোড ব্যবহার করুন
              </button>
            )}
          </div>

          {offlineMsg && (
            <div className="bg-[#141413] text-white text-[11px] font-medium px-3.5 py-2 rounded-xl mb-3 flex items-center justify-between gap-2">
              <span>{offlineMsg}</span>
              <button
                onClick={() => setOfflineMsg(null)}
                className="opacity-60 hover:opacity-100 cursor-pointer"
              >
                <X size={12} />
              </button>
            </div>
          )}

          <div className="divide-y divide-black/6">
            {CHAPTERS.map((ch) => {
              const unlocked = isSubjectUnlocked(ch.id);
              const savedOffline = isBookSavedOffline(ch.index);
              const isSaving = savingOfflineChapter === ch.index;
              const cleanTitle = ch.titleBn.replace(/^[০-৯1-9]+\.\s*/, "");

              return (
                <div
                  key={ch.id}
                  className="py-2.5 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-[10px] font-mono font-bold bg-black/5 px-2 py-0.5 rounded text-[#141413]/70 shrink-0">
                      {ch.courseCode}
                    </span>
                    <span className="text-xs sm:text-sm font-bold truncate">
                      বই {ch.bookNumber}: {cleanTitle}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {unlocked ? (
                      <>
                        <button
                          onClick={() => handleToggleOfflineSubject(ch.index)}
                          disabled={isSaving}
                          className={`text-[10px] sm:text-[11px] font-bold px-2.5 py-1 rounded-full inline-flex items-center gap-1 transition cursor-pointer ${
                            savedOffline
                              ? "bg-emerald-500/15 text-emerald-800 border border-emerald-500/30"
                              : "bg-black/5 hover:bg-black/10 text-[#141413]"
                          }`}
                          title={
                            savedOffline
                              ? "অ্যাপে অফলাইনে সেভ করা আছে (সরানোর জন্য ক্লিক করুন)"
                              : "অ্যাপের ভেতরে অফলাইনে পড়ার জন্য সেভ করুন"
                          }
                        >
                          {isSaving ? (
                            <Loader2 size={10} className="animate-spin" />
                          ) : savedOffline ? (
                            <Check size={10} />
                          ) : (
                            <Download size={10} />
                          )}
                          <span>{savedOffline ? "অফলাইন" : "অফলাইনে সেভ"}</span>
                        </button>
                        <Link
                          href={`/read?ch=${ch.index}`}
                          className="text-[11px] font-bold bg-[#141413] text-white px-3 py-1 rounded-full hover:opacity-90 transition"
                        >
                          পড়ুন
                        </Link>
                      </>
                    ) : (
                      <button
                        onClick={() => setShowUnlockModal(true)}
                        className="text-[11px] font-bold bg-[#FAF9F6] hover:bg-black/5 border border-black/10 text-[#141413] px-3 py-1 rounded-full inline-flex items-center gap-1 transition cursor-pointer"
                      >
                        <Lock size={10} /> আনলক
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Saved Bookmarks */}
        <section className="bg-white rounded-3xl border border-black/8 p-5 shadow-2xs">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <h2 className="text-xs sm:text-sm font-extrabold flex items-center gap-1.5">
              <BookmarkIcon size={14} /> বুকমার্ক ({bookmarks.length})
            </h2>

            {subjectGroups.length > 1 && (
              <div className="flex items-center gap-1 flex-wrap">
                <button
                  onClick={() => setSelectedSubjectFilter("all")}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition cursor-pointer ${
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
                    className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition cursor-pointer ${
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
          </div>

          {bookmarks.length === 0 ? (
            <p className="text-xs opacity-50 text-center py-6 bg-[#FAF9F6] rounded-2xl border border-black/6">
              এখনো কোনো বুকমার্ক সেভ করা হয়নি।
            </p>
          ) : (
            <div className="space-y-2">
              {visibleSubjectGroups.map((grp) =>
                grp.items.map((bm: LocalBookmark) => (
                  <div
                    key={bm.id}
                    className="flex items-center justify-between gap-2 px-3.5 py-2.5 bg-[#FAF9F6] rounded-2xl border border-black/6"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold truncate">{bm.label}</p>
                      <p className="text-[10px] opacity-55">
                        বই {grp.book.bookNumber} • পৃষ্ঠা {bm.pageNumber}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Link
                        href={`/read?ch=${bm.chapterIndex}&page=${
                          bm.pageNumber
                        }&offset=${bm.pageOffset || 0}`}
                        className="text-[11px] bg-[#141413] text-white font-bold px-3 py-1 rounded-full hover:opacity-90 transition"
                      >
                        পড়ুন
                      </Link>
                      <button
                        onClick={() => removeBookmarkItem(bm.id)}
                        className="p-1.5 text-black/45 hover:text-red-600 rounded-full transition cursor-pointer"
                        title="মুছে ফেলুন"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </section>
      </main>

      {/* Bottom Floating Pill Dock (Matching Home Page) */}
      <div className="fixed bottom-4 sm:bottom-6 app-bottom-dock inset-x-0 z-30 flex justify-center px-3 pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-2 sm:gap-2.5">
          <Link
            href="/"
            className="h-10 sm:h-11 px-4 rounded-full bg-white text-[#141413] border border-black/10 font-bold text-xs shadow-lg flex items-center gap-1.5 active:scale-95 transition"
          >
            <Home size={14} />
            <span>হোম</span>
          </Link>
          <Link
            href={`/read?ch=${lastChapter.index}&page=${lastPage}&offset=${lastOffset}`}
            className="h-10 sm:h-11 px-5 rounded-full bg-[#141413] text-white font-bold text-xs shadow-lg flex items-center gap-1.5 active:scale-95 transition"
          >
            <BookOpen size={14} />
            <span>Last Read</span>
          </Link>
          <Link
            href={`/flipbook?ch=${lastChapter.index}&page=${lastPage}`}
            className="h-10 sm:h-11 px-4 rounded-full bg-white text-[#141413] border border-black/10 font-bold text-xs shadow-lg flex items-center gap-1.5 active:scale-95 transition"
          >
            <Layers size={14} />
            <span>Flipbook</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

