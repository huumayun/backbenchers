"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { CHAPTERS } from "@/lib/book/chapters";
import {
  Copy,
  RefreshCw,
  CheckCircle,
  Key,
  Shield,
  Trash2,
  RotateCcw,
  Save,
  Settings,
  Lock,
  ChevronLeft,
  Check,
  BookOpen,
  DollarSign,
  Tag,
  MessageCircle,
  Send,
  Users,
  Search,
  Filter,
  BarChart3,
  Sparkles,
  ExternalLink,
  LogOut,
  AlertCircle,
  CheckCircle2,
  Clock,
  Layers,
  HelpCircle,
  Info,
  Phone,
} from "lucide-react";
import {
  buildSmartWhatsAppUrl,
  buildSmartTelegramUrl,
  openExternalUrl,
} from "@/lib/contactUtils";

interface CodeRecord {
  code: string;
  used: boolean;
  assignedSubjectIds?: string[];
  usedByUid?: string | null;
  usedByEmail?: string | null;
  usedByDevice?: string | null;
  usedByIP?: string | null;
  note?: string;
  createdAt: string;
  usedAt?: string | null;
}

interface SiteSettingsForm {
  price: string;
  regularPrice: number;
  offerPrice: number;
  isOfferActive: boolean;
  contactChannel: "telegram" | "whatsapp" | "both";
  paymentMethods: string;
  whatsappNumber: string;
  contactWhatsApp: string;
  telegramUsername: string;
  contactTelegram: string;
  freePagesLimit: number;
  announcement: string;
}

const ALL_SUBJECT_IDS = CHAPTERS.map((c) => c.id);

type AdminTab =
  | "overview"
  | "pricing"
  | "channels"
  | "codes"
  | "users"
  | "security";

