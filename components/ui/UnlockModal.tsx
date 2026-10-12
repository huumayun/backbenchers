"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/lib/context/AuthContext";
import { CHAPTERS } from "@/lib/book/chapters";
import {
  Lock,
  Unlock,
  MessageCircle,
  CheckCircle2,
  X,
  UserCheck,
  LogOut,
  Eye,
  EyeOff,
  Check,
  AlertTriangle,
} from "lucide-react";

interface UnlockCardProps {
  onClose?: () => void;
  isModal?: boolean;
  title?: string;
  subtitle?: string;
  defaultSubjectId?: string;
}

export function UnlockCard({
  onClose,
  isModal = false,
  title = "বিষয় আনলক করুন",
  defaultSubjectId,
}: UnlockCardProps) {
  const {
    unlockWithCode,
    settings,
    unlockedSubjects,
    hasAllSubjectsUnlocked,
    isLoggedIn,
    profile,
    user,
    signIn,
    signUp,
    signOutUser,
  } = useAuth();

  // Auth states (when user is not logged in yet)
  const [authTab, setAuthTab] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);

  // Subject selection for Telegram purchase request
  const [selectedToBuy, setSelectedToBuy] = useState<string[]>(() => {
    if (defaultSubjectId && !unlockedSubjects.includes(defaultSubjectId)) {
      return [defaultSubjectId];
    }
    return [];
  });

  useEffect(() => {
    if (
      defaultSubjectId &&
      !unlockedSubjects.includes(defaultSubjectId) &&
      selectedToBuy.length === 0
    ) {
      setSelectedToBuy([defaultSubjectId]);
    }
  }, [defaultSubjectId, unlockedSubjects, selectedToBuy.length]);

  // Unlock code states (available after login)
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ text: string; success: boolean } | null>(
    null
  );

  const toggleSelectSubject = (subjectId: string) => {
    if (unlockedSubjects.includes(subjectId)) return;
    setSelectedToBuy((prev) =>
      prev.includes(subjectId)
        ? prev.filter((id) => id !== subjectId)
        : [...prev, subjectId]
    );
  };

  const selectAllRemaining = () => {
    const remaining = CHAPTERS.map((c) => c.id).filter(
      (id) => !unlockedSubjects.includes(id)
    );
    if (selectedToBuy.length === remaining.length) {
      setSelectedToBuy([]);
    } else {
      setSelectedToBuy(remaining);
    }
  };

  const selectedBookNames = CHAPTERS.filter((ch) =>
    selectedToBuy.includes(ch.id)
  ).map(
    (ch) =>
      `বই ${ch.bookNumber}: ${ch.titleBn.replace(/^[০-৯1-9]+\.\s*/, "")} (${
        ch.courseCode
      })`
  );

  const isOffer = settings.isOfferActive !== false;
  const regularPrice = settings.regularPrice || 49;
  const offerPrice = settings.offerPrice || 39;
  const unitPrice = isOffer ? offerPrice : regularPrice;
  const totalCost = selectedToBuy.length * unitPrice;

  const buildTelegramPurchaseUrl = () => {
    const base = settings.contactTelegram || "https://t.me/your_telegram_username";
    const userLabel = profile?.email || user?.email || "";
    const subjectListText =
      selectedBookNames.length > 0
        ? selectedBookNames.join("\n• ")
        : "বোটানি ৩য় বর্ষের বিষয়সমূহ";
    const priceText = isOffer
      ? `প্রতি বিষয় ৳${offerPrice} (অফার, পূর্বে ৳${regularPrice})`
      : `প্রতি বিষয় ৳${regularPrice}`;
    const msg = `আসসালামু আলাইকুম, আমি নিচের বিষয়গুলোর আনলক কোড নিতে চাই (${priceText}):\n• ${subjectListText}\nমোট: ৳${
      totalCost || unitPrice
    }\nআমার অ্যাকাউন্ট ইমেইল: ${userLabel}`;

    if (base.includes("t.me/")) {
      const separator = base.includes("?") ? "&" : "?";
      return `${base}${separator}text=${encodeURIComponent(msg)}`;
    }
    return base;
  };

  const buildWhatsAppPurchaseUrl = () => {
    const num = (
      settings.contactWhatsApp ||
      settings.whatsappNumber ||
      "01700000000"
    ).replace(/[^0-9]/g, "");
    const userLabel = profile?.email || user?.email || "";
    const subjectListText =
      selectedBookNames.length > 0
        ? selectedBookNames.join("\n• ")
        : "বোটানি ৩য় বর্ষের বিষয়সমূহ";
    const priceText = isOffer
      ? `প্রতি বিষয় ৳${offerPrice} (অফার, পূর্বে ৳${regularPrice})`
      : `প্রতি বিষয় ৳${regularPrice}`;
    const msg = `আসসালামু আলাইকুম, আমি নিচের বিষয়গুলোর আনলক কোড নিতে চাই (${priceText}):\n• ${subjectListText}\nমোট: ৳${
      totalCost || unitPrice
    }\nআমার অ্যাকাউন্ট ইমেইল: ${userLabel}`;
    return `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus(null);
    setAuthLoading(true);

    if (authTab === "login") {
      const res = await signIn(email, password);
      setAuthLoading(false);
      if (!res.success) {
        setStatus({ text: res.message, success: false });
      } else {
        setStatus({
          text: "✅ লগইন সফল! এখন বিষয় সিলেক্ট করে কোড নিন অথবা আপনার আনলক কোডটি লিখুন।",
          success: true,
        });
      }
    } else {
      if (password.length < 6) {
        setAuthLoading(false);
        setStatus({
          text: "পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।",
          success: false,
        });
        return;
      }
      const res = await signUp(name, email, password);
      setAuthLoading(false);
      if (!res.success) {
        setStatus({ text: res.message, success: false });
      } else {
        setStatus({
          text: "✅ রেজিস্ট্রেশন সফল! এখন বিষয় সিলেক্ট করে কোড নিন অথবা আপনার আনলক কোডটি লিখুন।",
          success: true,
        });
      }
    }
  };

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setLoading(true);
    setStatus(null);
    const res = await unlockWithCode(code.trim());
    setStatus({ text: res.message, success: res.success });
    setLoading(false);
    if (res.success) {
      setCode("");
      setSelectedToBuy([]);
      if (isModal && onClose) {
        setTimeout(() => onClose(), 1300);
      }
    }
  };

  return (
    <div className="bg-[#FAF9F6] text-[#141413] rounded-3xl shadow-[0_24px_70px_rgba(0,0,0,0.18)] border border-black/10 p-4 sm:p-6 relative max-w-md mx-auto w-full max-h-[92dvh] overflow-y-auto no-scrollbar">
      {/* Step 1: When NOT logged in — ONLY show Login / Registration prompt & form */}
      {!isLoggedIn ? (
        <>
          {isModal && onClose && (
            <button
              onClick={onClose}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-black/5 hover:bg-black/10 flex items-center justify-center transition cursor-pointer"
            >
              <X size={15} />
            </button>
          )}

          <div className="text-center mb-4 pt-1">
            <div className="w-10 h-10 rounded-full bg-[#141413] text-white flex items-center justify-center mx-auto mb-2.5">
              <Lock size={16} />
            </div>
            <h3 className="text-lg sm:text-xl font-serif font-black tracking-tight text-[#141413]">
              আনলক করতে রেজিস্ট্রেশন বা লগইন করুন
            </h3>
            <p className="text-[11px] opacity-60 mt-1">
              লগইন করার পর বিষয় সিলেক্ট ও আনলক কোড ব্যবহারের অপশন পাবেন
            </p>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-black/8 shadow-2xs">
            <div className="grid grid-cols-2 bg-[#FAF9F6] border border-black/6 p-1 rounded-full mb-3.5 text-xs font-bold">
              <button
                type="button"
                onClick={() => {
                  setAuthTab("login");
                  setStatus(null);
                }}
                className={`py-1.5 rounded-full transition cursor-pointer ${
                  authTab === "login"
                    ? "bg-[#141413] text-white shadow-xs"
                    : "text-[#141413]/60 hover:text-[#141413]"
                }`}
              >
                লগইন
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthTab("register");
                  setStatus(null);
                }}
                className={`py-1.5 rounded-full transition cursor-pointer ${
                  authTab === "register"
                    ? "bg-[#141413] text-white shadow-xs"
                    : "text-[#141413]/60 hover:text-[#141413]"
                }`}
              >
                রেজিস্ট্রেশন
              </button>
            </div>

            <form onSubmit={handleAuthSubmit} className="space-y-2.5">
              {authTab === "register" && (
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="আপনার নাম"
                  required
                  className="w-full bg-[#FAF9F6] border border-black/12 focus:border-[#141413] rounded-xl px-3.5 py-2.5 text-xs focus:outline-none transition"
                />
              )}

              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="আপনার ইমেইল"
                required
                className="w-full bg-[#FAF9F6] border border-black/12 focus:border-[#141413] rounded-xl px-3.5 py-2.5 text-xs focus:outline-none transition"
              />

              <div className="relative">
                <input
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={
                    authTab === "register"
                      ? "পাসওয়ার্ড (কমপক্ষে ৬ অক্ষর)"
                      : "পাসওয়ার্ড"
                  }
                  required
                  className="w-full bg-[#FAF9F6] border border-black/12 focus:border-[#141413] rounded-xl px-3.5 py-2.5 pr-9 text-xs focus:outline-none transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 opacity-45 hover:opacity-80 cursor-pointer"
                >
                  {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>

              <button
                type="submit"
                disabled={authLoading}
                className="w-full bg-[#141413] hover:opacity-90 text-white font-bold py-2.5 rounded-xl text-xs transition disabled:opacity-50 cursor-pointer"
              >
                {authLoading
                  ? "অপেক্ষা করুন..."
                  : authTab === "login"
                  ? "লগইন করুন"
                  : "রেজিস্ট্রেশন করুন"}
              </button>
            </form>
          </div>
        </>
      ) : (
        /* Step 2: AFTER Login / Registration — Clean Editorial Subject Selector + Code Input */
        <>
          {/* Compact Top Bar: User Info + Price Pill + Close */}
          <div className="flex items-center justify-between gap-2 pb-3 mb-3 border-b border-black/8">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-full bg-[#141413] text-white flex items-center justify-center text-[11px] font-bold shrink-0">
                {(profile?.displayName || profile?.email || "U")
                  .charAt(0)
                  .toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold truncate text-[#141413]">
                    {profile?.displayName || profile?.email || user?.email}
                  </span>
                  <span className="text-[10px] font-bold bg-black/6 text-[#141413] px-2 py-0.5 rounded-full shrink-0">
                    {unlockedSubjects.length}/৭ আনলকড
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={signOutUser}
                className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-black/5 hover:bg-black/10 text-[#141413]/75 hover:text-[#141413] flex items-center gap-1 transition cursor-pointer"
                title="লগআউট"
              >
                <LogOut size={11} />
                <span>লগআউট</span>
              </button>
              {isModal && onClose && (
                <button
                  onClick={onClose}
                  className="w-7 h-7 rounded-full bg-black/5 hover:bg-black/10 flex items-center justify-center transition cursor-pointer"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Editorial Title & Price Badge */}
          <div className="flex items-center justify-between gap-2 mb-3">
            <div>
              <h3 className="text-base sm:text-lg font-serif font-black tracking-tight text-[#141413]">
                {hasAllSubjectsUnlocked
                  ? "সকল ৭টি বিষয় আনলক করা আছে"
                  : title}
              </h3>
              <p className="text-[11px] opacity-60">
                পছন্দের বিষয় সিলেক্ট করে Telegram-এ পাঠান ও প্রাপ্ত কোড নিচে দিন
              </p>
            </div>
            <span className="shrink-0 bg-[#141413] text-white text-[11px] font-extrabold px-3 py-1 rounded-full">
              ৳৪৯ / বিষয়
            </span>
          </div>

          {/* Subject Selection List (All 7 visible cleanly without inner scrollbar) */}
          {!hasAllSubjectsUnlocked && (
            <div className="bg-white rounded-2xl p-3 border border-black/8 mb-3 shadow-2xs">
              <div className="flex items-center justify-between mb-2 px-0.5">
                <span className="text-[11px] font-bold opacity-65">
                  যে বিষয়গুলো আনলক করতে চান টিক দিন:
                </span>
                <button
                  type="button"
                  onClick={selectAllRemaining}
                  className="text-[11px] font-bold text-[#141413] underline underline-offset-2 opacity-75 hover:opacity-100 cursor-pointer"
                >
                  {selectedToBuy.length ===
                  CHAPTERS.length - unlockedSubjects.length
                    ? "আনসিলেক্ট"
                    : "সব সিলেক্ট"}
                </button>
              </div>

              <div className="space-y-1 mb-3">
                {CHAPTERS.map((ch) => {
                  const isAlreadyUnlocked = unlockedSubjects.includes(ch.id);
                  const isSelected = selectedToBuy.includes(ch.id);
                  const cleanTitle = ch.titleBn.replace(/^[০-৯1-9]+\.\s*/, "");

                  return (
                    <button
                      key={ch.id}
                      type="button"
                      disabled={isAlreadyUnlocked}
                      onClick={() => toggleSelectSubject(ch.id)}
                      className={`w-full text-left px-2.5 py-1.5 rounded-xl border text-xs flex items-center justify-between gap-2 transition cursor-pointer ${
                        isAlreadyUnlocked
                          ? "bg-emerald-500/[0.06] border-emerald-500/20 text-emerald-900 cursor-default"
                          : isSelected
                          ? "bg-[#FAF9F6] border-[#141413] text-[#141413] shadow-2xs"
                          : "bg-transparent hover:bg-[#FAF9F6] border-black/6 text-[#141413]/75"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className={`w-4 h-4 rounded-md flex items-center justify-center shrink-0 border transition ${
                            isAlreadyUnlocked
                              ? "bg-emerald-600 border-emerald-600 text-white"
                              : isSelected
                              ? "bg-[#141413] border-[#141413] text-white"
                              : "border-black/20 bg-white"
                          }`}
                        >
                          {(isAlreadyUnlocked || isSelected) && (
                            <Check size={10} strokeWidth={3} />
                          )}
                        </div>
                        <span className="text-[10px] font-mono font-bold bg-black/5 px-1.5 py-0.5 rounded text-[#141413]/70 shrink-0">
                          {ch.courseCode}
                        </span>
                        <span
                          className={`truncate text-[12px] ${
                            isSelected || isAlreadyUnlocked
                              ? "font-bold text-[#141413]"
                              : "font-medium"
                          }`}
                        >
                          বই {ch.bookNumber}: {cleanTitle}
                        </span>
                      </div>

                      <span className="shrink-0 text-[10px] font-mono font-bold">
                        {isAlreadyUnlocked ? (
                          <span className="inline-flex items-center gap-0.5 text-emerald-700 font-sans">
                            <Unlock size={10} /> আনলকড
                          </span>
                        ) : (
                          <span
                            className={
                              isSelected ? "text-[#141413]" : "opacity-50"
                            }
                          >
                            {isOffer ? (
                              <span>
                                <span className="line-through text-gray-400 mr-0.5">৳{regularPrice}</span>
                                <span className="text-emerald-700 font-bold">৳{offerPrice}</span>
                              </span>
                            ) : (
                              `৳${regularPrice}`
                            )}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Integrated Summary + Dynamic Contact Button(s) */}
              <div className="pt-2.5 border-t border-black/6 flex items-center justify-between gap-2 flex-wrap">
                <div className="text-xs">
                  <span className="opacity-60">সিলেক্টেড: </span>
                  <span className="font-bold">{selectedToBuy.length}টি</span>
                  <span className="mx-1.5 opacity-30">•</span>
                  <span className="font-extrabold text-[#141413]">
                    মোট ৳{totalCost}
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  {(settings.contactChannel === "telegram" ||
                    settings.contactChannel === "both" ||
                    !settings.contactChannel) && (
                    <a
                      href={buildTelegramPurchaseUrl()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-[#229ED9] hover:opacity-90 text-white font-bold py-1.5 px-3 rounded-full flex items-center gap-1 text-[11px] transition shrink-0"
                    >
                      <MessageCircle size={12} />
                      <span>Telegram</span>
                    </a>
                  )}

                  {(settings.contactChannel === "whatsapp" ||
                    settings.contactChannel === "both") && (
                    <a
                      href={buildWhatsAppPurchaseUrl()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-[#25D366] hover:opacity-90 text-white font-bold py-1.5 px-3 rounded-full flex items-center gap-1 text-[11px] transition shrink-0"
                    >
                      <MessageCircle size={12} />
                      <span>WhatsApp</span>
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Sleek Inline Unlock Code Input + Submit Button */}
          <form
            onSubmit={handleUnlock}
            className="bg-white border border-black/15 focus-within:border-[#141413] rounded-full p-1.5 flex items-center gap-1.5 shadow-2xs transition"
          >
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="আনলক কোড লিখুন (ABCD-1234)"
              maxLength={16}
              className="flex-1 min-w-0 bg-transparent px-3.5 py-1.5 font-mono font-bold text-xs sm:text-sm uppercase tracking-wider focus:outline-none text-[#141413] placeholder:font-sans placeholder:font-normal placeholder:tracking-normal placeholder:text-black/40"
            />
            <button
              type="submit"
              disabled={loading || !code.trim()}
              className="bg-[#141413] hover:opacity-90 text-white font-bold px-4 py-2 rounded-full text-xs transition disabled:opacity-35 cursor-pointer shrink-0 flex items-center gap-1.5"
            >
              <CheckCircle2 size={14} />
              <span>{loading ? "যাচাই..." : "আনলক করুন"}</span>
            </button>
          </form>
        </>
      )}

      {status && (
        <div
          className={`mt-2.5 p-2.5 rounded-2xl text-xs font-medium text-center ${
            status.success
              ? "bg-emerald-500/10 text-emerald-900"
              : "bg-red-500/10 text-red-700"
          }`}
        >
          {status.text}
        </div>
      )}
    </div>
  );
}

export default function UnlockModal() {
  const {
    showUnlockModal,
    setShowUnlockModal,
    sessionAlertMessage,
    clearSessionAlert,
  } = useAuth();

  return (
    <>
      {/* Single Active Session Auto-Logout Notification Modal */}
      {sessionAlertMessage && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FAF9F6] text-[#141413] rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-black/10 text-center space-y-3">
            <div className="w-11 h-11 rounded-full bg-amber-500/15 text-amber-700 flex items-center justify-center mx-auto">
              <AlertTriangle size={22} />
            </div>
            <h3 className="text-base font-extrabold">সেশন লগআউট হয়েছে</h3>
            <p className="text-xs opacity-70 leading-relaxed">
              {sessionAlertMessage}
            </p>
            <button
              onClick={clearSessionAlert}
              className="w-full bg-[#111111] text-white font-bold py-2.5 rounded-full text-xs cursor-pointer"
            >
              ঠিক আছে
            </button>
          </div>
        </div>
      )}

      {/* Main Unlock Popup Modal */}
      {showUnlockModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <UnlockCard isModal onClose={() => setShowUnlockModal(false)} />
        </div>
      )}
    </>
  );
}
