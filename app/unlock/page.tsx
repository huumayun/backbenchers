"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/context/AuthContext";
import { CHAPTERS, BOOK_INFO } from "@/lib/book/chapters";
import {
  ArrowLeft,
  ChevronLeft,
  Eye,
  EyeOff,
  LogIn,
  UserPlus,
  KeyRound,
  Lock,
  Unlock,
  CheckCircle2,
  Check,
  Send,
  MessageCircle,
  Copy,
  Clock,
  BookOpen,
  User,
  AlertCircle,
  Sparkles,
  ShieldCheck,
} from "lucide-react";

function UnlockPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preSelectedBookIdx = searchParams.get("ch") || searchParams.get("book");

  const {
    unlockedSubjects,
    isSubjectUnlocked,
    unlockWithCode,
    settings,
    isLoggedIn,
    loading: authLoadingState,
    profile,
    user,
    signIn,
    signUp,
  } = useAuth();

  // Selected subjects to buy via Telegram/WhatsApp
  const [selectedToBuy, setSelectedToBuy] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{
    text: string;
    success: boolean;
  } | null>(null);

  // Auth toggle if not logged in
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPass, setAuthPass] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [authName, setAuthName] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Pre-select book if arrived from reader or flipbook
  useEffect(() => {
    if (preSelectedBookIdx !== null) {
      const idx = parseInt(preSelectedBookIdx, 10);
      const targetCh = CHAPTERS[idx];
      if (targetCh && !unlockedSubjects.includes(targetCh.id)) {
        setSelectedToBuy([targetCh.id]);
      }
    }
  }, [preSelectedBookIdx, unlockedSubjects]);

  const toggleSelect = (subjectId: string) => {
    if (unlockedSubjects.includes(subjectId)) return;
    setSelectedToBuy((prev) =>
      prev.includes(subjectId)
        ? prev.filter((id) => id !== subjectId)
        : [...prev, subjectId]
    );
  };

  const selectAllLocked = () => {
    const lockedIds = CHAPTERS.map((c) => c.id).filter(
      (id) => !unlockedSubjects.includes(id)
    );
    if (selectedToBuy.length === lockedIds.length) {
      setSelectedToBuy([]);
    } else {
      setSelectedToBuy(lockedIds);
    }
  };

  const selectedBooks = CHAPTERS.filter((ch) => selectedToBuy.includes(ch.id));
  const isOffer = mounted ? Boolean(settings?.isOfferActive === true) : false;
  const regularPrice = settings?.regularPrice || 49;
  const offerPrice = settings?.offerPrice || 39;
  const unitPrice = isOffer ? offerPrice : regularPrice;
  const totalCost = selectedToBuy.length * unitPrice;

  const buildTelegramUrl = () => {
    const base =
      settings.contactTelegram || "https://t.me/your_telegram_username";
    const userEmail = profile?.email || user?.email || "";
    const listText =
      selectedBooks.length > 0
        ? selectedBooks
            .map((b) => `• বই ${b.bookNumber}: ${b.titleBn} (${b.courseCode})`)
            .join("\n")
        : "বোটানি ৩য় বর্ষের বিষয়সমূহ";
    const priceText = isOffer
      ? `প্রতি বিষয় ৳${offerPrice} (অফার মূল্য, পূর্বে ৳${regularPrice})`
      : `প্রতি বিষয় ৳${regularPrice}`;
    const msg = `আসসালামু আলাইকুম, আমি Backbencher অ্যাপের নিচের বিষয়গুলো আনলক করতে চাই (${priceText}):\n${listText}\nমোট বিষয়: ${
      selectedBooks.length || 1
    }টি • মোট ফি: ৳${totalCost || unitPrice}\nআমার অ্যাকাউন্ট ইমেইল: ${userEmail}`;

    if (base.includes("t.me/")) {
      const sep = base.includes("?") ? "&" : "?";
      return `${base}${sep}text=${encodeURIComponent(msg)}`;
    }
    return base;
  };

  const buildWhatsAppUrl = () => {
    const num = (
      settings.contactWhatsApp ||
      settings.whatsappNumber ||
      "01700000000"
    ).replace(/[^0-9]/g, "");
    const userEmail = profile?.email || user?.email || "";
    const listText =
      selectedBooks.length > 0
        ? selectedBooks
            .map((b) => `• বই ${b.bookNumber}: ${b.titleBn} (${b.courseCode})`)
            .join("\n")
        : "বোটানি ৩য় বর্ষের বিষয়সমূহ";
    const priceText = isOffer
      ? `প্রতি বিষয় ৳${offerPrice} (অফার মূল্য, পূর্বে ৳${regularPrice})`
      : `প্রতি বিষয় ৳${regularPrice}`;
    const msg = `আসসালামু আলাইকুম, আমি Backbencher অ্যাপের নিচের বিষয়গুলো আনলক করতে চাই (${priceText}):\n${listText}\nমোট বিষয়: ${
      selectedBooks.length || 1
    }টি • মোট ফি: ৳${totalCost || unitPrice}\nআমার অ্যাকাউন্ট ইমেইল: ${userEmail}`;

    return `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;
  };

  const handleRedeemCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode) {
      setStatusMsg({ text: "অনুগ্রহ করে আনলক কোডটি লিখুন।", success: false });
      return;
    }
    setStatusMsg(null);
    setSubmitting(true);

    const res = await unlockWithCode(cleanCode);
    setSubmitting(false);

    if (res.success) {
      setCode("");
      setStatusMsg({
        text: res.message || "কোডটি সফলভাবে অ্যাক্টিভ হয়েছে!",
        success: true,
      });
      setSelectedToBuy([]);
    } else {
      setStatusMsg({
        text: res.message || "ভুল বা ইতিমধ্যে ব্যবহৃত কোড।",
        success: false,
      });
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);

    if (authMode === "login") {
      const res = await signIn(authEmail, authPass);
      setAuthLoading(false);
      if (!res.success) {
        setAuthError(res.message);
      }
    } else {
      if (authPass.length < 6) {
        setAuthLoading(false);
        setAuthError("পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।");
        return;
      }
      const res = await signUp(authEmail, authPass, authName);
      setAuthLoading(false);
      if (!res.success) {
        setAuthError(res.message);
      }
    }
  };

  const handlePasteCode = async () => {
    try {
      const clip = await navigator.clipboard.readText();
      if (clip) setCode(clip.trim().toUpperCase());
    } catch {
      // ignore
    }
  };

  // Group chapters into unlocked vs locked
  const unlockedList = CHAPTERS.filter((ch) => isSubjectUnlocked(ch.id));
  const lockedList = CHAPTERS.filter((ch) => !isSubjectUnlocked(ch.id));

  // Loading state
  if (!mounted || authLoadingState) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-[#FAF9F6]">
        <div className="animate-spin w-6 h-6 border-2 border-zinc-900 border-t-transparent rounded-full" />
      </div>
    );
  }

  // If user is NOT logged in, NEVER show the unlock list or activation codes!
  if (!isLoggedIn) {
    return (
      <div
        suppressHydrationWarning
        className="min-h-screen bg-[#FAF9F6] text-[#141413] flex flex-col justify-center px-4 py-8"
      >
        <div className="w-full max-w-sm mx-auto">
          <div className="mb-6">
            <button
              type="button"
              onClick={() => {
                if (typeof window !== "undefined" && window.history.length > 1) {
                  router.back();
                } else {
                  router.push("/");
                }
              }}
              className="inline-flex items-center gap-1 text-xs font-medium opacity-60 hover:opacity-100 transition cursor-pointer"
            >
              <ChevronLeft size={16} /> হোমপেজে ফিরুন
            </button>
          </div>

          <div className="bg-white rounded-3xl shadow-xl p-7 border border-black/8">
            <div className="w-16 h-16 rounded-full border-2 border-white shadow-md bg-white overflow-hidden mx-auto mb-3">
              <img
                src="/avatar.png"
                alt="Backbencher Reader"
                className="w-full h-full object-cover"
              />
            </div>
            <h1 className="text-xl font-extrabold text-center mb-1">
              {authMode === "login" ? "লগইন করুন" : "রেজিস্ট্রেশন করুন"}
            </h1>
            <p className="text-xs opacity-55 text-center mb-6">
              বই আনলক করতে আপনার অ্যাকাউন্টে {authMode === "login" ? "লগইন" : "রেজিস্ট্রেশন"} করুন
            </p>

            {authError && (
              <div className="bg-red-500/10 text-red-700 text-xs font-medium px-4 py-2.5 rounded-xl mb-4 text-center">
                {authError}
              </div>
            )}

            <form onSubmit={handleAuthSubmit} className="space-y-3.5">
              {authMode === "register" && (
                <div>
                  <label className="block text-xs font-semibold opacity-75 mb-1">
                    আপনার নাম
                  </label>
                  <input
                    type="text"
                    required
                    value={authName}
                    onChange={(e) => setAuthName(e.target.value)}
                    placeholder="আপনার নাম"
                    className="w-full bg-[#FAF9F6] border border-black/15 focus:border-black rounded-xl px-4 py-2.5 text-xs focus:outline-none"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold opacity-75 mb-1">
                  ইমেইল
                </label>
                <input
                  type="email"
                  required
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  placeholder="আপনার ইমেইল"
                  className="w-full bg-[#FAF9F6] border border-black/15 focus:border-black rounded-xl px-4 py-2.5 text-xs focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold opacity-75 mb-1">
                  পাসওয়ার্ড
                </label>
                <div className="relative">
                  <input
                    type={showPass ? "text" : "password"}
                    required
                    value={authPass}
                    onChange={(e) => setAuthPass(e.target.value)}
                    placeholder="পাসওয়ার্ড"
                    className="w-full bg-[#FAF9F6] border border-black/15 focus:border-black rounded-xl px-4 py-2.5 pr-10 text-xs focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 opacity-45 hover:opacity-80 cursor-pointer"
                  >
                    {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={authLoading}
                className="w-full bg-[#111111] hover:bg-black text-white font-bold py-3 rounded-full text-xs transition flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer shadow-lg mt-2"
              >
                {authMode === "login" ? <LogIn size={14} /> : <UserPlus size={14} />}
                {authLoading
                  ? (authMode === "login" ? "লগইন হচ্ছে..." : "রেজিস্ট্রেশন হচ্ছে...")
                  : (authMode === "login" ? "লগইন করুন" : "রেজিস্ট্রেশন করুন")}
              </button>
            </form>

            <p className="text-center text-xs opacity-65 mt-5">
              {authMode === "login" ? (
                <>
                  অ্যাকাউন্ট নেই?{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode("register");
                      setAuthError(null);
                    }}
                    className="text-black font-bold underline cursor-pointer"
                  >
                    রেজিস্ট্রেশন করুন
                  </button>
                </>
              ) : (
                <>
                  আগেই অ্যাকাউন্ট আছে?{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode("login");
                      setAuthError(null);
                    }}
                    className="text-black font-bold underline cursor-pointer"
                  >
                    লগইন করুন
                  </button>
                </>
              )}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Logged-in full Unlock Center
  return (
    <div
      suppressHydrationWarning
      className="w-full max-w-full overflow-x-hidden min-h-dvh bg-[#FAF9F6] text-[#141413] pb-24 selection:bg-black selection:text-white"
    >
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-[#FAF9F6]/95 backdrop-blur-md border-b border-black/6 px-3.5 sm:px-6 h-14 flex items-center justify-between">
        <button
          onClick={() => {
            if (typeof window !== "undefined" && window.history.length > 1) {
              router.back();
            } else {
              router.push("/");
            }
          }}
          className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-full hover:bg-black/5 active:scale-95 transition cursor-pointer text-zinc-700 shrink-0"
        >
          <ArrowLeft size={16} />
          <span>পেছনে</span>
        </button>

        <div className="flex items-center gap-2 min-w-0">
          <span className="font-serif font-black text-sm tracking-tight text-[#111111] truncate">
            Unlock Center
          </span>
          <span className="text-[11px] font-mono font-bold bg-amber-100 text-amber-900 border border-amber-300/80 px-2.5 py-0.5 rounded-full shrink-0 shadow-2xs">
            {unlockedSubjects.length}/৭ আনলকড
          </span>
        </div>
      </header>

      <main className="w-full max-w-lg mx-auto px-3.5 sm:px-6 pt-4 space-y-4">
        {/* User Account Info Card */}
        <div className="rounded-2xl bg-white border border-emerald-200/80 p-3.5 sm:p-4 shadow-[0_2px_10px_rgba(16,185,129,0.04)] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-emerald-600 to-teal-500 text-white font-bold text-sm flex items-center justify-center shrink-0 shadow-2xs">
              {(profile?.displayName || "প").charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h3 className="font-bold text-xs sm:text-sm text-zinc-900 truncate">
                  {profile?.displayName || "সম্মানিত পাঠক"}
                </h3>
                <span className="text-[10px] font-mono font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                  <CheckCircle2 size={10} className="text-emerald-600" /> সক্রিয়
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 font-mono truncate mt-0.5">
                {profile?.email || user?.email || ""}
              </p>
            </div>
          </div>

          <div className="text-right shrink-0">
            <span className="text-xs font-bold font-mono text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-lg inline-block">
              {unlockedSubjects.length}/৭
            </span>
            <p className="text-[10px] text-zinc-400 font-medium mt-0.5">আনলকড</p>
          </div>
        </div>

        {/* Section 1: Unlocked Subjects List */}
        {unlockedList.length > 0 && (
          <section className="space-y-2.5">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <Unlock size={15} className="text-emerald-600 shrink-0" />
                <h2 className="font-bold text-xs sm:text-sm text-zinc-900 truncate">
                  আনলকড বিষয়সমূহ ({unlockedList.length})
                </h2>
              </div>
              <span className="text-[10px] font-mono text-emerald-800 font-semibold bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 shrink-0">
                লাইফটাইম অ্যাক্সেস
              </span>
            </div>

            <div className="space-y-2">
              {unlockedList.map((ch) => {
                return (
                  <div
                    key={ch.id}
                    className="rounded-2xl bg-gradient-to-r from-emerald-50/30 via-white to-white border border-emerald-200/80 p-3 sm:p-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.02)] flex items-center justify-between gap-3 hover:border-emerald-300 transition"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-[10px] font-mono font-bold bg-emerald-100 text-emerald-900 border border-emerald-200/60 px-1.5 py-0.5 rounded">
                          {ch.courseCode}
                        </span>
                        <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 inline-flex items-center gap-1">
                          <CheckCircle2 size={10} /> আনলকড
                        </span>
                      </div>
                      <h4 className="font-semibold text-xs sm:text-sm text-zinc-900 truncate">
                        বই {ch.bookNumber}: {ch.titleBn}
                      </h4>
                      <p className="text-[10px] text-zinc-400 mt-0.5 font-mono">
                        মোট {ch.endPage} পৃষ্ঠা • আনলকড
                      </p>
                    </div>

                    <Link
                      href={`/read?ch=${ch.index}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-[0_2px_8px_rgba(16,185,129,0.25)] active:scale-95 transition shrink-0"
                      title="বইটি পড়ুন"
                    >
                      <BookOpen size={13} />
                      <span>পড়ুন</span>
                    </Link>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Section 2: Activation Code Input Card */}
        <section className="rounded-2xl bg-gradient-to-br from-amber-50/50 via-white to-white border border-amber-200/80 p-4 sm:p-5 shadow-[0_2px_12px_rgba(245,158,11,0.05)] space-y-3.5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-800 flex items-center justify-center shrink-0 border border-amber-300/60">
              <KeyRound size={16} />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-xs sm:text-sm text-zinc-900 truncate">
                অ্যাক্টিভেশন কোড
              </h3>
              <p className="text-[11px] text-zinc-400 truncate">
                প্রাপ্ত আনলক কোডটি এখানে এন্টার করুন
              </p>
            </div>
          </div>

          <form onSubmit={handleRedeemCode} className="space-y-2.5">
            <div className="flex items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="কোড লিখুন (যেমন: BACK-2026)"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-amber-300/80 text-zinc-900 placeholder:text-zinc-400 text-xs sm:text-sm font-mono tracking-wider uppercase focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200/50 transition"
                />
              </div>
              <button
                type="button"
                onClick={handlePasteCode}
                className="px-3 py-2.5 rounded-xl bg-amber-100/80 hover:bg-amber-200/90 text-amber-900 border border-amber-300/70 text-xs font-semibold flex items-center gap-1.5 shrink-0 active:scale-95 transition cursor-pointer shadow-2xs"
                title="ক্লিপবোর্ড থেকে পেস্ট করুন"
              >
                <Copy size={13} />
                <span>পেস্ট</span>
              </button>
            </div>

            {statusMsg && (
              <div
                className={`p-2.5 rounded-xl text-xs font-medium flex items-center gap-2 ${
                  statusMsg.success
                    ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
                    : "bg-red-50 border border-red-200 text-red-700"
                }`}
              >
                {statusMsg.success ? (
                  <CheckCircle2 size={14} className="shrink-0 text-emerald-600" />
                ) : (
                  <AlertCircle size={14} className="shrink-0 text-red-600" />
                )}
                <span>{statusMsg.text}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !code.trim()}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-bold text-xs sm:text-sm shadow-[0_2px_10px_rgba(245,158,11,0.25)] active:scale-98 transition disabled:opacity-40 disabled:pointer-events-none cursor-pointer flex items-center justify-center gap-2"
            >
              <KeyRound size={14} />
              <span>{submitting ? "যাচাই করা হচ্ছে..." : "কোড দিয়ে আনলক করুন"}</span>
            </button>
          </form>
        </section>

        {/* Section 3: Remaining Subjects to Unlock & Telegram/WhatsApp Order */}
        {lockedList.length > 0 && (
          <section className="rounded-2xl bg-white border border-zinc-200/80 p-4 sm:p-5 shadow-[0_2px_12px_rgba(0,0,0,0.02)] space-y-3.5">
            <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-zinc-100">
              <div className="min-w-0">
                <h3 className="font-bold text-xs sm:text-sm text-zinc-900 truncate">
                  বাকি বিষয়সমূহ ({lockedList.length}টি)
                </h3>
                <p className="text-[11px] text-zinc-400 mt-0.5 truncate">
                  {isOffer ? (
                    <>
                      অফার মূল্য: <span className="text-emerald-700 font-bold font-mono">৳{offerPrice}</span>{" "}
                      (পূর্বে <span className="line-through font-mono">৳{regularPrice}</span>)
                    </>
                  ) : (
                    `প্রতি বিষয় ৳${regularPrice}`
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={selectAllLocked}
                className="text-xs font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200/80 px-2.5 py-1 rounded-lg cursor-pointer transition shrink-0"
              >
                {selectedToBuy.length === lockedList.length
                  ? "সব আনসিলেক্ট"
                  : `সব সিলেক্ট (${lockedList.length})`}
              </button>
            </div>

            {/* Checkbox List */}
            <div className="space-y-1.5">
              {lockedList.map((ch) => {
                const isChecked = selectedToBuy.includes(ch.id);
                return (
                  <div
                    key={ch.id}
                    onClick={() => toggleSelect(ch.id)}
                    className={`p-2.5 sm:p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                      isChecked
                        ? "bg-amber-50/60 border-amber-400 shadow-2xs"
                        : "bg-zinc-50/80 border-zinc-200/70 hover:border-zinc-300"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 transition ${
                          isChecked
                            ? "bg-amber-500 text-white border-amber-500"
                            : "border-zinc-300 bg-white"
                        }`}
                      >
                        {isChecked && <Check size={11} strokeWidth={3} />}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-mono font-semibold bg-zinc-200/70 text-zinc-700 px-1.5 py-0.5 rounded">
                            {ch.courseCode}
                          </span>
                          <span className="text-[11px] text-zinc-400">
                            বই {ch.bookNumber}
                          </span>
                        </div>
                        <h4 className="font-semibold text-xs sm:text-sm text-zinc-900 truncate mt-0.5">
                          {ch.titleBn}
                        </h4>
                      </div>
                    </div>

                    <div suppressHydrationWarning className="text-right shrink-0">
                      {isOffer ? (
                        <div>
                          <span className="text-[10px] line-through text-zinc-400 font-mono mr-1">
                            ৳{regularPrice}
                          </span>
                          <span className="text-xs font-bold font-mono text-emerald-700">
                            ৳{offerPrice}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs font-bold font-mono text-zinc-900">
                          ৳{regularPrice}
                        </span>
                      )}
                      <p className="text-[10px] text-zinc-400">সম্পূর্ণ বই</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Price & Action Buttons */}
            <div className="pt-2.5 border-t border-zinc-100 space-y-2.5">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-zinc-600">সিলেক্টেড: {selectedToBuy.length}টি</span>
                <div suppressHydrationWarning className="flex items-center gap-1.5 font-mono">
                  {isOffer && selectedToBuy.length > 0 && (
                    <span className="line-through text-zinc-400 text-xs">
                      ৳{selectedToBuy.length * regularPrice}
                    </span>
                  )}
                  <span className="text-sm sm:text-base text-zinc-900 font-black">
                    মোট: ৳{totalCost}
                  </span>
                </div>
              </div>

              {/* Dynamic Contact Buttons */}
              <div
                className={
                  settings?.contactChannel === "both" || !settings?.contactChannel
                    ? "grid grid-cols-1 sm:grid-cols-2 gap-2"
                    : "space-y-2"
                }
              >
                {(settings?.contactChannel === "telegram" ||
                  settings?.contactChannel === "both" ||
                  !settings?.contactChannel) && (
                  <a
                    href={buildTelegramUrl()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-2.5 px-3.5 rounded-xl bg-[#229ED9] text-white hover:bg-[#1E88E5] font-semibold text-xs flex items-center justify-center gap-1.5 shadow-[0_2px_8px_rgba(34,158,217,0.3)] active:scale-98 transition"
                  >
                    <Send size={14} />
                    <span>Telegram-এ কোড নিন</span>
                  </a>
                )}

                {(settings?.contactChannel === "whatsapp" ||
                  settings?.contactChannel === "both" ||
                  !settings?.contactChannel) && (
                  <a
                    href={buildWhatsAppUrl()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-2.5 px-3.5 rounded-xl bg-[#25D366] text-white hover:bg-[#1EBE5D] font-semibold text-xs flex items-center justify-center gap-1.5 shadow-[0_2px_8px_rgba(37,211,102,0.3)] active:scale-98 transition"
                  >
                    <MessageCircle size={14} />
                    <span>WhatsApp-এ মেসেজ দিন</span>
                  </a>
                )}
              </div>

              <p className="text-[10px] text-center text-zinc-400 pt-0.5">
                পেমেন্ট: বিকাশ / নগদ (Personal) • ৫ মিনিটে কোড ডেলিভারি
              </p>
            </div>
          </section>
        )}

        {/* Section 4: Redeem Code History Log */}
        {profile?.redeemedCodes && profile.redeemedCodes.length > 0 && (
          <section className="rounded-2xl bg-white border border-zinc-200/80 p-4 shadow-[0_2px_10px_rgba(0,0,0,0.02)] space-y-2.5">
            <div className="flex items-center gap-1.5">
              <Clock size={13} className="text-zinc-400" />
              <h3 className="font-semibold text-xs text-zinc-700">
                পূর্বে ব্যবহৃত কোড হিস্ট্রি
              </h3>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(profile.redeemedCodes || []).map((c: string, i: number) => (
                <span
                  key={i}
                  className="font-mono text-[11px] font-semibold bg-emerald-50 text-emerald-900 border border-emerald-200 px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-2xs"
                >
                  <CheckCircle2 size={11} className="text-emerald-600" />
                  <span>{c}</span>
                </span>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default function UnlockPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-dvh flex items-center justify-center bg-[#FAF9F6]">
          <div className="animate-spin w-6 h-6 border-2 border-zinc-900 border-t-transparent rounded-full" />
        </div>
      }
    >
      <UnlockPageContent />
    </Suspense>
  );
}