export default function AdminPage() {
  const [secret, setSecret] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [authError, setAuthError] = useState("");
  const [codes, setCodes] = useState<CodeRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");

  // Code Generator State
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([
    ...ALL_SUBJECT_IDS,
  ]);
  const [genCount, setGenCount] = useState(1);
  const [customCode, setCustomCode] = useState("");
  const [buyerNote, setBuyerNote] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");
  const [newCodes, setNewCodes] = useState<string[]>([]);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Search & Filter State for Codes Tab
  const [codeSearch, setCodeSearch] = useState("");
  const [codeFilterStatus, setCodeFilterStatus] = useState<
    "all" | "unused" | "used"
  >("all");
  const [codeFilterSubject, setCodeFilterSubject] = useState<string>("all");

  // Settings State
  const [settingsForm, setSettingsForm] = useState<SiteSettingsForm>({
    price: "৳৪৯ (প্রতি বিষয়)",
    regularPrice: 49,
    offerPrice: 39,
    isOfferActive: false,
    contactChannel: "both",
    paymentMethods: "বিকাশ / নগদ (Personal Send Money): 017XX-XXXXXX",
    whatsappNumber: "017XX-XXXXXX",
    contactWhatsApp: "https://wa.me/8801700000000",
    telegramUsername: "@your_telegram_username",
    contactTelegram: "https://t.me/your_telegram_username",
    freePagesLimit: 2,
    announcement:
      "আপনার পছন্দের বিষয় সিলেক্ট করে মেসেজ পাঠিয়ে আনলক কোড নিন।",
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSavedMsg, setSettingsSavedMsg] = useState("");

  // Admin Password Change State
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const fetchAdminData = useCallback(async (adminKey: string) => {
    setLoading(true);
    setAuthError("");
    try {
      const res = await fetch(
        `/api/admin/codes?secret=${encodeURIComponent(adminKey)}`
      );
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || "পাসওয়ার্ড সঠিক নয়।");
        setAuthenticated(false);
      } else {
        setCodes(data.codes || []);
        if (data.settings) {
          setSettingsForm((prev) => ({
            ...prev,
            ...data.settings,
            regularPrice: data.settings.regularPrice ?? 49,
            offerPrice: data.settings.offerPrice ?? 39,
            isOfferActive: Boolean(data.settings.isOfferActive === true),
            contactChannel: data.settings.contactChannel || "both",
          }));
        }
        setAuthenticated(true);
        sessionStorage.setItem("ebook_admin_secret", adminKey);
      }
    } catch {
      setAuthError("সার্ভারের সাথে সংযোগ করা যায়নি।");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const saved = sessionStorage.getItem("ebook_admin_secret");
    if (saved) {
      setSecret(saved);
      fetchAdminData(saved);
    }
  }, [fetchAdminData]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!secret.trim()) return;
    fetchAdminData(secret.trim());
  };

  const handleAdminLogout = () => {
    sessionStorage.removeItem("ebook_admin_secret");
    setAuthenticated(false);
    setSecret("");
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMsg(null);
    const trimmed = newPassword.trim();

    if (trimmed.length < 4) {
      setPasswordMsg({
        type: "error",
        text: "নতুন পাসওয়ার্ড কমপক্ষে ৪ অক্ষরের হতে হবে।",
      });
      return;
    }

    if (trimmed !== confirmPassword.trim()) {
      setPasswordMsg({
        type: "error",
        text: "দুটি পাসওয়ার্ড মিলছে না। আবার চেক করুন।",
      });
      return;
    }

    setChangingPassword(true);
    try {
      const res = await fetch("/api/admin/codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret,
          action: "change_password",
          newPassword: trimmed,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSecret(trimmed);
        sessionStorage.setItem("ebook_admin_secret", trimmed);
        setNewPassword("");
        setConfirmPassword("");
        setPasswordMsg({
          type: "success",
          text: data.message || "✅ অ্যাডমিন পাসওয়ার্ড সফলভাবে পরিবর্তন হয়েছে!",
        });
      } else {
        setPasswordMsg({
          type: "error",
          text: data.error || "পাসওয়ার্ড পরিবর্তন করা যায়নি।",
        });
      }
    } catch {
      setPasswordMsg({
        type: "error",
        text: "সার্ভারের সাথে সংযোগ করা যায়নি।",
      });
    } finally {
      setChangingPassword(false);
    }
  };

  const toggleSubjectSelection = (subjectId: string) => {
    setGenError("");
    setSelectedSubjectIds((prev) =>
      prev.includes(subjectId)
        ? prev.filter((id) => id !== subjectId)
        : [...prev, subjectId]
    );
  };

  const selectAllSubjects = () => {
    setGenError("");
    if (selectedSubjectIds.length === ALL_SUBJECT_IDS.length) {
      setSelectedSubjectIds([]);
    } else {
      setSelectedSubjectIds([...ALL_SUBJECT_IDS]);
    }
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenError("");

    if (selectedSubjectIds.length === 0) {
      setGenError("কোড তৈরি করতে কমপক্ষে ১টি বিষয় (Subject) সিলেক্ট করুন।");
      return;
    }

    setGenerating(true);
    try {
      const res = await fetch("/api/admin/codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret,
          action: "generate",
          count: genCount,
          customCode: customCode.trim() || undefined,
          note: buyerNote.trim() || undefined,
          assignedSubjectIds: selectedSubjectIds,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setNewCodes(data.newCodes || []);
        setCodes(data.codes || []);
        setCustomCode("");
        setBuyerNote("");
      } else {
        setGenError(data.error || "কোড তৈরি করা যায়নি।");
      }
    } finally {
      setGenerating(false);
    }
  };

  const handleResetCode = async (code: string) => {
    const res = await fetch("/api/admin/codes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, action: "reset", code }),
    });
    const data = await res.json();
    if (data.success) setCodes(data.codes || []);
  };

  const handleDeleteCode = async (code: string) => {
    if (!confirm(`আপনি কি নিশ্চিত কোডটি মুছে ফেলতে চান: ${code}?`)) return;
    const res = await fetch("/api/admin/codes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, action: "delete", code }),
    });
    const data = await res.json();
    if (data.success) setCodes(data.codes || []);
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setSettingsSavedMsg("");
    try {
      const payload = {
        ...settingsForm,
        regularPrice: Number(settingsForm.regularPrice) || 49,
        offerPrice: Number(settingsForm.offerPrice) || 39,
        price: `৳${settingsForm.isOfferActive ? settingsForm.offerPrice : settingsForm.regularPrice} (প্রতি বিষয়)`,
      };

      const res = await fetch("/api/admin/codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret,
          action: "settings",
          settings: payload,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSettingsSavedMsg("✅ সেটিংস সফলভাবে সেভ ও আপডেট হয়েছে!");
        setTimeout(() => setSettingsSavedMsg(""), 3500);
      }
    } finally {
      setSavingSettings(false);
    }
  };

  const copyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const formatAssignedSubjectsText = (subjectIds?: string[]) => {
    const ids =
      Array.isArray(subjectIds) && subjectIds.length > 0
        ? subjectIds
        : ALL_SUBJECT_IDS;
    if (ids.length === ALL_SUBJECT_IDS.length) {
      return "সকল ৭টি বই";
    }
    return ids
      .map((id) => {
        const ch = CHAPTERS.find((c) => c.id === id);
        return ch ? `বই ${ch.bookNumber}` : id;
      })
      .join(", ");
  };

  // Metrics Calculations
  const totalCodesCount = codes.length;
  const usedCodesCount = codes.filter((c) => c.used).length;
  const unusedCodesCount = totalCodesCount - usedCodesCount;
  const unitPrice = settingsForm.isOfferActive
    ? settingsForm.offerPrice
    : settingsForm.regularPrice;
  const estimatedRevenue = usedCodesCount * unitPrice;

  // Filtered Codes
  const filteredCodes = useMemo(() => {
    return codes.filter((c) => {
      if (codeFilterStatus === "unused" && c.used) return false;
      if (codeFilterStatus === "used" && !c.used) return false;
      if (codeFilterSubject !== "all") {
        const ids = c.assignedSubjectIds || ALL_SUBJECT_IDS;
        if (!ids.includes(codeFilterSubject)) return false;
      }
      if (codeSearch.trim()) {
        const q = codeSearch.trim().toLowerCase();
        const codeMatch = c.code.toLowerCase().includes(q);
        const emailMatch = (c.usedByEmail || "").toLowerCase().includes(q);
        const noteMatch = (c.note || "").toLowerCase().includes(q);
        if (!codeMatch && !emailMatch && !noteMatch) return false;
      }
      return true;
    });
  }, [codes, codeFilterStatus, codeFilterSubject, codeSearch]);

  // Unique Users List from Redeemed Codes
  const usersList = useMemo(() => {
    const map = new Map<
      string,
      {
        email: string;
        uid?: string;
        codesUsed: string[];
        unlockedCount: number;
        lastActive?: string;
      }
    >();

    codes
      .filter((c) => c.used && c.usedByEmail)
      .forEach((c) => {
        const email = c.usedByEmail!;
        const existing = map.get(email) || {
          email,
          uid: c.usedByUid || undefined,
          codesUsed: [],
          unlockedCount: 0,
          lastActive: c.usedAt || c.createdAt,
        };
        existing.codesUsed.push(c.code);
        const count = (c.assignedSubjectIds || ALL_SUBJECT_IDS).length;
        existing.unlockedCount = Math.max(existing.unlockedCount, count);
        map.set(email, existing);
      });

    return Array.from(map.values());
  }, [codes]);

  // LOGIN SCREEN (if not authenticated)
  if (!authenticated) {
    return (
      <div className="min-h-dvh bg-[#FAF9F6] text-[#141413] flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white border border-black/10 rounded-3xl p-6 sm:p-8 shadow-xl text-center">
          <div className="w-14 h-14 rounded-2xl bg-[#141413] text-white flex items-center justify-center mx-auto mb-4 shadow-md">
            <Shield size={26} />
          </div>
          <h1 className="font-serif font-black text-2xl text-[#141413] tracking-tight">
            অ্যাডমিন প্যানেল
          </h1>
          <p className="text-xs text-gray-500 mt-1 mb-6">
            Backbencher ম্যানেজমেন্ট ও কন্ট্রোল পোর্টাল
          </p>

          <form onSubmit={handleLogin} className="space-y-4 text-left">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">
                অ্যাডমিন পাসওয়ার্ড লিখুন
              </label>
              <input
                type="password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder="••••••••••••"
                required
                className="w-full px-4 py-3 rounded-2xl border border-gray-300 focus:outline-black text-sm bg-[#FAF9F6]"
              />
            </div>

            {authError && (
              <div className="p-3 rounded-2xl bg-red-50 border border-red-200 text-xs text-red-600 font-bold flex items-center gap-2">
                <AlertCircle size={15} />
                <span>{authError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-2xl bg-[#141413] text-white font-bold text-sm hover:opacity-90 transition active:scale-98 cursor-pointer disabled:opacity-50"
            >
              {loading ? "ভেরিফাই হচ্ছে..." : "লগইন করুন →"}
            </button>

            <div className="text-center pt-2">
              <Link
                href="/"
                className="text-xs text-gray-500 hover:text-gray-900 inline-flex items-center gap-1 font-semibold"
              >
                <ChevronLeft size={14} /> হোম পেজে ফিরে যান
              </Link>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // AUTHENTICATED ADMIN DASHBOARD
  return (
    <div className="min-h-dvh bg-[#F8F9FA] text-[#141413] pb-24 selection:bg-black selection:text-white">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-gray-200 px-4 sm:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#141413] text-white flex items-center justify-center font-serif font-black text-lg shadow-sm">
            B
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-serif font-black text-base sm:text-lg text-gray-900 leading-none">
                Backbencher Admin
              </h1>
              <span className="text-[10px] font-mono bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                Active
              </span>
            </div>
            <p className="text-[11px] text-gray-500 hidden sm:block">
              বোটানি ৩য় বর্ষ • সেন্ট্রাল ম্যানেজমেন্ট হাব
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchAdminData(secret)}
            disabled={loading}
            className="p-2 rounded-xl border border-gray-200 hover:bg-gray-100 transition cursor-pointer text-gray-700"
            title="রিফ্রেশ করুন"
          >
            <RefreshCw
              size={15}
              className={loading ? "animate-spin text-black" : ""}
            />
          </button>
          <Link
            href="/"
            className="px-3.5 py-1.5 rounded-xl border border-gray-200 hover:bg-gray-100 font-bold text-xs flex items-center gap-1.5 text-gray-700 transition"
          >
            <ExternalLink size={13} />
            <span className="hidden sm:inline">ওয়েবসাইটে যান</span>
          </Link>
          <button
            onClick={handleAdminLogout}
            className="px-3.5 py-1.5 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
          >
            <LogOut size={13} />
            <span className="hidden sm:inline">লগআউট</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-6">
        {/* Navigation Tabs Bar */}
        <div className="bg-white border border-gray-200 rounded-2xl p-1.5 shadow-xs mb-6 overflow-x-auto no-scrollbar flex items-center gap-1">
          <button
            onClick={() => setActiveTab("overview")}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 whitespace-nowrap transition cursor-pointer ${
              activeTab === "overview"
                ? "bg-[#141413] text-white shadow-xs"
                : "text-gray-600 hover:text-black hover:bg-gray-50"
            }`}
          >
            <BarChart3 size={15} />
            <span>ওভারভিউ ও মেট্রিক্স</span>
          </button>

          <button
            onClick={() => setActiveTab("pricing")}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 whitespace-nowrap transition cursor-pointer ${
              activeTab === "pricing"
                ? "bg-[#141413] text-white shadow-xs"
                : "text-gray-600 hover:text-black hover:bg-gray-50"
            }`}
          >
            <DollarSign size={15} />
            <span>প্রাইসিং ও অফার</span>
            {settingsForm.isOfferActive && (
              <span className="w-2 h-2 rounded-full bg-amber-400" />
            )}
          </button>

          <button
            onClick={() => setActiveTab("channels")}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 whitespace-nowrap transition cursor-pointer ${
              activeTab === "channels"
                ? "bg-[#141413] text-white shadow-xs"
                : "text-gray-600 hover:text-black hover:bg-gray-50"
            }`}
          >
            <MessageCircle size={15} />
            <span>যোগাযোগ মাধ্যম</span>
          </button>

          <button
            onClick={() => setActiveTab("codes")}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 whitespace-nowrap transition cursor-pointer ${
              activeTab === "codes"
                ? "bg-[#141413] text-white shadow-xs"
                : "text-gray-600 hover:text-black hover:bg-gray-50"
            }`}
          >
            <Key size={15} />
            <span>কোড ম্যানেজার ({totalCodesCount})</span>
          </button>

          <button
            onClick={() => setActiveTab("users")}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 whitespace-nowrap transition cursor-pointer ${
              activeTab === "users"
                ? "bg-[#141413] text-white shadow-xs"
                : "text-gray-600 hover:text-black hover:bg-gray-50"
            }`}
          >
            <Users size={15} />
            <span>ইউজার তালিকা ({usersList.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("security")}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 whitespace-nowrap transition cursor-pointer ${
              activeTab === "security"
                ? "bg-[#141413] text-white shadow-xs"
                : "text-gray-600 hover:text-black hover:bg-gray-50"
            }`}
          >
            <Settings size={15} />
            <span>সেটিংস ও সিকিউরিটি</span>
          </button>
        </div>

        {/* ============================================================== */}
        {/* TAB 1: OVERVIEW & DASHBOARD */}
        {/* ============================================================== */}
        {activeTab === "overview" && (
          <div className="space-y-6 animate-in fade-in duration-150">
            {/* KPI Cards Row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs">
                <div className="flex items-center justify-between text-gray-500 mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider">
                    মোট কোড জেনারেট
                  </span>
                  <Key size={17} className="text-gray-400" />
                </div>
                <div className="font-serif font-black text-2xl sm:text-3xl text-gray-900">
                  {totalCodesCount}
                </div>
                <p className="text-[11px] text-gray-500 mt-1">সব কোডের মোট সংখ্যা</p>
              </div>

              <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs">
                <div className="flex items-center justify-between text-gray-500 mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider">
                    অব্যবহৃত কোড
                  </span>
                  <CheckCircle size={17} className="text-emerald-500" />
                </div>
                <div className="font-serif font-black text-2xl sm:text-3xl text-emerald-600">
                  {unusedCodesCount}
                </div>
                <p className="text-[11px] text-gray-500 mt-1">
                  শিক্ষার্থীদের দেওয়ার জন্য প্রস্তুত
                </p>
              </div>

              <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs">
                <div className="flex items-center justify-between text-gray-500 mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider">
                    ব্যবহৃত / একটিভ
                  </span>
                  <Users size={17} className="text-blue-500" />
                </div>
                <div className="font-serif font-black text-2xl sm:text-3xl text-blue-600">
                  {usedCodesCount}
                </div>
                <p className="text-[11px] text-gray-500 mt-1">
                  শিক্ষার্থীরা আনলক করেছে
                </p>
              </div>

              <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs">
                <div className="flex items-center justify-between text-gray-500 mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider">
                    আনুমানিক আয়
                  </span>
                  <DollarSign size={17} className="text-amber-500" />
                </div>
                <div className="font-serif font-black text-2xl sm:text-3xl text-gray-900">
                  ৳{estimatedRevenue}
                </div>
                <p className="text-[11px] text-gray-500 mt-1">
                  বর্তমান রেট: ৳{unitPrice}/বিষয়
                </p>
              </div>
            </div>

            {/* Quick Action Hub */}
            <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-xs">
              <h2 className="font-serif font-black text-base text-gray-900 mb-4 flex items-center gap-2">
                <Sparkles size={16} className="text-amber-500" />
                <span>কুইক অ্যাকশন ও শর্টকাট</span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button
                  onClick={() => setActiveTab("codes")}
                  className="p-4 rounded-2xl bg-gray-50 hover:bg-gray-100 border border-gray-200 text-left transition cursor-pointer"
                >
                  <Key size={18} className="text-gray-900 mb-2" />
                  <h3 className="font-bold text-xs text-gray-900">
                    নতুন কোড তৈরি করুন
                  </h3>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    একক বা একাধিক বিষয়ের জন্য কোড জেনারেট
                  </p>
                </button>

                <button
                  onClick={() => setActiveTab("pricing")}
                  className="p-4 rounded-2xl bg-amber-50/50 hover:bg-amber-50 border border-amber-200 text-left transition cursor-pointer"
                >
                  <Tag size={18} className="text-amber-700 mb-2" />
                  <h3 className="font-bold text-xs text-amber-950">
                    প্রাইস ও অফার চেঞ্জ করুন
                  </h3>
                  <p className="text-[11px] text-amber-900/70 mt-0.5">
                    বর্তমানে ৳{settingsForm.offerPrice} অফার সক্রিয় আছে
                  </p>
                </button>

                <button
                  onClick={() => setActiveTab("channels")}
                  className="p-4 rounded-2xl bg-blue-50/50 hover:bg-blue-50 border border-blue-200 text-left transition cursor-pointer"
                >
                  <MessageCircle size={18} className="text-blue-700 mb-2" />
                  <h3 className="font-bold text-xs text-blue-950">
                    Telegram/WhatsApp আইডি পরিবর্তন
                  </h3>
                  <p className="text-[11px] text-blue-900/70 mt-0.5">
                    সাপোর্ট চ্যানেল ও যোগাযোগের লিঙ্ক আপডেট
                  </p>
                </button>
              </div>
            </div>

            {/* Recent Redeemed Log */}
            <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-xs">
              <h2 className="font-serif font-black text-base text-gray-900 mb-4 flex items-center gap-2">
                <Clock size={16} className="text-gray-500" />
                <span>সাম্প্রতিক অ্যাক্টিভেশন হিস্ট্রি</span>
              </h2>
              {codes.filter((c) => c.used).length === 0 ? (
                <p className="text-xs text-gray-400 py-6 text-center">
                  এখনো কোনো কোড ব্যবহৃত হয়নি।
                </p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {codes
                    .filter((c) => c.used)
                    .slice(0, 5)
                    .map((c) => (
                      <div
                        key={c.code}
                        className="py-3 flex items-center justify-between gap-3 text-xs"
                      >
                        <div>
                          <span className="font-mono font-bold text-gray-900">
                            {c.code}
                          </span>
                          <span className="text-gray-400 mx-2">•</span>
                          <span className="text-gray-600 font-medium">
                            {c.usedByEmail || "অজানা ইউজার"}
                          </span>
                          <div className="text-[11px] text-gray-400 mt-0.5">
                            {formatAssignedSubjectsText(c.assignedSubjectIds)}
                          </div>
                        </div>
                        <span className="text-[11px] text-gray-400 font-mono">
                          {c.usedAt
                            ? new Date(c.usedAt).toLocaleString("bn-BD")
                            : "ব্যবহৃত"}
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 2: PRICING & OFFERS */}
        {/* ============================================================== */}
        {activeTab === "pricing" && (
          <div className="max-w-2xl bg-white border border-gray-200 rounded-3xl p-6 sm:p-8 shadow-xs animate-in fade-in duration-150">
            <div className="flex items-center gap-2.5 mb-2">
              <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-700 flex items-center justify-center">
                <Tag size={18} />
              </div>
              <div>
                <h2 className="font-serif font-black text-lg text-gray-900 leading-tight">
                  প্রাইসিং ও অফার সেটিংস
                </h2>
                <p className="text-xs text-gray-500">
                  প্রতি বিষয়ের রেগুলার ও ডিসকাউন্ট অফার মূল্য নিয়ন্ত্রণ করুন
                </p>
              </div>
            </div>

            {settingsSavedMsg && (
              <div className="my-4 p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-bold flex items-center gap-2">
                <CheckCircle2 size={16} />
                <span>{settingsSavedMsg}</span>
              </div>
            )}

            <form onSubmit={handleSaveSettings} className="space-y-5 mt-6">
              {/* Regular Price & Offer Price Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5">
                    রেগুলার প্রাইস (টাকা)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-3 text-sm font-bold text-gray-400">
                      ৳
                    </span>
                    <input
                      type="number"
                      required
                      min={1}
                      value={settingsForm.regularPrice}
                      onChange={(e) =>
                        setSettingsForm({
                          ...settingsForm,
                          regularPrice: parseInt(e.target.value, 10) || 0,
                        })
                      }
                      className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-gray-300 focus:outline-black text-sm font-mono font-bold"
                    />
                  </div>
                  <span className="text-[11px] text-gray-400 mt-1 block">
                    অফার না থাকলে এই দামটি দেখাবে (ডিফল্ট: ৪৯)
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5">
                    অফার / ডিসকাউন্ট প্রাইস (টাকা)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-3 text-sm font-bold text-emerald-600">
                      ৳
                    </span>
                    <input
                      type="number"
                      required
                      min={1}
                      value={settingsForm.offerPrice}
                      onChange={(e) =>
                        setSettingsForm({
                          ...settingsForm,
                          offerPrice: parseInt(e.target.value, 10) || 0,
                        })
                      }
                      className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-gray-300 focus:outline-black text-sm font-mono font-bold text-emerald-700"
                    />
                  </div>
                  <span className="text-[11px] text-gray-400 mt-1 block">
                    ডিসকাউন্ট অফার চালু থাকলে এই রেট কার্যকর হবে (ডিফল্ট: ৩৯)
                  </span>
                </div>
              </div>

              {/* Offer Active Switch */}
              <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-gray-900">
                    ডিসকাউন্ট অফার চালু রাখুন
                  </h4>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    চালু থাকলে ইউজাররা কাটা দাগ দিয়ে অফার মূল্য দেখতে পাবে
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settingsForm.isOfferActive}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        isOfferActive: e.target.checked,
                      })
                    }
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600" />
                </label>
              </div>

              {/* Live Preview Card */}
              <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-200">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 block mb-1">
                  অ্যাপে ইউজার যা দেখতে পাবে (লাইভ প্রিভিউ):
                </span>
                <div className="flex items-center gap-3">
                  {settingsForm.isOfferActive ? (
                    <div className="flex items-center gap-2">
                      <span className="line-through text-gray-400 text-sm font-mono">
                        ৳{settingsForm.regularPrice}
                      </span>
                      <span className="font-serif font-black text-xl text-emerald-700 font-mono">
                        ৳{settingsForm.offerPrice}
                      </span>
                      <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                        {settingsForm.regularPrice - settingsForm.offerPrice} টাকা
                        ছাড়!
                      </span>
                    </div>
                  ) : (
                    <span className="font-serif font-black text-xl text-gray-900 font-mono">
                      ৳{settingsForm.regularPrice}
                    </span>
                  )}
                  <span className="text-xs text-gray-500">• প্রতি বিষয়</span>
                </div>
              </div>

              {/* Payment Methods */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">
                  পেমেন্ট পদ্ধতি ও অ্যাকাউন্ট ডিটেইলস
                </label>
                <textarea
                  rows={2}
                  required
                  value={settingsForm.paymentMethods}
                  onChange={(e) =>
                    setSettingsForm({
                      ...settingsForm,
                      paymentMethods: e.target.value,
                    })
                  }
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-300 focus:outline-black text-xs leading-relaxed"
                />
              </div>

              <button
                type="submit"
                disabled={savingSettings}
                className="w-full py-3 rounded-2xl bg-[#141413] text-white font-bold text-xs sm:text-sm hover:opacity-90 transition active:scale-98 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Save size={15} />
                <span>
                  {savingSettings ? "সেভ হচ্ছে..." : "প্রাইসিং সেটিংস সেভ করুন"}
                </span>
              </button>
            </form>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 3: CONTACT CHANNELS */}
        {/* ============================================================== */}
        {activeTab === "channels" && (() => {
          const previewTelegramUrl = buildSmartTelegramUrl(
            settingsForm.contactTelegram || settingsForm.telegramUsername,
            "আসসালামু আলাইকুম, এটি ব্যাকবেঞ্চার অ্যাডমিন প্যানেল থেকে টেস্ট মেসেজ।"
          );

          const previewWhatsAppUrl = buildSmartWhatsAppUrl(
            settingsForm.contactWhatsApp || settingsForm.whatsappNumber,
            "আসসালামু আলাইকুম, এটি ব্যাকবেঞ্চার অ্যাডমিন প্যানেল থেকে টেস্ট মেসেজ।"
          );

          return (
            <div className="max-w-2xl bg-white border border-gray-200 rounded-3xl p-6 sm:p-8 shadow-xs animate-in fade-in duration-150">
              <div className="flex items-center gap-2.5 mb-2">
                <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-700 flex items-center justify-center">
                  <MessageCircle size={18} />
                </div>
                <div>
                  <h2 className="font-serif font-black text-lg text-gray-900 leading-tight">
                    যোগাযোগ ও সাপোর্ট মাধ্যম
                  </h2>
                  <p className="text-xs text-gray-500">
                    কোন মাধ্যমে ইউজার কোড নেওয়ার জন্য যোগাযোগ করবে তা নিয়ন্ত্রণ ও টেস্ট করুন
                  </p>
                </div>
              </div>

              {settingsSavedMsg && (
                <div className="my-4 p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-bold flex items-center gap-2">
                  <CheckCircle2 size={16} />
                  <span>{settingsSavedMsg}</span>
                </div>
              )}

              {/* Guidelines / Helper Card */}
              <div className="my-5 p-4 rounded-2xl bg-gradient-to-br from-blue-50/70 to-indigo-50/50 border border-blue-200/80 text-xs text-gray-700 space-y-2.5">
                <div className="flex items-center gap-2 text-blue-900 font-bold text-xs">
                  <Info size={16} className="text-blue-600 shrink-0" />
                  <span>কীভাবে সঠিক নম্বর বা লিংক যুক্ত করবেন? (সহজ গাইডলাইন)</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1 text-[11px] leading-relaxed">
                  <div className="p-2.5 rounded-xl bg-white/80 border border-blue-100 space-y-1">
                    <span className="font-bold text-emerald-700 flex items-center gap-1">
                      <MessageCircle size={13} /> WhatsApp / WhatsApp Business:
                    </span>
                    <ul className="list-disc list-inside space-y-0.5 text-gray-600">
                      <li>
                        <strong>সাধারণ নম্বর:</strong> <code className="bg-gray-100 px-1 py-0.5 rounded text-gray-800 font-mono">017XXXXXXXX</code> বা <code className="bg-gray-100 px-1 py-0.5 rounded text-gray-800 font-mono">+88017...</code> লিখলে স্বয়ংক্রিয়ভাবে আন্তর্জাতিক লিংকে রূপান্তর হবে।
                      </li>
                      <li>
                        <strong>WhatsApp Business লিঙ্ক:</strong> আপনার বিজনেস লিংক <code className="bg-gray-100 px-1 py-0.5 rounded text-gray-800 font-mono">wa.me/message/XXXX</code> বা <code className="bg-gray-100 px-1 py-0.5 rounded text-gray-800 font-mono">https://wa.me/message/...</code> সরাসরি দিন। কোনো অক্ষর মুছে যাবে না।
                      </li>
                    </ul>
                  </div>

                  <div className="p-2.5 rounded-xl bg-white/80 border border-blue-100 space-y-1">
                    <span className="font-bold text-[#229ED9] flex items-center gap-1">
                      <Send size={13} /> Telegram:
                    </span>
                    <ul className="list-disc list-inside space-y-0.5 text-gray-600">
                      <li>
                        <strong>ইউজারনেম:</strong> <code className="bg-gray-100 px-1 py-0.5 rounded text-gray-800 font-mono">@your_username</code> বা শুধু <code className="bg-gray-100 px-1 py-0.5 rounded text-gray-800 font-mono">username</code> লিখুন।
                      </li>
                      <li>
                        <strong>সরাসরি লিঙ্ক:</strong> <code className="bg-gray-100 px-1 py-0.5 rounded text-gray-800 font-mono">https://t.me/your_username</code> দিতে পারেন।
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              <form onSubmit={handleSaveSettings} className="space-y-5 mt-6">
                {/* Channel Selector */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2">
                    সাপোর্ট বাটন হিসেবে অ্যাপে কী কী দেখাবে?
                  </label>
                  <div className="grid grid-cols-3 gap-2.5">
                    <button
                      type="button"
                      onClick={() =>
                        setSettingsForm({
                          ...settingsForm,
                          contactChannel: "telegram",
                        })
                      }
                      className={`p-3 rounded-2xl border text-center transition cursor-pointer ${
                        settingsForm.contactChannel === "telegram"
                          ? "bg-[#229ED9]/10 border-[#229ED9] text-[#229ED9] font-bold shadow-xs"
                          : "border-gray-200 hover:bg-gray-50 text-gray-600"
                      }`}
                    >
                      <Send size={18} className="mx-auto mb-1" />
                      <span className="text-xs block">Telegram Only</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setSettingsForm({
                          ...settingsForm,
                          contactChannel: "whatsapp",
                        })
                      }
                      className={`p-3 rounded-2xl border text-center transition cursor-pointer ${
                        settingsForm.contactChannel === "whatsapp"
                          ? "bg-[#25D366]/10 border-[#25D366] text-[#25D366] font-bold shadow-xs"
                          : "border-gray-200 hover:bg-gray-50 text-gray-600"
                      }`}
                    >
                      <MessageCircle size={18} className="mx-auto mb-1" />
                      <span className="text-xs block">WhatsApp Only</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setSettingsForm({ ...settingsForm, contactChannel: "both" })
                      }
                      className={`p-3 rounded-2xl border text-center transition cursor-pointer ${
                        settingsForm.contactChannel === "both"
                          ? "bg-[#141413] border-[#141413] text-white font-bold shadow-xs"
                          : "border-gray-200 hover:bg-gray-50 text-gray-600"
                      }`}
                    >
                      <Layers size={18} className="mx-auto mb-1" />
                      <span className="text-xs block">দুটোই (Both)</span>
                    </button>
                  </div>
                </div>

                {/* Telegram Config */}
                <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Send size={16} className="text-[#229ED9]" />
                      <h4 className="text-xs font-bold text-gray-900">
                        Telegram কনফিগারেশন
                      </h4>
                    </div>
                    {previewTelegramUrl && (
                      <button
                        type="button"
                        onClick={() => openExternalUrl(previewTelegramUrl)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#229ED9] text-white text-[11px] font-bold hover:bg-[#1E88E5] transition cursor-pointer shadow-2xs active:scale-95"
                      >
                        <ExternalLink size={12} />
                        <span>টেস্ট করুন (Test Telegram)</span>
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-gray-600 mb-1">
                        Telegram ইউজারনেম
                      </label>
                      <input
                        type="text"
                        value={settingsForm.telegramUsername}
                        onChange={(e) =>
                          setSettingsForm({
                            ...settingsForm,
                            telegramUsername: e.target.value,
                          })
                        }
                        placeholder="@your_telegram"
                        className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs focus:outline-black bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-gray-600 mb-1">
                        Telegram চ্যাট লিঙ্ক
                      </label>
                      <input
                        type="text"
                        value={settingsForm.contactTelegram}
                        onChange={(e) =>
                          setSettingsForm({
                            ...settingsForm,
                            contactTelegram: e.target.value,
                          })
                        }
                        placeholder="https://t.me/your_telegram"
                        className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs focus:outline-black bg-white"
                      />
                    </div>
                  </div>

                  {/* Telegram URL Live Preview */}
                  <div className="p-2.5 rounded-xl bg-white border border-gray-200 text-[11px] space-y-1">
                    <span className="text-[10px] uppercase font-bold text-gray-400 block tracking-wider">
                      প্রস্তুতকৃত লাইভ লিঙ্ক প্রিভিউ:
                    </span>
                    <div className="font-mono text-gray-800 break-all select-all text-[11px] bg-gray-50 p-1.5 rounded">
                      {previewTelegramUrl || "এখনও কোনো Telegram ইউজারনেম বা লিংক দেওয়া হয়নি"}
                    </div>
                  </div>
                </div>

                {/* WhatsApp Config */}
                <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <MessageCircle size={16} className="text-[#25D366]" />
                      <h4 className="text-xs font-bold text-gray-900">
                        WhatsApp কনফিগারেশন
                      </h4>
                    </div>
                    {previewWhatsAppUrl && (
                      <button
                        type="button"
                        onClick={() => openExternalUrl(previewWhatsAppUrl)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#25D366] text-white text-[11px] font-bold hover:bg-[#1EBE5D] transition cursor-pointer shadow-2xs active:scale-95"
                      >
                        <ExternalLink size={12} />
                        <span>টেস্ট করুন (Test WhatsApp)</span>
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-gray-600 mb-1">
                        WhatsApp নম্বর (পার্সোনাল নম্বর)
                      </label>
                      <input
                        type="text"
                        value={settingsForm.whatsappNumber}
                        onChange={(e) =>
                          setSettingsForm({
                            ...settingsForm,
                            whatsappNumber: e.target.value,
                          })
                        }
                        placeholder="017XXXXXXXX বা 88017XXXXXXXX"
                        className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs focus:outline-black bg-white font-mono"
                      />
                      <span className="text-[10px] text-gray-400 mt-1 block">
                        উদাহরণ: 01768802953
                      </span>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-gray-600 mb-1">
                        WhatsApp লিঙ্ক (বা WhatsApp Business লিঙ্ক)
                      </label>
                      <input
                        type="text"
                        value={settingsForm.contactWhatsApp}
                        onChange={(e) =>
                          setSettingsForm({
                            ...settingsForm,
                            contactWhatsApp: e.target.value,
                          })
                        }
                        placeholder="https://wa.me/message/... বা 88017..."
                        className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs focus:outline-black bg-white font-mono"
                      />
                      <span className="text-[10px] text-gray-400 mt-1 block">
                        বিজনেস লিঙ্ক থাকলে সরাসরি এখানে পেস্ট করুন
                      </span>
                    </div>
                  </div>

                  {/* WhatsApp URL Live Preview */}
                  <div className="p-2.5 rounded-xl bg-white border border-gray-200 text-[11px] space-y-1">
                    <span className="text-[10px] uppercase font-bold text-gray-400 block tracking-wider">
                      প্রস্তুতকৃত লাইভ লিঙ্ক প্রিভিউ:
                    </span>
                    <div className="font-mono text-gray-800 break-all select-all text-[11px] bg-gray-50 p-1.5 rounded">
                      {previewWhatsAppUrl || "এখনও কোনো WhatsApp নম্বর বা লিংক দেওয়া হয়নি"}
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={savingSettings}
                  className="w-full py-3 rounded-2xl bg-[#141413] text-white font-bold text-xs sm:text-sm hover:opacity-90 transition active:scale-98 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Save size={15} />
                  <span>
                    {savingSettings ? "সেভ হচ্ছে..." : "যোগাযোগ সেটিংস সেভ করুন"}
                  </span>
                </button>
              </form>
            </div>
          );
        })()}

        {/* ============================================================== */}
        {/* TAB 4: CODES MANAGEMENT */}
        {/* ============================================================== */}
        {activeTab === "codes" && (
          <div className="space-y-6 animate-in fade-in duration-150">
            {/* Generator Card */}
            <div className="bg-white border border-gray-200 rounded-3xl p-6 sm:p-7 shadow-xs">
              <h2 className="font-serif font-black text-base text-gray-900 mb-4 flex items-center gap-2">
                <Key size={17} />
                <span>নতুন আনলক কোড তৈরি করুন</span>
              </h2>

              <form onSubmit={handleGenerate} className="space-y-4">
                {/* Subject Selector */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-bold text-gray-700">
                      কোন কোন বিষয়ের জন্য কোড প্রযোজ্য হবে?
                    </label>
                    <button
                      type="button"
                      onClick={selectAllSubjects}
                      className="text-xs font-bold text-[#141413] underline underline-offset-2 cursor-pointer"
                    >
                      {selectedSubjectIds.length === ALL_SUBJECT_IDS.length
                        ? "সব আনসিলেক্ট"
                        : "সব ৭টি বই সিলেক্ট"}
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {CHAPTERS.map((ch) => {
                      const isSelected = selectedSubjectIds.includes(ch.id);
                      return (
                        <button
                          key={ch.id}
                          type="button"
                          onClick={() => toggleSubjectSelection(ch.id)}
                          className={`p-2 rounded-xl border text-left text-xs transition cursor-pointer flex items-center gap-2 ${
                            isSelected
                              ? "bg-[#141413] text-white border-[#141413]"
                              : "bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100"
                          }`}
                        >
                          <div
                            className={`w-3.5 h-3.5 rounded flex items-center justify-center shrink-0 border ${
                              isSelected
                                ? "bg-white text-black border-white"
                                : "border-gray-300 bg-white"
                            }`}
                          >
                            {isSelected && <Check size={10} strokeWidth={3} />}
                          </div>
                          <span className="truncate">
                            বই {ch.bookNumber}: {ch.courseCode}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Generator Options */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      কোডের সংখ্যা
                    </label>
                    <select
                      value={genCount}
                      onChange={(e) => setGenCount(parseInt(e.target.value, 10))}
                      className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs bg-white"
                    >
                      <option value={1}>১টি কোড</option>
                      <option value={5}>৫টি কোড</option>
                      <option value={10}>১০টি কোড</option>
                      <option value={20}>২০টি কোড</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      কাস্টম কোড (ঐচ্ছিক)
                    </label>
                    <input
                      type="text"
                      value={customCode}
                      onChange={(e) => setCustomCode(e.target.value.toUpperCase())}
                      placeholder="যেমন: VIP-2026"
                      className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      বায়ার নোট / ফোন / নাম
                    </label>
                    <input
                      type="text"
                      value={buyerNote}
                      onChange={(e) => setBuyerNote(e.target.value)}
                      placeholder="যেমন: রাফি, 01712..."
                      className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs"
                    />
                  </div>
                </div>

                {genError && (
                  <p className="text-xs text-red-600 font-bold">{genError}</p>
                )}

                <button
                  type="submit"
                  disabled={generating}
                  className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-[#141413] text-white font-bold text-xs hover:opacity-90 transition cursor-pointer disabled:opacity-50"
                >
                  {generating ? "তৈরি হচ্ছে..." : "কোড তৈরি করুন →"}
                </button>
              </form>

              {/* Newly Generated Codes Box */}
              {newCodes.length > 0 && (
                <div className="mt-5 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-900">
                      🎉 সদ্য তৈরি হওয়া কোড ({newCodes.length}টি):
                    </span>
                    <button
                      onClick={() => copyText(newCodes.join("\n"), "all_new")}
                      className="text-xs font-bold text-emerald-800 underline cursor-pointer"
                    >
                      {copiedKey === "all_new"
                        ? "কপি হয়েছে!"
                        : "সব কোড একসাথে কপি করুন"}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {newCodes.map((c) => (
                      <span
                        key={c}
                        onClick={() => copyText(c, c)}
                        className="font-mono text-xs font-bold px-3 py-1 rounded-lg bg-white border border-emerald-300 text-gray-900 cursor-pointer hover:bg-emerald-100 transition"
                        title="ক্লিক করে কপি করুন"
                      >
                        {c} {copiedKey === c && "✓"}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Filter & Codes Table */}
            <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <h3 className="font-serif font-black text-base text-gray-900">
                  সকল কোডের তালিকা ({filteredCodes.length})
                </h3>

                {/* Filters */}
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="relative flex-1 sm:w-48">
                    <Search
                      size={14}
                      className="absolute left-3 top-2.5 text-gray-400"
                    />
                    <input
                      type="text"
                      value={codeSearch}
                      onChange={(e) => setCodeSearch(e.target.value)}
                      placeholder="সার্চ কোড / ইমেইল..."
                      className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-gray-300 text-xs"
                    />
                  </div>

                  <select
                    value={codeFilterStatus}
                    onChange={(e) =>
                      setCodeFilterStatus(e.target.value as "all" | "unused" | "used")
                    }
                    className="px-2.5 py-1.5 rounded-xl border border-gray-300 text-xs bg-white font-bold"
                  >
                    <option value="all">সকল স্ট্যাটাস</option>
                    <option value="unused">অব্যবহৃত ({unusedCodesCount})</option>
                    <option value="used">ব্যবহৃত ({usedCodesCount})</option>
                  </select>

                  <select
                    value={codeFilterSubject}
                    onChange={(e) => setCodeFilterSubject(e.target.value)}
                    className="px-2.5 py-1.5 rounded-xl border border-gray-300 text-xs bg-white font-bold"
                  >
                    <option value="all">সকল বিষয়</option>
                    {CHAPTERS.map((ch) => (
                      <option key={ch.id} value={ch.id}>
                        বই {ch.bookNumber}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-gray-200 text-gray-500 font-bold">
                      <th className="py-2.5 px-3">কোড</th>
                      <th className="py-2.5 px-3">বিষয়</th>
                      <th className="py-2.5 px-3">স্ট্যাটাস</th>
                      <th className="py-2.5 px-3">নোট / ব্যবহারকারী</th>
                      <th className="py-2.5 px-3 text-right">অ্যাকশন</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredCodes.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-gray-400">
                          কোনো কোড পাওয়া যায়নি।
                        </td>
                      </tr>
                    ) : (
                      filteredCodes.map((c) => (
                        <tr key={c.code} className="hover:bg-gray-50/60">
                          <td className="py-3 px-3 font-mono font-bold text-gray-900">
                            {c.code}
                          </td>
                          <td className="py-3 px-3 text-gray-600">
                            {formatAssignedSubjectsText(c.assignedSubjectIds)}
                          </td>
                          <td className="py-3 px-3">
                            {c.used ? (
                              <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 font-bold px-2 py-0.5 rounded-full text-[10px]">
                                <Check size={11} strokeWidth={3} /> ব্যবহৃত
                              </span>
                            ) : (
                              <span className="text-gray-500 bg-gray-100 font-bold px-2 py-0.5 rounded-full text-[10px]">
                                অব্যবহৃত
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-gray-500">
                            {c.usedByEmail ? (
                              <div>
                                <span className="font-semibold text-gray-800">
                                  {c.usedByEmail}
                                </span>
                                {c.usedAt && (
                                  <span className="block text-[10px] text-gray-400">
                                    {new Date(c.usedAt).toLocaleDateString("bn-BD")}
                                  </span>
                                )}
                              </div>
                            ) : c.note ? (
                              <span className="italic">{c.note}</span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="py-3 px-3 text-right space-x-1.5 whitespace-nowrap">
                            <button
                              onClick={() => copyText(c.code, c.code)}
                              className="p-1 rounded-lg hover:bg-gray-200 transition text-gray-600 cursor-pointer"
                              title="কপি করুন"
                            >
                              <Copy size={13} />
                            </button>
                            {c.used && (
                              <button
                                onClick={() => handleResetCode(c.code)}
                                className="p-1 rounded-lg hover:bg-amber-100 text-amber-700 transition cursor-pointer"
                                title="রিসেট করুন (পুনরায় সক্রিয়)"
                              >
                                <RotateCcw size={13} />
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteCode(c.code)}
                              className="p-1 rounded-lg hover:bg-red-100 text-red-600 transition cursor-pointer"
                              title="মুছে ফেলুন"
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 5: USERS DIRECTORY */}
        {/* ============================================================== */}
        {activeTab === "users" && (
          <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-xs animate-in fade-in duration-150 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-serif font-black text-base text-gray-900">
                  নিবন্ধিত শিক্ষার্থী তালিকা ({usersList.length})
                </h3>
                <p className="text-xs text-gray-500">
                  যাঁরা ইতোমধ্যে বই আনলক কোড অ্যাক্টিভ করেছেন
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-500 font-bold">
                    <th className="py-2.5 px-3">শিক্ষার্থী / ইমেইল</th>
                    <th className="py-2.5 px-3">আনলকড বইয়ের সংখ্যা</th>
                    <th className="py-2.5 px-3">ব্যবহৃত কোডসমূহ</th>
                    <th className="py-2.5 px-3">সর্বশেষ অ্যাক্টিভেশন</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {usersList.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-gray-400">
                        এখনো কোনো শিক্ষার্থী কোড রিডিম করেনি।
                      </td>
                    </tr>
                  ) : (
                    usersList.map((u) => (
                      <tr key={u.email} className="hover:bg-gray-50/60">
                        <td className="py-3 px-3 font-bold text-gray-900">
                          {u.email}
                        </td>
                        <td className="py-3 px-3 font-semibold text-emerald-700">
                          {u.unlockedCount}/৭টি বিষয়
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex flex-wrap gap-1">
                            {u.codesUsed.map((cd) => (
                              <span
                                key={cd}
                                className="font-mono text-[10px] bg-gray-100 text-gray-800 px-2 py-0.5 rounded"
                              >
                                {cd}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-gray-400 font-mono text-[11px]">
                          {u.lastActive
                            ? new Date(u.lastActive).toLocaleDateString("bn-BD")
                            : "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 6: SECURITY & SETTINGS */}
        {/* ============================================================== */}
        {activeTab === "security" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in duration-150">
            {/* System Announcement & Limits */}
            <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-xs space-y-4">
              <h3 className="font-serif font-black text-base text-gray-900 flex items-center gap-2">
                <Settings size={16} />
                <span>সিস্টেম নোটিশ ও ফ্রি লিমিট</span>
              </h3>

              <form onSubmit={handleSaveSettings} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    ফ্রি রিডিং পৃষ্ঠা লিমিট (প্রতি বিষয়)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={settingsForm.freePagesLimit}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        freePagesLimit: parseInt(e.target.value, 10) || 2,
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs font-bold"
                  />
                  <span className="text-[11px] text-gray-400 mt-1 block">
                    লকড বইয়ের শুরুতে কটি পৃষ্ঠা ফ্রিতে পড়া যাবে
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    হোম পেজ ও ইন-অ্যাপ ঘোষণা (Announcement)
                  </label>
                  <textarea
                    rows={3}
                    value={settingsForm.announcement}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        announcement: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs leading-relaxed"
                  />
                </div>

                <button
                  type="submit"
                  disabled={savingSettings}
                  className="px-5 py-2.5 rounded-xl bg-[#141413] text-white font-bold text-xs hover:opacity-90 transition cursor-pointer"
                >
                  {savingSettings ? "সেভ হচ্ছে..." : "আপডেট করুন"}
                </button>
              </form>
            </div>

            {/* Change Admin Password */}
            <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-xs space-y-4">
              <h3 className="font-serif font-black text-base text-gray-900 flex items-center gap-2">
                <Lock size={16} />
                <span>অ্যাডমিন পাসওয়ার্ড পরিবর্তন</span>
              </h3>

              {passwordMsg && (
                <div
                  className={`p-3 rounded-2xl text-xs font-bold ${
                    passwordMsg.type === "success"
                      ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                      : "bg-red-50 text-red-700 border border-red-200"
                  }`}
                >
                  {passwordMsg.text}
                </div>
              )}

              <form onSubmit={handleChangePassword} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    নতুন পাসওয়ার্ড
                  </label>
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="কমপক্ষে ৪ অক্ষর"
                    className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    পাসওয়ার্ড নিশ্চিত করুন
                  </label>
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="পুনরায় পাসওয়ার্ড লিখুন"
                    className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs"
                  />
                </div>

                <button
                  type="submit"
                  disabled={changingPassword}
                  className="px-5 py-2.5 rounded-xl bg-[#141413] text-white font-bold text-xs hover:opacity-90 transition cursor-pointer disabled:opacity-50"
                >
                  {changingPassword ? "পরিবর্তন হচ্ছে..." : "পাসওয়ার্ড পরিবর্তন করুন"}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
