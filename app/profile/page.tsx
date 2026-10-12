"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth, LocalBookmark } from "@/lib/context/AuthContext";
import { CHAPTERS } from "@/lib/book/chapters";
import { getReadingStats, ReadingStats } from "@/lib/readingStats";
import {
  ChevronLeft,
  GraduationCap,
  Bookmark,
  KeyRound,
  ShieldCheck,
  LogOut,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Download,
  Check,
  Loader2,
  Trash2,
  ChevronRight,
} from "lucide-react";

export default function ProfilePage() {
  const router = useRouter();
  const {
    user,
    profile,
    isLoggedIn,
    loading: authLoading,
    signOutUser,
    unlockedSubjects,
    isSubjectUnlocked,
    bookmarks,
    removeBookmarkItem,
    settings,
    signIn,
    signUp,
    isBookSavedOffline,
    toggleOfflineBook,
    savingOfflineChapter,
  } = useAuth();

  const [stats, setStats] = useState<ReadingStats>({
    totalMinutes: 0,
    dailyAvgMinutes: 0,
    level: 1,
    expPercent: 0,
    streakDays: 0,
  });

  // Auth Form State when unauthenticated
  const [authTab, setAuthTab] = useState<"login" | "register">("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authName, setAuthName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // In-page expandable sections
  const [showBookmarksList, setShowBookmarksList] = useState(false);
  const [showOfflineList, setShowOfflineList] = useState(false);
  const [offlineActionMsg, setOfflineActionMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isLoggedIn) {
      setStats(getReadingStats());
    }
  }, [isLoggedIn]);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormSubmitting(true);
    setFormError(null);
    try {
      if (authTab === "login") {
        const res = await signIn(authEmail, authPassword);
        if (!res.success) {
          setFormError(res.message || "Invalid email or password.");
        }
      } else {
        const res = await signUp(authName, authEmail, authPassword);
        if (!res.success) {
          setFormError(res.message || "Registration failed. Please try again.");
        }
      }
    } catch (err: unknown) {
      const e = err as { message?: string };
      setFormError(e?.message || "An unexpected error occurred. Please try again.");
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleToggleOffline = async (chapterIdx: number) => {
    setOfflineActionMsg(null);
    const res = await toggleOfflineBook(chapterIdx);
    setOfflineActionMsg(res.message);
  };

  if (authLoading) {
    return (
      <div suppressHydrationWarning className="min-h-dvh bg-[#FAF9F6] text-[#141413] flex items-center justify-center">
        <div suppressHydrationWarning className="animate-spin w-6 h-6 border-2 border-[#141413] border-t-transparent rounded-full" />
      </div>
    );
  }

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const displayName =
    profile?.displayName ||
    user?.displayName ||
    (user?.email ? user.email.split("@")[0] : "Backbencher Reader");
  const email = profile?.email || user?.email || "";
  const isAdmin = profile?.role === "admin";
  const unlockedCount = unlockedSubjects.length;
  const savedOfflineCount = CHAPTERS.filter((ch) => isBookSavedOffline(ch.index)).length;

  const isOffer = mounted && Boolean(settings?.isOfferActive === true);
  const regularPrice = settings?.regularPrice || 49;
  const offerPrice = settings?.offerPrice || 39;

  return (
    <div suppressHydrationWarning className="min-h-dvh bg-[#FAF9F6] text-[#141413] pb-24 selection:bg-black selection:text-white">
      {/* Top Navigation Bar */}
      <header className="max-w-md mx-auto px-4 h-14 flex items-center justify-between text-xs font-medium">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-zinc-600 hover:text-black transition py-1 font-semibold"
        >
          <ChevronLeft size={16} />
          <span>Home</span>
        </Link>

        {isLoggedIn ? (
          <Link
            href="/unlock"
            className="px-3 py-1.5 rounded-full bg-zinc-900 text-white font-medium flex items-center gap-1.5 text-[11px] shadow-xs hover:bg-black transition"
          >
            <KeyRound size={12} className="text-amber-400" />
            <span>{unlockedCount}/7 Unlocked</span>
          </Link>
        ) : (
          <span className="text-[11px] font-medium text-zinc-400">Account</span>
        )}
      </header>

      <main className="max-w-md mx-auto px-4 pt-1">
        {!isLoggedIn ? (
          /* ================= GATED AUTHENTICATION VIEW ================= */
          <div className="bg-white rounded-3xl border border-zinc-200/80 shadow-[0_2px_16px_rgba(0,0,0,0.03)] overflow-hidden mt-2">
            {/* Minimal Header Banner */}
            <div className="h-28 bg-gradient-to-br from-zinc-100 via-zinc-50 to-zinc-100/60 relative flex items-center justify-center border-b border-zinc-100">
              <div className="w-16 h-16 rounded-full border-4 border-white shadow-md bg-white overflow-hidden absolute -bottom-8">
                <img
                  src="/avatar.png"
                  alt="Reader Avatar"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>

            <div className="pt-12 pb-8 px-6 text-center">
              <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 tracking-tight">
                Backbencher Reader
              </h1>
              <p className="text-xs text-zinc-500 mt-1 max-w-sm mx-auto leading-relaxed">
                Sign in to view your unlocked books, reading time, and saved bookmarks.
              </p>

              {/* Login / Register Toggle Tabs */}
              <div className="flex rounded-2xl bg-zinc-100 p-1 mt-6 mb-5 max-w-xs mx-auto text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => {
                    setAuthTab("login");
                    setFormError(null);
                  }}
                  className={`flex-1 py-2 rounded-xl transition cursor-pointer text-center ${
                    authTab === "login"
                      ? "bg-white text-zinc-900 shadow-xs"
                      : "text-zinc-500 hover:text-zinc-900"
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthTab("register");
                    setFormError(null);
                  }}
                  className={`flex-1 py-2 rounded-xl transition cursor-pointer text-center ${
                    authTab === "register"
                      ? "bg-white text-zinc-900 shadow-xs"
                      : "text-zinc-500 hover:text-zinc-900"
                  }`}
                >
                  Create Account
                </button>
              </div>

              {formError && (
                <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-600 font-medium text-left">
                  {formError}
                </div>
              )}

              {/* Form */}
              <form onSubmit={handleAuthSubmit} className="space-y-3 max-w-sm mx-auto text-left">
                {authTab === "register" && (
                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-600 mb-1">
                      Full Name
                    </label>
                    <input
                      type="text"
                      placeholder="Enter your full name"
                      required
                      value={authName}
                      onChange={(e) => setAuthName(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-200 focus:outline-black text-xs bg-zinc-50"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-semibold text-zinc-600 mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    placeholder="name@example.com"
                    required
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-200 focus:outline-black text-xs bg-zinc-50"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-zinc-600 mb-1">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      required
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      className="w-full px-3.5 py-2.5 pr-10 rounded-xl border border-zinc-200 focus:outline-black text-xs bg-zinc-50"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 cursor-pointer"
                    >
                      {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="w-full py-2.5 rounded-full bg-zinc-900 text-white font-semibold hover:bg-black transition cursor-pointer disabled:opacity-50 text-xs shadow-sm mt-3 flex items-center justify-center gap-2"
                >
                  {formSubmitting ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Verifying...</span>
                    </>
                  ) : authTab === "login" ? (
                    "Sign In"
                  ) : (
                    "Create Account"
                  )}
                </button>
              </form>
            </div>
          </div>
        ) : (
          /* ================= PROFESSIONAL MINIMAL PROFILE ================= */
          <div className="space-y-3.5">
            {/* Top Identity Card */}
            <div className="bg-white rounded-3xl border border-zinc-200/80 shadow-[0_2px_16px_rgba(0,0,0,0.03)] overflow-hidden relative">
              {/* Sleek Minimal Banner */}
              <div className="h-28 sm:h-32 w-full relative bg-gradient-to-br from-zinc-100 via-zinc-50 to-zinc-100/60 border-b border-zinc-100">
                <div className="absolute top-3.5 left-4 flex items-center gap-1.5 bg-white/90 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-semibold text-zinc-700 shadow-xs border border-zinc-200/50">
                  <GraduationCap size={13} className="text-zinc-600" />
                  <span>Honors 3rd Year • Botany</span>
                </div>
              </div>

              {/* Profile Details */}
              <div className="px-5 sm:px-6 pb-6 pt-0">
                {/* Avatar and Level Row */}
                <div className="flex items-end justify-between -mt-12 sm:-mt-14 mb-4">
                  <div className="relative">
                    <div className="w-20 h-20 sm:w-22 sm:h-22 rounded-full border-4 border-white shadow-md bg-white overflow-hidden flex items-center justify-center">
                      <img
                        src="/avatar.png"
                        alt="Reader Avatar"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div
                      className="absolute bottom-1 right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white shadow-xs"
                      title="Active Account"
                    />
                  </div>

                  {/* Clean Minimal Exp Bar */}
                  <div className="flex flex-col items-end gap-1 pb-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 font-mono">
                      Level {stats.level} • {stats.expPercent}% Exp
                    </span>
                    <div className="w-24 h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-zinc-900 rounded-full transition-all duration-500"
                        style={{ width: `${Math.max(5, stats.expPercent)}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* User Name & Details */}
                <div className="mb-5">
                  <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 tracking-tight leading-snug">
                    {displayName}
                  </h1>
                  <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">
                    National University • Botany 3rd Year • Backbencher Reader
                  </p>
                  {email && (
                    <p className="text-[11px] text-zinc-400 font-mono mt-1 flex items-center gap-1.5">
                      <Mail size={12} /> {email}
                    </p>
                  )}
                </div>

                {/* 3 Metric Cards */}
                <div className="grid grid-cols-3 rounded-2xl bg-zinc-50/80 border border-zinc-100 py-3 px-2 text-center divide-x divide-zinc-200/60">
                  <div className="px-1">
                    <span className="font-bold text-lg sm:text-xl text-zinc-900 block font-mono">
                      {unlockedCount}/7
                    </span>
                    <span className="text-[10px] sm:text-[11px] text-zinc-500 font-medium mt-0.5 block">
                      Books Unlocked
                    </span>
                  </div>
                  <div className="px-1">
                    <span className="font-bold text-lg sm:text-xl text-zinc-900 block font-mono">
                      {stats.totalMinutes > 0 ? `${stats.totalMinutes}m` : "0m"}
                    </span>
                    <span className="text-[10px] sm:text-[11px] text-zinc-500 font-medium mt-0.5 block">
                      Reading Time
                    </span>
                  </div>
                  <div className="px-1">
                    <span className="font-bold text-lg sm:text-xl text-zinc-900 block font-mono">
                      {stats.dailyAvgMinutes > 0 ? `${stats.dailyAvgMinutes}m` : "0m"}
                    </span>
                    <span className="text-[10px] sm:text-[11px] text-zinc-500 font-medium mt-0.5 block">
                      Daily Average
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Sections */}
            <div className="space-y-2.5">
              {/* Unlock Center Card */}
              <Link
                href="/unlock"
                className="block p-4 rounded-2xl bg-white hover:bg-zinc-50/60 border border-zinc-200/80 transition shadow-[0_2px_12px_rgba(0,0,0,0.02)] active:scale-[0.99] group"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-700 flex items-center justify-center shrink-0 border border-amber-500/20">
                      <KeyRound size={18} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-zinc-900">
                          Unlock & Activation Center
                        </h3>
                        {isOffer && (
                          <span className="text-[10px] bg-amber-100 text-amber-900 font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                            Offer Active
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-500 mt-0.5 truncate">
                        {isOffer ? (
                          <>
                            <span className="line-through text-zinc-400 mr-1.5 font-mono">
                              ৳{regularPrice}
                            </span>
                            <span className="font-bold text-emerald-700 font-mono">
                              Now ৳{offerPrice}
                            </span>{" "}
                            • Unlock all 7 subjects
                          </>
                        ) : (
                          `Unlock remaining ${CHAPTERS.length - unlockedCount} books with instant access`
                        )}
                      </p>
                    </div>
                  </div>
                  <ChevronRight
                    size={16}
                    className="text-zinc-400 group-hover:text-zinc-700 group-hover:translate-x-0.5 transition shrink-0"
                  />
                </div>
              </Link>

              {/* Saved Bookmarks */}
              <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-[0_2px_12px_rgba(0,0,0,0.02)] p-4">
                <div
                  onClick={() => setShowBookmarksList(!showBookmarksList)}
                  className="flex items-center justify-between gap-3 cursor-pointer select-none group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-zinc-100 text-zinc-700 flex items-center justify-center shrink-0">
                      <Bookmark size={18} />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-zinc-900">
                        Saved Bookmarks
                      </h3>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        {bookmarks.length} bookmark{bookmarks.length === 1 ? "" : "s"} saved
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold font-mono bg-zinc-100 text-zinc-700 px-2.5 py-1 rounded-full">
                      {bookmarks.length}
                    </span>
                    <ChevronRight
                      size={16}
                      className={`text-zinc-400 transition-transform ${
                        showBookmarksList ? "rotate-90" : ""
                      }`}
                    />
                  </div>
                </div>

                {/* Expandable Bookmarks List */}
                {showBookmarksList && (
                  <div className="mt-3 pt-3 border-t border-zinc-100 space-y-2">
                    {bookmarks.length === 0 ? (
                      <p className="text-xs text-zinc-400 text-center py-5 bg-zinc-50 rounded-xl">
                        No bookmarks saved yet. Tap the bookmark icon while reading.
                      </p>
                    ) : (
                      bookmarks.map((bm: LocalBookmark) => (
                        <div
                          key={bm.id}
                          className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-zinc-50 border border-zinc-100"
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-zinc-900 truncate">
                              {bm.label}
                            </p>
                            <p className="text-[10px] text-zinc-500 font-mono">
                              Book {bm.chapterIndex + 1} • Page {bm.pageNumber}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Link
                              href={`/read?ch=${bm.chapterIndex}&page=${bm.pageNumber}&offset=${
                                bm.pageOffset || 0
                              }`}
                              className="text-[11px] font-semibold bg-zinc-900 text-white px-3 py-1 rounded-full hover:bg-black transition"
                            >
                              Read
                            </Link>
                            <button
                              onClick={() => removeBookmarkItem(bm.id)}
                              className="p-1.5 text-zinc-400 hover:text-red-600 rounded-full transition cursor-pointer"
                              title="Remove bookmark"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Offline Books Storage */}
              <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-[0_2px_12px_rgba(0,0,0,0.02)] p-4">
                <div
                  onClick={() => setShowOfflineList(!showOfflineList)}
                  className="flex items-center justify-between gap-3 cursor-pointer select-none group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center justify-center shrink-0">
                      <Download size={18} />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-zinc-900">
                        Offline Book Storage
                      </h3>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        Read downloaded books anytime without internet
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold font-mono bg-zinc-100 text-zinc-700 px-2.5 py-1 rounded-full">
                      {savedOfflineCount} Saved
                    </span>
                    <ChevronRight
                      size={16}
                      className={`text-zinc-400 transition-transform ${
                        showOfflineList ? "rotate-90" : ""
                      }`}
                    />
                  </div>
                </div>

                {/* Expandable Offline List */}
                {showOfflineList && (
                  <div className="mt-3 pt-3 border-t border-zinc-100 space-y-2">
                    {offlineActionMsg && (
                      <div className="p-2.5 rounded-xl bg-zinc-900 text-white text-xs font-medium mb-2">
                        {offlineActionMsg}
                      </div>
                    )}

                    <div className="divide-y divide-zinc-100">
                      {CHAPTERS.map((ch) => {
                        const unlocked = isSubjectUnlocked(ch.id);
                        const saved = isBookSavedOffline(ch.index);
                        const isSaving = savingOfflineChapter === ch.index;

                        return (
                          <div
                            key={ch.id}
                            className="py-2.5 flex items-center justify-between gap-3"
                          >
                            <div className="min-w-0">
                              <span className="text-[10px] font-mono bg-zinc-100 text-zinc-600 px-1.5 py-0.5 rounded mr-1.5">
                                {ch.courseCode}
                              </span>
                              <span className="text-xs font-semibold text-zinc-900 truncate">
                                Book {ch.bookNumber}: {ch.title}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {unlocked ? (
                                <button
                                  onClick={() => handleToggleOffline(ch.index)}
                                  disabled={isSaving}
                                  className={`text-[11px] font-semibold px-3 py-1 rounded-full inline-flex items-center gap-1.5 transition cursor-pointer ${
                                    saved
                                      ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                                      : "bg-zinc-100 hover:bg-zinc-200 text-zinc-800"
                                  }`}
                                >
                                  {isSaving ? (
                                    <Loader2 size={11} className="animate-spin" />
                                  ) : saved ? (
                                    <Check size={11} />
                                  ) : (
                                    <Download size={11} />
                                  )}
                                  <span>{saved ? "Saved Offline" : "Save Offline"}</span>
                                </button>
                              ) : (
                                <span className="text-[11px] text-zinc-400 font-medium flex items-center gap-1">
                                  <Lock size={10} /> Locked
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Admin Panel (if Admin) */}
              {isAdmin && (
                <Link
                  href="/admin"
                  className="block p-4 rounded-2xl bg-zinc-900 text-white hover:bg-black transition shadow-sm"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-white/10 text-white flex items-center justify-center shrink-0">
                        <ShieldCheck size={18} />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold">Admin Dashboard</h3>
                        <p className="text-xs text-zinc-400 mt-0.5">
                          Manage activation codes, pricing & users
                        </p>
                      </div>
                    </div>
                    <ChevronRight size={16} className="text-zinc-500" />
                  </div>
                </Link>
              )}

              {/* Sign Out Button */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={async () => {
                    await signOutUser();
                    router.push("/");
                  }}
                  className="w-full py-2.5 rounded-2xl border border-zinc-200 text-zinc-600 hover:text-red-600 hover:border-red-200 hover:bg-red-50/50 text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <LogOut size={14} />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
