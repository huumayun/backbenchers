"use client";

import React, { useState, useEffect, useCallback } from "react";
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
  MessageSquareShare,
  ChevronLeft,
  Check,
  BookOpen,
} from "lucide-react";

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
  paymentMethods: string;
  whatsappNumber: string;
  contactWhatsApp: string;
  telegramUsername: string;
  contactTelegram: string;
  freePagesLimit: number;
}

const ALL_SUBJECT_IDS = CHAPTERS.map((c) => c.id);

export default function AdminPage() {
  const [secret, setSecret] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [authError, setAuthError] = useState("");
  const [codes, setCodes] = useState<CodeRecord[]>([]);
  const [loading, setLoading] = useState(false);

  // Code Generator State
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([
    CHAPTERS[0].id,
  ]);
  const [genCount, setGenCount] = useState(1);
  const [customCode, setCustomCode] = useState("");
  const [buyerNote, setBuyerNote] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");
  const [newCodes, setNewCodes] = useState<string[]>([]);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Settings State
  const [settingsForm, setSettingsForm] = useState<SiteSettingsForm>({
    price: "৳৪৯ (প্রতি বিষয়)",
    paymentMethods: "বিকাশ / নগদ (Send Money): 017XX-XXXXXX",
    whatsappNumber: "017XX-XXXXXX",
    contactWhatsApp: "https://wa.me/8801700000000",
    telegramUsername: "@your_telegram_username",
    contactTelegram: "https://t.me/your_telegram_username",
    freePagesLimit: 2,
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
        if (data.settings) setSettingsForm(data.settings);
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
      const res = await fetch("/api/admin/codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret,
          action: "settings",
          settings: settingsForm,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSettingsSavedMsg("✅ কন্টাক্ট সেটিংস সফলভাবে সেভ হয়েছে!");
        setTimeout(() => setSettingsSavedMsg(""), 3000);
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
      return "সকল ৭টি বিষয়";
    }
    return CHAPTERS.filter((ch) => ids.includes(ch.id))
      .map(
        (ch) =>
          `বই ${ch.bookNumber}: ${ch.titleBn.replace(/^[০-৯1-9]+\.\s*/, "")} (${
            ch.courseCode
          })`
      )
      .join(", ");
  };

  const copyBuyerMessage = (code: string, assignedIds?: string[]) => {
    const subText = formatAssignedSubjectsText(
      assignedIds || selectedSubjectIds
    );
    const msg = `✅ আপনার "সাজেশন ফর ব্যাকবেঞ্চার্স (বোটানি অনার্স ৩য় বর্ষ)" আনলক কোড:\n\n🔑 কোড: ${code}\n📚 আনলক হবে: ${subText}\n\n📌 ব্যবহারের নিয়ম:\n১. ওয়েবসাইটে লগইন করার পর হোমপেজের "Unlock" বাটনে ক্লিক করুন।\n২. এই কোডটি বসিয়ে সাবমিট করলেই আপনার নির্ধারিত বিষয় স্থায়ীভাবে আনলক হয়ে যাবে।`;
    copyText(msg, `msg_${code}`);
  };

  const usedCount = codes.filter((c) => c.used).length;
  const unusedCount = codes.filter((c) => !c.used).length;

  return (
    <div className="min-h-dvh bg-[#FAF9F6] text-[#141413] pb-20">
      {/* Minimal Top Bar */}
      <header className="sticky top-0 z-30 bg-[#FAF9F6]/90 backdrop-blur-md border-b border-black/5">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 h-14 flex items-center justify-between text-xs font-medium">
          <Link
            href="/"
            className="flex items-center gap-1 opacity-70 hover:opacity-100 transition py-1 font-semibold"
          >
            <ChevronLeft size={17} />
            <span>হোম</span>
          </Link>

          <span className="text-[11px] uppercase tracking-widest opacity-45 font-bold">
            Admin Console • Subject Code Generator
          </span>

          {authenticated ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchAdminData(secret)}
                className="bg-black/5 hover:bg-black/10 text-xs font-bold px-3.5 py-1.5 rounded-full flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw size={13} /> রিফ্রেশ
              </button>
              <button
                onClick={handleAdminLogout}
                className="bg-red-500/10 hover:bg-red-500/15 text-red-700 text-xs font-bold px-3.5 py-1.5 rounded-full flex items-center gap-1.5 cursor-pointer"
              >
                <Lock size={12} /> লগআউট
              </button>
            </div>
          ) : (
            <div className="w-12" />
          )}
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-8 pt-6 sm:pt-10">
        {!authenticated ? (
          <div className="max-w-sm mx-auto bg-white rounded-3xl shadow-xl border border-black/8 p-7 mt-8">
            <div className="w-11 h-11 rounded-full bg-black text-white flex items-center justify-center mx-auto mb-3">
              <Shield size={20} />
            </div>
            <h1 className="text-xl font-extrabold text-center mb-1">
              Admin Panel লগইন
            </h1>
            <p className="text-xs opacity-55 text-center mb-5">
              বিষয়ভিত্তিক আনলক কোড তৈরি এবং সেটিংস পরিবর্তন করতে আপনার অ্যাডমিন পাসওয়ার্ড দিন।
            </p>

            {authError && (
              <div className="bg-red-500/10 text-red-700 text-xs font-bold p-3 rounded-xl mb-4 text-center">
                {authError}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-3.5">
              <input
                type="password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder="অ্যাডমিন পাসওয়ার্ড দিন"
                required
                className="w-full bg-[#FAF9F6] border border-black/15 focus:border-black rounded-xl px-4 py-2.5 text-xs focus:outline-none"
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#111111] hover:bg-black text-white font-bold py-3 rounded-full text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-lg"
              >
                <Lock size={14} />{" "}
                {loading ? "যাচাই হচ্ছে..." : "Admin Panel খুলুন"}
              </button>
            </form>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Stats Row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white rounded-3xl p-5 border border-black/8 flex items-center justify-between">
                <div>
                  <p className="text-xs opacity-55 font-semibold">মোট তৈরি কোড</p>
                  <p className="text-3xl font-black mt-0.5">{codes.length}</p>
                </div>
                <Key size={26} className="opacity-20" />
              </div>
              <div className="bg-white rounded-3xl p-5 border border-black/8 flex items-center justify-between">
                <div>
                  <p className="text-xs opacity-55 font-semibold">
                    সক্রিয় (অব্যবহৃত কোড)
                  </p>
                  <p className="text-3xl font-black text-emerald-600 mt-0.5">
                    {unusedCount}
                  </p>
                </div>
                <CheckCircle size={26} className="text-emerald-600/30" />
              </div>
              <div className="bg-white rounded-3xl p-5 border border-black/8 flex items-center justify-between">
                <div>
                  <p className="text-xs opacity-55 font-semibold">
                    ব্যবহৃত কোড (One-Time Redeemed)
                  </p>
                  <p className="text-3xl font-black text-amber-600 mt-0.5">
                    {usedCount}
                  </p>
                </div>
                <Lock size={26} className="text-amber-600/30" />
              </div>
            </div>

            {/* Grid: Subject-Specific Code Generator + Contact Settings */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Left: Subject Selection & Code Generator */}
              <div className="lg:col-span-7 bg-white rounded-3xl border border-black/8 p-6">
                <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
                  <h2 className="font-bold text-base flex items-center gap-2">
                    <Key size={17} /> বিষয়ভিত্তিক Unlock Code জেনারেট করুন
                  </h2>
                  <span className="text-[11px] font-bold bg-black/5 px-3 py-1 rounded-full">
                    প্রতি বিষয় ৳৪৯
                  </span>
                </div>
                <p className="text-xs opacity-55 mb-4">
                  ক্রেতা যে বিষয়গুলো কিনেছেন শুধুমাত্র সেই বিষয়গুলো সিলেক্ট করে কোড জেনারেট করুন। এই কোড দিয়ে শুধুমাত্র সিলেক্ট করা বিষয়গুলোই আনলক হবে।
                </p>

                <form onSubmit={handleGenerate} className="space-y-4">
                  {/* Subject Checkboxes (1 to 7 subjects) */}
                  <div className="bg-[#FAF9F6] rounded-2xl p-4 border border-black/8">
                    <div className="flex items-center justify-between mb-2.5">
                      <span className="text-xs font-extrabold flex items-center gap-1.5">
                        <BookOpen size={14} /> বিষয় নির্বাচন করুন ({selectedSubjectIds.length}/৭টি সিলেক্টেড • ৳{selectedSubjectIds.length * 49})
                      </span>
                      <button
                        type="button"
                        onClick={selectAllSubjects}
                        className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-black text-white hover:opacity-90 transition cursor-pointer"
                      >
                        {selectedSubjectIds.length === ALL_SUBJECT_IDS.length
                          ? "সবগুলো বাদ দিন"
                          : "সকল ৭টি বিষয় সিলেক্ট করুন"}
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {CHAPTERS.map((ch) => {
                        const isChecked = selectedSubjectIds.includes(ch.id);
                        const cleanTitle = ch.titleBn.replace(
                          /^[০-৯1-9]+\.\s*/,
                          ""
                        );
                        return (
                          <button
                            key={ch.id}
                            type="button"
                            onClick={() => toggleSubjectSelection(ch.id)}
                            className={`text-left p-2.5 rounded-xl border text-xs flex items-center gap-2.5 transition cursor-pointer ${
                              isChecked
                                ? "bg-[#111111] text-white border-[#111111] shadow-xs"
                                : "bg-white hover:bg-black/4 border-black/10 text-[#141413]"
                            }`}
                          >
                            <div
                              className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border ${
                                isChecked
                                  ? "bg-white border-white text-black"
                                  : "border-black/30 bg-white"
                              }`}
                            >
                              {isChecked && <Check size={11} strokeWidth={3} />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-[10px] font-mono opacity-75">
                                বই {ch.bookNumber} • কোর্স {ch.courseCode}
                              </div>
                              <div className="font-bold truncate">
                                {cleanTitle}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {genError && (
                    <div className="bg-red-500/10 text-red-700 text-xs font-bold p-3 rounded-xl text-center">
                      {genError}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-1">
                      <label className="block text-xs font-semibold opacity-75 mb-1">
                        ক্রেতার নাম / নোট (ঐচ্ছিক)
                      </label>
                      <input
                        type="text"
                        value={buyerNote}
                        onChange={(e) => setBuyerNote(e.target.value)}
                        placeholder="তানভীর - Telegram"
                        className="w-full bg-[#FAF9F6] border border-black/15 rounded-xl px-3.5 py-2 text-xs focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold opacity-75 mb-1">
                        কতটি কোড?
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={50}
                        value={genCount}
                        onChange={(e) =>
                          setGenCount(parseInt(e.target.value, 10) || 1)
                        }
                        className="w-full bg-[#FAF9F6] border border-black/15 rounded-xl px-3.5 py-2 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold opacity-75 mb-1">
                        কাস্টম কোড (ঐচ্ছিক)
                      </label>
                      <input
                        type="text"
                        value={customCode}
                        onChange={(e) =>
                          setCustomCode(e.target.value.toUpperCase())
                        }
                        placeholder="যেমন: BOTANY-01"
                        className="w-full bg-[#FAF9F6] border border-black/15 rounded-xl px-3.5 py-2 text-xs font-mono uppercase"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={generating || selectedSubjectIds.length === 0}
                    className="w-full bg-[#111111] hover:bg-black text-white font-bold py-3 rounded-full text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-md disabled:opacity-40"
                  >
                    <Key size={14} />
                    {generating
                      ? "কোড তৈরি হচ্ছে..."
                      : `Generate Code (${selectedSubjectIds.length}টি বিষয়)`}
                  </button>
                </form>

                {newCodes.length > 0 && (
                  <div className="mt-4 bg-[#FAF9F6] border border-black/10 rounded-2xl p-4 space-y-2">
                    <div className="text-xs font-bold">
                      🎉 সদ্য তৈরি আনলক কোড ({formatAssignedSubjectsText(selectedSubjectIds)}):
                    </div>
                    {newCodes.map((c) => (
                      <div
                        key={c}
                        className="bg-white border border-black/10 rounded-xl p-3 flex items-center justify-between flex-wrap gap-2"
                      >
                        <code className="font-mono font-black text-sm tracking-wider">
                          {c}
                        </code>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => copyText(c, c)}
                            className="text-[11px] bg-black/5 hover:bg-black/10 px-3 py-1.5 rounded-full font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <Copy size={11} />
                            {copiedKey === c ? "কপি হয়েছে!" : "শুধু কোড"}
                          </button>
                          <button
                            onClick={() =>
                              copyBuyerMessage(c, selectedSubjectIds)
                            }
                            className="text-[11px] bg-[#111111] text-white px-3 py-1.5 rounded-full font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <MessageSquareShare size={11} />
                            {copiedKey === `msg_${c}`
                              ? "মেসেজ কপি!"
                              : "পূর্ণ মেসেজ"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Right: Contact Links Settings */}
              <div className="lg:col-span-5 bg-white rounded-3xl border border-black/8 p-6">
                <h2 className="font-bold text-base mb-1 flex items-center gap-2">
                  <Settings size={17} /> কন্টাক্ট লিংক ও সেটিংস
                </h2>
                <p className="text-xs opacity-55 mb-4">
                  আনলক পপআপে যে Telegram ও WhatsApp লিংক দেখাবে তা এখান থেকে পরিবর্তন করুন।
                </p>

                <form onSubmit={handleSaveSettings} className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-semibold opacity-75 mb-1">
                      Telegram Direct Link (https://t.me/...)
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
                      className="w-full bg-[#FAF9F6] border border-black/15 rounded-xl px-3.5 py-2 text-xs font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold opacity-75 mb-1">
                      WhatsApp Direct Link (https://wa.me/...)
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
                      className="w-full bg-[#FAF9F6] border border-black/15 rounded-xl px-3.5 py-2 text-xs font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold opacity-75 mb-1">
                      প্রতি বিষয়ের মূল্য টেক্সট
                    </label>
                    <input
                      type="text"
                      value={settingsForm.price}
                      onChange={(e) =>
                        setSettingsForm({
                          ...settingsForm,
                          price: e.target.value,
                        })
                      }
                      className="w-full bg-[#FAF9F6] border border-black/15 rounded-xl px-3.5 py-2 text-xs"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={savingSettings}
                    className="w-full bg-[#111111] hover:bg-black text-white font-bold py-3 rounded-full text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-md"
                  >
                    <Save size={14} />
                    {savingSettings ? "সেভ হচ্ছে..." : "সেটিংস সেভ করুন"}
                  </button>

                  {settingsSavedMsg && (
                    <p className="text-xs font-bold text-emerald-700 text-center pt-1">
                      {settingsSavedMsg}
                    </p>
                  )}
                </form>

                {/* Change Admin Password Section */}
                <div className="mt-6 pt-6 border-t border-black/8">
                  <h3 className="font-bold text-sm mb-1 flex items-center gap-2">
                    <Shield size={15} /> অ্যাডমিন পাসওয়ার্ড পরিবর্তন করুন
                  </h3>
                  <p className="text-[11px] opacity-55 mb-3.5">
                    আপনার নতুন পাসওয়ার্ড সেট করলে পূর্বের ডিফল্ট পাসওয়ার্ড (`admin2026`) স্বয়ংক্রিয়ভাবে বাতিল হয়ে যাবে।
                  </p>

                  <form onSubmit={handleChangePassword} className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold opacity-75 mb-1">
                        নতুন পাসওয়ার্ড
                      </label>
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="নতুন পাসওয়ার্ড দিন (কমপক্ষে ৪ অক্ষর)"
                        required
                        className="w-full bg-[#FAF9F6] border border-black/15 rounded-xl px-3.5 py-2 text-xs focus:outline-none focus:border-black"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold opacity-75 mb-1">
                        নতুন পাসওয়ার্ড নিশ্চিত করুন
                      </label>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="আবার নতুন পাসওয়ার্ড লিখুন"
                        required
                        className="w-full bg-[#FAF9F6] border border-black/15 rounded-xl px-3.5 py-2 text-xs focus:outline-none focus:border-black"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={changingPassword}
                      className="w-full bg-[#141413] hover:bg-black text-[#FAF9F6] font-bold py-2.5 rounded-full text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-sm"
                    >
                      <Lock size={13} />
                      {changingPassword
                        ? "পাসওয়ার্ড আপডেট হচ্ছে..."
                        : "পাসওয়ার্ড পরিবর্তন করুন"}
                    </button>

                    {passwordMsg && (
                      <p
                        className={`text-xs font-bold text-center pt-1 ${
                          passwordMsg.type === "success"
                            ? "text-emerald-700"
                            : "text-red-600"
                        }`}
                      >
                        {passwordMsg.text}
                      </p>
                    )}
                  </form>
                </div>
              </div>
            </div>

            {/* All Codes Table */}
            <div className="bg-white rounded-3xl border border-black/8 p-6">
              <h2 className="font-bold text-base mb-4">
                সকল আনলক কোডের তালিকা ({codes.length})
              </h2>

              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-black/10 text-left opacity-55">
                      <th className="py-2.5 pr-4">আনলক কোড</th>
                      <th className="py-2.5 pr-4">নির্ধারিত বিষয়সমূহ (Subjects)</th>
                      <th className="py-2.5 pr-4">ক্রেতার নোট</th>
                      <th className="py-2.5 pr-4">অবস্থা</th>
                      <th className="py-2.5 pr-4">ব্যবহারকারী অ্যাকাউন্ট</th>
                      <th className="py-2.5 text-right">অ্যাকশন</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/6">
                    {codes.map((c) => {
                      const assignedIds =
                        Array.isArray(c.assignedSubjectIds) &&
                        c.assignedSubjectIds.length > 0
                          ? c.assignedSubjectIds
                          : ALL_SUBJECT_IDS;
                      const isAllSeven =
                        assignedIds.length === ALL_SUBJECT_IDS.length;

                      return (
                        <tr key={c.code}>
                          <td className="py-3 pr-4">
                            <code className="font-mono font-black bg-[#FAF9F6] px-2.5 py-1 rounded-lg border border-black/10">
                              {c.code}
                            </code>
                          </td>
                          <td className="py-3 pr-4">
                            {isAllSeven ? (
                              <span className="inline-block bg-black text-white font-bold px-2.5 py-0.5 rounded-full text-[10px]">
                                সকল ৭টি বিষয়
                              </span>
                            ) : (
                              <div className="flex flex-wrap gap-1 max-w-xs">
                                {CHAPTERS.filter((ch) =>
                                  assignedIds.includes(ch.id)
                                ).map((ch) => (
                                  <span
                                    key={ch.id}
                                    className="inline-block bg-black/7 text-[#141413] font-bold px-2 py-0.5 rounded-md text-[10px]"
                                  >
                                    বই {ch.bookNumber} ({ch.courseCode})
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="py-3 pr-4">
                            {c.note || <span className="opacity-35">—</span>}
                          </td>
                          <td className="py-3 pr-4">
                            {c.used ? (
                              <span className="bg-amber-500/15 text-amber-900 font-bold px-2.5 py-0.5 rounded-full text-[11px]">
                                ব্যবহৃত
                              </span>
                            ) : (
                              <span className="bg-emerald-500/15 text-emerald-900 font-bold px-2.5 py-0.5 rounded-full text-[11px]">
                                সক্রিয়
                              </span>
                            )}
                          </td>
                          <td className="py-3 pr-4 text-[11px] font-mono opacity-75">
                            {c.used ? (
                              <div>
                                {c.usedByEmail && (
                                  <div className="font-sans font-bold text-black">
                                    {c.usedByEmail}
                                  </div>
                                )}
                                {c.usedByUid && (
                                  <div className="text-[10px] opacity-65">
                                    UID: {c.usedByUid.slice(0, 14)}
                                  </div>
                                )}
                                {c.usedAt && (
                                  <div className="text-[10px] opacity-60">
                                    {new Date(c.usedAt).toLocaleString("bn-BD")}
                                  </div>
                                )}
                              </div>
                            ) : (
                              "এখনো ব্যবহৃত হয়নি"
                            )}
                          </td>
                          <td className="py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => copyText(c.code, c.code)}
                                className="bg-black/5 hover:bg-black/10 font-bold px-2.5 py-1 rounded-full text-[11px] flex items-center gap-1 cursor-pointer"
                              >
                                <Copy size={11} />
                                {copiedKey === c.code ? "কপি!" : "কোড"}
                              </button>
                              <button
                                onClick={() =>
                                  copyBuyerMessage(
                                    c.code,
                                    c.assignedSubjectIds
                                  )
                                }
                                className="bg-black/5 hover:bg-black/10 font-bold px-2.5 py-1 rounded-full text-[11px] flex items-center gap-1 cursor-pointer"
                              >
                                <MessageSquareShare size={11} />
                                {copiedKey === `msg_${c.code}`
                                  ? "কপি!"
                                  : "মেসেজ"}
                              </button>
                              {c.used && (
                                <button
                                  onClick={() => handleResetCode(c.code)}
                                  className="bg-amber-500/15 hover:bg-amber-500/25 text-amber-900 font-bold px-2.5 py-1 rounded-full text-[11px] flex items-center gap-1 cursor-pointer"
                                >
                                  <RotateCcw size={11} /> রিসেট
                                </button>
                              )}
                              <button
                                onClick={() => handleDeleteCode(c.code)}
                                className="p-1.5 text-red-500 hover:bg-red-500/10 rounded-full cursor-pointer"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
