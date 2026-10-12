"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/context/AuthContext";
import { getReadingStats, ReadingStats } from "@/lib/readingStats";
import { CHAPTERS } from "@/lib/book/chapters";
import {
  X,
  Bookmark,
  Key,
  Shield,
  LogOut,
  Sparkles,
  ChevronRight,
  BookOpen,
  User as UserIcon,
  CheckCircle2,
  Mail,
  Lock,
} from "lucide-react";

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenBookmarks?: () => void;
}

export default function UserProfileModal({
  isOpen,
  onClose,
  onOpenBookmarks,
}: UserProfileModalProps) {
  const router = useRouter();
  const {
    user,
    profile,
    isLoggedIn,
    signOutUser,
    unlockedSubjects,
    bookmarks,
    settings,
    signIn,
    signUp,
  } = useAuth();

  const [stats, setStats] = useState<ReadingStats>({
    totalMinutes: 35,
    dailyAvgMinutes: 20,
    level: 2,
    expPercent: 65,
    streakDays: 3,
  });

  // Auth form state if not logged in
  const [authTab, setAuthTab] = useState<"login" | "register">("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authName, setAuthName] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setStats(getReadingStats());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const displayName =
    profile?.displayName ||
    user?.displayName ||
    (user?.email ? user.email.split("@")[0] : "ব্যাকবেঞ্চার শিক্ষার্থী");

  const email = profile?.email || user?.email || "";
  const isAdmin = profile?.role === "admin";
  const unlockedCount = unlockedSubjects.length;

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);
    try {
      if (authTab === "login") {
        await signIn(authEmail, authPassword);
      } else {
        await signUp(authName, authEmail, authPassword);
      }
    } catch (err: unknown) {
      const e = err as { message?: string };
      setAuthError(e?.message || "লগইন ব্যর্থ হয়েছে। আবার চেষ্টা করুন।");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await signOutUser();
    onClose();
  };

  // Pricing offer calculation
  const isOffer = settings?.isOfferActive !== false;
  const regularPrice = settings?.regularPrice || 49;
  const offerPrice = settings?.offerPrice || 39;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white text-[#141413] w-full max-w-sm sm:max-w-md rounded-[32px] shadow-[0_25px_60px_rgba(0,0,0,0.25)] border border-black/10 overflow-hidden relative my-auto animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-3.5 right-3.5 z-20 w-8 h-8 rounded-full bg-black/25 hover:bg-black/40 text-white flex items-center justify-center transition cursor-pointer backdrop-blur-md"
          title="বন্ধ করুন"
        >
          <X size={16} />
        </button>

        {/* Sky/Clouds Header Banner (Matching Uploaded Image) */}
        <div className="h-32 sm:h-36 w-full relative overflow-hidden bg-gradient-to-b from-[#87CEEB] via-[#B0E0E6] to-[#E0F7FA]">
          {/* Subtle cloud silhouettes */}
          <div className="absolute inset-0 opacity-40 bg-[radial-gradient(circle_at_30%_40%,white_0%,transparent_50%),radial-gradient(circle_at_80%_30%,white_0%,transparent_60%)]" />
          <div className="absolute top-3 left-4 flex items-center gap-1.5 bg-white/70 backdrop-blur-md px-2.5 py-1 rounded-full text-[10px] font-bold text-sky-900 shadow-2xs">
            <Sparkles size={11} className="text-amber-500" />
            <span>Honors 3rd Year • Botany</span>
          </div>
        </div>

        {/* Profile Content Body */}
        <div className="px-5 sm:px-6 pb-6 pt-0 relative">
          {/* Avatar and Exp Row */}
          <div className="flex items-end justify-between -mt-12 sm:-mt-14 mb-3">
            {/* 3D Student / Reader Avatar */}
            <div className="relative">
              <div className="w-20 h-20 sm:w-22 sm:h-22 rounded-full border-4 border-white shadow-md bg-gradient-to-tr from-amber-200 via-amber-100 to-amber-300 flex items-center justify-center overflow-hidden">
                {/* Stylized cute student face */}
                <span className="text-3xl select-none">🧑‍🎓</span>
              </div>
              {isLoggedIn && (
                <div className="absolute bottom-1 right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white" />
              )}
            </div>

            {/* Exp. Colorful Ticks Bar (Matching Photo) */}
            <div className="flex items-center gap-1.5 pb-2">
              <span className="text-[11px] font-mono font-semibold text-gray-500">exp.</span>
              <div className="flex items-center gap-0.5">
                {[
                  "bg-purple-500",
                  "bg-indigo-500",
                  "bg-pink-500",
                  "bg-rose-500",
                  "bg-orange-500",
                  "bg-amber-500",
                  "bg-lime-500",
                  "bg-emerald-500",
                  "bg-teal-500",
                  "bg-gray-200",
                  "bg-gray-200",
                  "bg-gray-200",
                  "bg-gray-200",
                ].map((color, i) => (
                  <span
                    key={i}
                    className={`w-1 h-3.5 rounded-full ${
                      i < Math.round(stats.expPercent / 8) ? color : "bg-gray-200"
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* User Name & Bio */}
          <div className="mb-5">
            <h3 className="font-serif font-black text-xl sm:text-2xl text-gray-900 leading-tight">
              {displayName}
            </h3>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
              জাতীয় বিশ্ববিদ্যালয় • উদ্ভিদবিজ্ঞান ৩য় বর্ষ • Backbencher VIP Reader
            </p>
            {email && (
              <p className="text-[11px] text-gray-400 font-mono mt-0.5">{email}</p>
            )}
          </div>

          {/* 3 Stats Columns (Matching 72.9K Likes | 828 Posts | 342.9K Views in Photo) */}
          <div className="grid grid-cols-3 rounded-2xl bg-gray-50 border border-gray-100 py-3.5 px-2 text-center divide-x divide-gray-200 mb-5">
            {/* Stat 1: Unlocked Books */}
            <div className="px-1">
              <span className="font-serif font-black text-lg sm:text-xl text-gray-900 block leading-tight">
                {unlockedCount}/৭টি
              </span>
              <span className="text-[11px] text-gray-500 font-semibold mt-0.5 block">
                আনলকড বই
              </span>
            </div>

            {/* Stat 2: Reading Time */}
            <div className="px-1">
              <span className="font-serif font-black text-lg sm:text-xl text-gray-900 block leading-tight">
                {stats.totalMinutes} মি.
              </span>
              <span className="text-[11px] text-gray-500 font-semibold mt-0.5 block">
                পড়ার সময়
              </span>
            </div>

            {/* Stat 3: Daily Average */}
            <div className="px-1">
              <span className="font-serif font-black text-lg sm:text-xl text-gray-900 block leading-tight">
                {stats.dailyAvgMinutes} মি./দিন
              </span>
              <span className="text-[11px] text-gray-500 font-semibold mt-0.5 block">
                দৈনিক গড়
              </span>
            </div>
          </div>

          {/* If Logged In: Action List */}
          {isLoggedIn ? (
            <div className="space-y-2.5">
              {/* Bookmark Button */}
              <button
                type="button"
                onClick={() => {
                  onClose();
                  if (onOpenBookmarks) {
                    onOpenBookmarks();
                  } else {
                    router.push("/library");
                  }
                }}
                className="w-full flex items-center justify-between p-3 rounded-2xl bg-gray-50 hover:bg-gray-100 border border-gray-200/80 transition cursor-pointer text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center shrink-0">
                    <Bookmark size={14} />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-gray-900">
                      সংরক্ষিত বুকমার্কসমূহ
                    </h4>
                    <p className="text-[11px] text-gray-500">
                      মোট {bookmarks.length}টি প্রশ্ন ও পৃষ্ঠা সংরক্ষিত
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-gray-400">
                  <span className="font-bold font-mono text-[11px] bg-gray-200 px-2 py-0.5 rounded-full text-gray-700">
                    {bookmarks.length}টি
                  </span>
                  <ChevronRight size={15} />
                </div>
              </button>

              {/* Unlock Center Button with Offer Banner */}
              <Link
                href="/unlock"
                onClick={onClose}
                className="w-full flex items-center justify-between p-3 rounded-2xl bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/25 transition cursor-pointer text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-amber-500 text-amber-950 flex items-center justify-center shrink-0">
                    <Key size={14} />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h4 className="text-xs font-bold text-amber-950">
                        বই আনলক ও অ্যাক্টিভেশন সেন্টার
                      </h4>
                      {isOffer && (
                        <span className="text-[10px] bg-amber-400 text-amber-950 font-black px-1.5 py-0.2 rounded-full uppercase">
                          অফার
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-amber-900/80">
                      {isOffer ? (
                        <>
                          <span className="line-through text-gray-400 mr-1">
                            ৳{regularPrice}
                          </span>
                          <span className="font-black text-emerald-700">
                            মাত্র ৳{offerPrice}
                          </span>{" "}
                          • বাকি {CHAPTERS.length - unlockedCount}টি বিষয়
                        </>
                      ) : (
                        `বাকি ${CHAPTERS.length - unlockedCount}টি বই আনলক করুন`
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-amber-900">
                  <span className="text-[11px] font-bold">যান</span>
                  <ChevronRight size={15} />
                </div>
              </Link>

              {/* Admin Panel Link (if admin) */}
              {isAdmin && (
                <Link
                  href="/admin"
                  onClick={onClose}
                  className="w-full flex items-center justify-between p-3 rounded-2xl bg-zinc-900 text-white hover:bg-black transition cursor-pointer text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-white/20 text-white flex items-center justify-center shrink-0">
                      <Shield size={14} />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold">অ্যাডমিন ম্যানেজমেন্ট প্যানেল</h4>
                      <p className="text-[11px] text-white/60">
                        কোড জেনারেট, অফার প্রাইজ ও ইউজার ম্যানেজমেন্ট
                      </p>
                    </div>
                  </div>
                  <ChevronRight size={15} className="text-white/60" />
                </Link>
              )}

              {/* Logout Button */}
              <button
                type="button"
                onClick={handleLogout}
                className="w-full py-2.5 mt-2 rounded-2xl border border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <LogOut size={13} />
                <span>লগআউট করুন</span>
              </button>
            </div>
          ) : (
            /* If Not Logged In: Inline Login / Register Tabs */
            <div className="mt-2">
              <div className="flex rounded-xl bg-gray-100 p-1 mb-3 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setAuthTab("login")}
                  className={`flex-1 py-1.5 rounded-lg transition cursor-pointer text-center ${
                    authTab === "login"
                      ? "bg-white text-gray-900 shadow-2xs"
                      : "text-gray-500 hover:text-gray-900"
                  }`}
                >
                  লগইন
                </button>
                <button
                  type="button"
                  onClick={() => setAuthTab("register")}
                  className={`flex-1 py-1.5 rounded-lg transition cursor-pointer text-center ${
                    authTab === "register"
                      ? "bg-white text-gray-900 shadow-2xs"
                      : "text-gray-500 hover:text-gray-900"
                  }`}
                >
                  নতুন একাউন্ট
                </button>
              </div>

              {authError && (
                <div className="mb-3 p-2.5 rounded-xl bg-red-50 border border-red-200 text-[11px] text-red-600 font-medium">
                  {authError}
                </div>
              )}

              <form onSubmit={handleAuthSubmit} className="space-y-2.5 text-xs">
                {authTab === "register" && (
                  <div>
                    <input
                      type="text"
                      placeholder="আপনার নাম"
                      required
                      value={authName}
                      onChange={(e) => setAuthName(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 focus:outline-black text-xs"
                    />
                  </div>
                )}
                <div>
                  <input
                    type="email"
                    placeholder="ইমেইল অ্যাড্রেস"
                    required
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 focus:outline-black text-xs"
                  />
                </div>
                <div>
                  <input
                    type="password"
                    placeholder="পাসওয়ার্ড"
                    required
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 focus:outline-black text-xs"
                  />
                </div>
                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full py-2.5 rounded-xl bg-gray-900 text-white font-bold hover:bg-black transition cursor-pointer disabled:opacity-50 text-xs mt-1"
                >
                  {authLoading
                    ? "অপেক্ষা করুন..."
                    : authTab === "login"
                    ? "লগইন করুন"
                    : "একাউন্ট তৈরি করুন"}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
