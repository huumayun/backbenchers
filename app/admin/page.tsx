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
  DollarSign,
  Tag,
  MessageCircle,
  Send,
  Users,
  Search,
  BarChart3,
  Sparkles,
  ExternalLink,
  LogOut,
  AlertCircle,
  CheckCircle2,
  Clock,
  Layers,
  Info,
  Gift,
  Download,
  Ban,
  Bell,
  Calendar,
  Plus,
  Infinity as InfinityIcon,
} from "lucide-react";
import {
  buildSmartWhatsAppUrl,
  buildSmartTelegramUrl,
  openExternalUrl,
} from "@/lib/contactUtils";
import {
  toBengaliDigits,
  formatRemainingDurationBn,
} from "@/lib/context/AuthContext";

interface CodeRedeemer {
  uid: string;
  email: string;
  deviceId?: string | null;
  ip?: string | null;
  redeemedAt: string;
  expiresAt?: string | null;
}

interface CodeRecord {
  code: string;
  used: boolean;
  assignedSubjectIds?: string[];
  maxUses?: number;
  usedCount?: number;
  redeemers?: CodeRedeemer[];
  accessDurationDays?: number | null;
  expiresAt?: string | null;
  disabled?: boolean;
  usedByUid?: string | null;
  usedByEmail?: string | null;
  usedByDevice?: string | null;
  usedByIP?: string | null;
  note?: string;
  createdAt: string;
  usedAt?: string | null;
}

interface SubjectFreeWindow {
  subjectId: string;
  enabled: boolean;
  isUnlimited: boolean;
  durationDays?: number | null;
  startAt: string;
  endAt: string | null;
  updatedAt: string;
  note?: string;
}

interface NoticeItem {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  important?: boolean;
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
  freeSubjects?: Record<string, SubjectFreeWindow>;
}

const ALL_SUBJECT_IDS = CHAPTERS.map((c) => c.id);

type AdminTab =
  | "overview"
  | "free_access"
  | "codes"
  | "notices"
  | "pricing"
  | "channels"
  | "users"
  | "security";

function evaluateCodeStatus(
  c: CodeRecord,
  nowMs: number
): "disabled" | "expired" | "used" | "partial" | "unused" {
  if (c.disabled) return "disabled";
  const maxUses = Math.max(1, Number(c.maxUses) || 1);
  const usedCount =
    typeof c.usedCount === "number"
      ? c.usedCount
      : Array.isArray(c.redeemers)
      ? c.redeemers.length
      : c.used
      ? 1
      : 0;
  if (usedCount >= maxUses || c.used) return "used";
  if (c.expiresAt) {
    const exp = Date.parse(c.expiresAt);
    if (!Number.isNaN(exp) && exp <= nowMs) return "expired";
  }
  if (usedCount > 0) return "partial";
  return "unused";
}

function evaluateFreeWindowStatus(
  win: SubjectFreeWindow | undefined,
  nowMs: number
): "active" | "scheduled" | "expired" | "disabled" {
  if (!win || !win.enabled) return "disabled";
  const startMs = win.startAt ? Date.parse(win.startAt) : 0;
  if (!Number.isNaN(startMs) && startMs > nowMs) return "scheduled";
  if (win.isUnlimited || !win.endAt) return "active";
  const endMs = Date.parse(win.endAt);
  if (Number.isNaN(endMs)) return "disabled";
  return endMs > nowMs ? "active" : "expired";
}

export default function AdminPage() {
  const [secret, setSecret] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [authError, setAuthError] = useState("");
  const [codes, setCodes] = useState<CodeRecord[]>([]);
  const [notices, setNotices] = useState<NoticeItem[]>([]);
  const [serverTimeOffsetMs, setServerTimeOffsetMs] = useState(0);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");

  // Tick every 15s for live countdowns in admin
  useEffect(() => {
    const interval = setInterval(() => {
      setNowTick(Date.now());
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  const serverNowMs = nowTick + serverTimeOffsetMs;

  // Code Generator State
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([
    ...ALL_SUBJECT_IDS,
  ]);
  const [genCount, setGenCount] = useState<number>(1);
  const [codePrefix, setCodePrefix] = useState<string>("BACK");
  const [codeLength, setCodeLength] = useState<number>(8);
  const [customCode, setCustomCode] = useState("");
  const [maxUses, setMaxUses] = useState<number>(1);
  const [accessDurationType, setAccessDurationType] = useState<
    "permanent" | "days"
  >("permanent");
  const [accessDurationDays, setAccessDurationDays] = useState<number>(7);
  const [codeRedeemExpiryDate, setCodeRedeemExpiryDate] = useState<string>("");
  const [buyerNote, setBuyerNote] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");
  const [newCodes, setNewCodes] = useState<string[]>([]);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [expandedCodeDetails, setExpandedCodeDetails] = useState<string | null>(
    null
  );

  // Search & Filter State for Codes Tab
  const [codeSearch, setCodeSearch] = useState("");
  const [codeFilterStatus, setCodeFilterStatus] = useState<
    "all" | "unused" | "used" | "expired" | "disabled"
  >("all");
  const [codeFilterSubject, setCodeFilterSubject] = useState<string>("all");

  // Global Free Access Manager State
  const [freeSelectedSubjects, setFreeSelectedSubjects] = useState<string[]>([
    CHAPTERS[0].id,
  ]);
  const [freeDurationMode, setFreeDurationMode] = useState<
    "days" | "unlimited"
  >("days");
  const [freeDurationDays, setFreeDurationDays] = useState<number>(7);
  const [freeStartAtInput, setFreeStartAtInput] = useState<string>("");
  const [freeNote, setFreeNote] = useState<string>("");
  const [savingFreeWindow, setSavingFreeWindow] = useState(false);
  const [freeActionMsg, setFreeActionMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Notice System State
  const [noticeTitle, setNoticeTitle] = useState("");
  const [noticeBody, setNoticeBody] = useState("");
  const [noticeImportant, setNoticeImportant] = useState(false);
  const [savingNotice, setSavingNotice] = useState(false);
  const [noticeMsg, setNoticeMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

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
    freeSubjects: {},
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
        if (data.serverTime) {
          const parsed = Date.parse(data.serverTime);
          if (!Number.isNaN(parsed)) {
            setServerTimeOffsetMs(parsed - Date.now());
          }
        }
        setCodes(data.codes || []);
        setNotices(data.notices || []);
        if (data.settings) {
          setSettingsForm((prev) => ({
            ...prev,
            ...data.settings,
            regularPrice: data.settings.regularPrice ?? 49,
            offerPrice: data.settings.offerPrice ?? 39,
            isOfferActive: Boolean(data.settings.isOfferActive === true),
            contactChannel: data.settings.contactChannel || "both",
            freeSubjects: data.settings.freeSubjects || {},
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
          text:
            data.message || "✅ অ্যাডমিন পাসওয়ার্ড সফলভাবে পরিবর্তন হয়েছে!",
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

    const safeCount = Math.min(Math.max(1, Number(genCount) || 1), 200);
    const safeMaxUses = Math.min(Math.max(1, Number(maxUses) || 1), 10000);
    const durationDaysPayload =
      accessDurationType === "days"
        ? Math.max(1, Number(accessDurationDays) || 7)
        : null;

    let expiresAtIso: string | null = null;
    if (codeRedeemExpiryDate.trim()) {
      const parsed = new Date(codeRedeemExpiryDate);
      if (!Number.isNaN(parsed.getTime())) {
        // Set to end of that day if date-only
        if (codeRedeemExpiryDate.length <= 10) {
          parsed.setHours(23, 59, 59, 999);
        }
        expiresAtIso = parsed.toISOString();
      }
    }

    setGenerating(true);
    try {
      const res = await fetch("/api/admin/codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret,
          action: "generate",
          count: safeCount,
          prefix: codePrefix.trim() || "BACK",
          codeLength: Math.min(Math.max(4, Number(codeLength) || 8), 16),
          customCode: customCode.trim() || undefined,
          note: buyerNote.trim() || undefined,
          assignedSubjectIds: selectedSubjectIds,
          maxUses: safeMaxUses,
          accessDurationDays: durationDaysPayload,
          expiresAt: expiresAtIso,
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

  const handleToggleDisableCode = async (code: string, disabled: boolean) => {
    const res = await fetch("/api/admin/codes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret,
        action: "toggle_disable",
        code,
        disabled,
      }),
    });
    const data = await res.json();
    if (data.success) setCodes(data.codes || []);
  };

  const handleResetCode = async (code: string) => {
    if (
      !confirm(
        `আপনি কি নিশ্চিত কোডটি রিসেট করতে চান (${code})? এর পূর্বের ব্যবহারের সংখ্যা মুছে পুনরায় নতুন হিসেবে চালু হবে।`
      )
    )
      return;
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

  // Global Free Subject Actions
  const toggleFreeSubjectSelect = (subjectId: string) => {
    setFreeSelectedSubjects((prev) =>
      prev.includes(subjectId)
        ? prev.filter((id) => id !== subjectId)
        : [...prev, subjectId]
    );
  };

  const handleApplyFreeWindow = async (
    targetSubjectIds: string[],
    options: {
      enabled: boolean;
      isUnlimited?: boolean;
      durationDays?: number | null;
      startAt?: string | null;
      endAt?: string | null;
      note?: string;
    }
  ) => {
    if (targetSubjectIds.length === 0) {
      setFreeActionMsg({
        type: "error",
        text: "কমপক্ষে ১টি বিষয় সিলেক্ট করুন।",
      });
      return;
    }

    setSavingFreeWindow(true);
    setFreeActionMsg(null);
    try {
      const res = await fetch("/api/admin/codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret,
          action: "set_free_subjects",
          subjectIds: targetSubjectIds,
          enabled: options.enabled,
          isUnlimited: Boolean(options.isUnlimited),
          durationDays: options.durationDays ?? null,
          startAt: options.startAt || null,
          endAt: options.endAt || null,
          note: options.note || "",
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (data.settings) {
          setSettingsForm((prev) => ({
            ...prev,
            ...data.settings,
            freeSubjects: data.settings.freeSubjects || {},
          }));
        }
        setFreeActionMsg({
          type: "success",
          text: options.enabled
            ? `✅ নির্বাচিত ${toBengaliDigits(targetSubjectIds.length)}টি বিষয়ের ফ্রি অ্যাক্সেস সফলভাবে চালু/আপডেট করা হয়েছে!`
            : `✅ নির্বাচিত বিষয়ের ফ্রি অ্যাক্সেস বন্ধ করা হয়েছে।`,
        });
      } else {
        setFreeActionMsg({
          type: "error",
          text: data.error || "ফ্রি অ্যাক্সেস আপডেট করা যায়নি।",
        });
      }
    } catch {
      setFreeActionMsg({
        type: "error",
        text: "সার্ভারের সাথে সংযোগ করা যায়নি।",
      });
    } finally {
      setSavingFreeWindow(false);
    }
  };

  const handleExtendFreeSubject = async (
    subjectId: string,
    extraDays: number
  ) => {
    const existing = settingsForm.freeSubjects?.[subjectId];
    const baseMs =
      existing?.endAt && Date.parse(existing.endAt) > serverNowMs
        ? Date.parse(existing.endAt)
        : serverNowMs;
    const newEndAt = new Date(
      baseMs + extraDays * 24 * 60 * 60 * 1000
    ).toISOString();

    await handleApplyFreeWindow([subjectId], {
      enabled: true,
      isUnlimited: false,
      durationDays: (existing?.durationDays || 0) + extraDays,
      startAt: existing?.startAt || new Date(serverNowMs).toISOString(),
      endAt: newEndAt,
      note: existing?.note || "",
    });
  };

  // Notice System Handlers
  const handleAddNotice = async (e: React.FormEvent) => {
    e.preventDefault();
    setNoticeMsg(null);
    if (!noticeTitle.trim() || !noticeBody.trim()) {
      setNoticeMsg({
        type: "error",
        text: "নোটিশের শিরোনাম এবং বিস্তারিত টেক্সট উভয়ই লিখুন।",
      });
      return;
    }

    setSavingNotice(true);
    try {
      const res = await fetch("/api/admin/codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret,
          action: "add_notice",
          title: noticeTitle.trim(),
          body: noticeBody.trim(),
          important: noticeImportant,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setNotices(data.notices || []);
        setNoticeTitle("");
        setNoticeBody("");
        setNoticeImportant(false);
        setNoticeMsg({
          type: "success",
          text: "✅ নতুন নোটিশ সফলভাবে প্রকাশিত হয়েছে!",
        });
      } else {
        setNoticeMsg({
          type: "error",
          text: data.error || "নোটিশ প্রকাশ করা যায়নি।",
        });
      }
    } catch {
      setNoticeMsg({
        type: "error",
        text: "সার্ভারের সাথে সংযোগ করা যায়নি।",
      });
    } finally {
      setSavingNotice(false);
    }
  };

  const handleDeleteNotice = async (noticeId: string) => {
    if (!confirm("আপনি কি নিশ্চিত এই নোটিশটি মুছে ফেলতে চান?")) return;
    const res = await fetch("/api/admin/codes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret,
        action: "delete_notice",
        noticeId,
      }),
    });
    const data = await res.json();
    if (res.ok && data.success) {
      setNotices(data.notices || []);
    }
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
        return ch ? `বই ${ch.bookNumber} (${ch.courseCode})` : id;
      })
      .join(", ");
  };

  const exportCodesToCSV = () => {
    const rows: string[][] = [
      [
        "Code",
        "Subjects",
        "Status",
        "UsedCount",
        "MaxUses",
        "AccessDuration",
        "RedeemByExpiry",
        "Redeemers",
        "Note",
        "CreatedAt",
      ],
    ];

    filteredCodes.forEach((c) => {
      const st = evaluateCodeStatus(c, serverNowMs);
      const maxU = Math.max(1, Number(c.maxUses) || 1);
      const usedU =
        typeof c.usedCount === "number"
          ? c.usedCount
          : Array.isArray(c.redeemers)
          ? c.redeemers.length
          : c.used
          ? 1
          : 0;
      const durationStr =
        c.accessDurationDays && c.accessDurationDays > 0
          ? `${c.accessDurationDays} days`
          : "Permanent";
      const redeemersStr =
        Array.isArray(c.redeemers) && c.redeemers.length > 0
          ? c.redeemers.map((r) => `${r.email} (${r.redeemedAt})`).join(" | ")
          : c.usedByEmail || "";

      rows.push([
        c.code,
        formatAssignedSubjectsText(c.assignedSubjectIds),
        st.toUpperCase(),
        String(usedU),
        String(maxU),
        durationStr,
        c.expiresAt || "No Expiry",
        redeemersStr,
        c.note || "",
        c.createdAt || "",
      ]);
    });

    const csvContent =
      "\uFEFF" +
      rows
        .map((r) =>
          r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
        )
        .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `backbencher-codes-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Metrics Calculations
  const totalCodesCount = codes.length;
  const usedCodesCount = codes.filter((c) => {
    const st = evaluateCodeStatus(c, serverNowMs);
    return st === "used" || st === "partial";
  }).length;
  const unusedCodesCount = codes.filter(
    (c) => evaluateCodeStatus(c, serverNowMs) === "unused"
  ).length;
  const activeFreeSubjectsCount = CHAPTERS.filter(
    (ch) =>
      evaluateFreeWindowStatus(
        settingsForm.freeSubjects?.[ch.id],
        serverNowMs
      ) === "active"
  ).length;

  const unitPrice = settingsForm.isOfferActive
    ? settingsForm.offerPrice
    : settingsForm.regularPrice;
  const totalRedemptionsCount = codes.reduce((acc, c) => {
    const cnt =
      typeof c.usedCount === "number"
        ? c.usedCount
        : Array.isArray(c.redeemers)
        ? c.redeemers.length
        : c.used
        ? 1
        : 0;
    return acc + cnt;
  }, 0);
  const estimatedRevenue = totalRedemptionsCount * unitPrice;

  // Filtered Codes
  const filteredCodes = useMemo(() => {
    return codes.filter((c) => {
      const status = evaluateCodeStatus(c, serverNowMs);
      if (codeFilterStatus === "unused" && status !== "unused") return false;
      if (
        codeFilterStatus === "used" &&
        status !== "used" &&
        status !== "partial"
      )
        return false;
      if (codeFilterStatus === "expired" && status !== "expired") return false;
      if (codeFilterStatus === "disabled" && status !== "disabled") return false;

      if (codeFilterSubject !== "all") {
        const ids = c.assignedSubjectIds || ALL_SUBJECT_IDS;
        if (!ids.includes(codeFilterSubject)) return false;
      }
      if (codeSearch.trim()) {
        const q = codeSearch.trim().toLowerCase();
        const codeMatch = c.code.toLowerCase().includes(q);
        const emailMatch = (c.usedByEmail || "").toLowerCase().includes(q);
        const redeemerMatch = (c.redeemers || []).some((r) =>
          (r.email || "").toLowerCase().includes(q)
        );
        const noteMatch = (c.note || "").toLowerCase().includes(q);
        if (!codeMatch && !emailMatch && !redeemerMatch && !noteMatch)
          return false;
      }
      return true;
    });
  }, [codes, codeFilterStatus, codeFilterSubject, codeSearch, serverNowMs]);

  // Unique Users List from Redeemed Codes (including multi-user redeemers)
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

    codes.forEach((c) => {
      const subjectCount = (c.assignedSubjectIds || ALL_SUBJECT_IDS).length;
      if (Array.isArray(c.redeemers) && c.redeemers.length > 0) {
        c.redeemers.forEach((r) => {
          if (!r.email) return;
          const existing = map.get(r.email) || {
            email: r.email,
            uid: r.uid,
            codesUsed: [],
            unlockedCount: 0,
            lastActive: r.redeemedAt,
          };
          if (!existing.codesUsed.includes(c.code)) {
            existing.codesUsed.push(c.code);
          }
          existing.unlockedCount = Math.min(
            7,
            Math.max(existing.unlockedCount, subjectCount)
          );
          if (
            r.redeemedAt &&
            (!existing.lastActive || r.redeemedAt > existing.lastActive)
          ) {
            existing.lastActive = r.redeemedAt;
          }
          map.set(r.email, existing);
        });
      } else if (c.used && c.usedByEmail) {
        const email = c.usedByEmail;
        const existing = map.get(email) || {
          email,
          uid: c.usedByUid || undefined,
          codesUsed: [],
          unlockedCount: 0,
          lastActive: c.usedAt || c.createdAt,
        };
        if (!existing.codesUsed.includes(c.code)) {
          existing.codesUsed.push(c.code);
        }
        existing.unlockedCount = Math.min(
          7,
          Math.max(existing.unlockedCount, subjectCount)
        );
        map.set(email, existing);
      }
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
                v2.0
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
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 whitespace-nowrap transition cursor-pointer ${
              activeTab === "overview"
                ? "bg-[#141413] text-white shadow-xs"
                : "text-gray-600 hover:text-black hover:bg-gray-50"
            }`}
          >
            <BarChart3 size={15} />
            <span>ওভারভিউ</span>
          </button>

          <button
            onClick={() => setActiveTab("free_access")}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 whitespace-nowrap transition cursor-pointer ${
              activeTab === "free_access"
                ? "bg-[#141413] text-white shadow-xs"
                : "text-gray-600 hover:text-black hover:bg-gray-50"
            }`}
          >
            <Gift size={15} />
            <span>ফ্রি অ্যাক্সেস ({activeFreeSubjectsCount}/৭)</span>
            {activeFreeSubjectsCount > 0 && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            )}
          </button>

          <button
            onClick={() => setActiveTab("codes")}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 whitespace-nowrap transition cursor-pointer ${
              activeTab === "codes"
                ? "bg-[#141413] text-white shadow-xs"
                : "text-gray-600 hover:text-black hover:bg-gray-50"
            }`}
          >
            <Key size={15} />
            <span>কোড ম্যানেজার ({totalCodesCount})</span>
          </button>

          <button
            onClick={() => setActiveTab("notices")}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 whitespace-nowrap transition cursor-pointer ${
              activeTab === "notices"
                ? "bg-[#141413] text-white shadow-xs"
                : "text-gray-600 hover:text-black hover:bg-gray-50"
            }`}
          >
            <Bell size={15} />
            <span>নোটিশ বোর্ড ({notices.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("pricing")}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 whitespace-nowrap transition cursor-pointer ${
              activeTab === "pricing"
                ? "bg-[#141413] text-white shadow-xs"
                : "text-gray-600 hover:text-black hover:bg-gray-50"
            }`}
          >
            <DollarSign size={15} />
            <span>প্রাইসিং</span>
            {settingsForm.isOfferActive && (
              <span className="w-2 h-2 rounded-full bg-amber-400" />
            )}
          </button>

          <button
            onClick={() => setActiveTab("channels")}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 whitespace-nowrap transition cursor-pointer ${
              activeTab === "channels"
                ? "bg-[#141413] text-white shadow-xs"
                : "text-gray-600 hover:text-black hover:bg-gray-50"
            }`}
          >
            <MessageCircle size={15} />
            <span>যোগাযোগ মাধ্যম</span>
          </button>

          <button
            onClick={() => setActiveTab("users")}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 whitespace-nowrap transition cursor-pointer ${
              activeTab === "users"
                ? "bg-[#141413] text-white shadow-xs"
                : "text-gray-600 hover:text-black hover:bg-gray-50"
            }`}
          >
            <Users size={15} />
            <span>ইউজার ({usersList.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("security")}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 whitespace-nowrap transition cursor-pointer ${
              activeTab === "security"
                ? "bg-[#141413] text-white shadow-xs"
                : "text-gray-600 hover:text-black hover:bg-gray-50"
            }`}
          >
            <Settings size={15} />
            <span>সেটিংস</span>
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
                    সক্রিয় ফ্রি বিষয়
                  </span>
                  <Gift size={17} className="text-emerald-600" />
                </div>
                <div className="font-serif font-black text-2xl sm:text-3xl text-emerald-700">
                  {activeFreeSubjectsCount} / ৭
                </div>
                <p className="text-[11px] text-gray-500 mt-1">
                  বর্তমানে সবার জন্য উন্মুক্ত বিষয়
                </p>
              </div>

              <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs">
                <div className="flex items-center justify-between text-gray-500 mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider">
                    অব্যবহৃত কোড
                  </span>
                  <CheckCircle size={17} className="text-emerald-500" />
                </div>
                <div className="font-serif font-black text-2xl sm:text-3xl text-gray-900">
                  {unusedCodesCount}
                </div>
                <p className="text-[11px] text-gray-500 mt-1">
                  মোট {totalCodesCount}টি কোডের মধ্যে প্রস্তুত
                </p>
              </div>

              <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs">
                <div className="flex items-center justify-between text-gray-500 mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider">
                    মোট রিডিম সংখ্যা
                  </span>
                  <Users size={17} className="text-blue-500" />
                </div>
                <div className="font-serif font-black text-2xl sm:text-3xl text-blue-600">
                  {totalRedemptionsCount}
                </div>
                <p className="text-[11px] text-gray-500 mt-1">
                  {usedCodesCount}টি কোড ব্যবহৃত হয়েছে
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
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <button
                  onClick={() => setActiveTab("free_access")}
                  className="p-4 rounded-2xl bg-emerald-50/70 hover:bg-emerald-50 border border-emerald-200 text-left transition cursor-pointer"
                >
                  <Gift size={18} className="text-emerald-700 mb-2" />
                  <h3 className="font-bold text-xs text-emerald-950">
                    যেকোনো বিষয় ফ্রি করুন
                  </h3>
                  <p className="text-[11px] text-emerald-900/70 mt-0.5">
                    নির্দিষ্ট দিন বা অনির্দিষ্টকালের জন্য উন্মুক্ত করুন
                  </p>
                </button>

                <button
                  onClick={() => setActiveTab("codes")}
                  className="p-4 rounded-2xl bg-gray-50 hover:bg-gray-100 border border-gray-200 text-left transition cursor-pointer"
                >
                  <Key size={18} className="text-gray-900 mb-2" />
                  <h3 className="font-bold text-xs text-gray-900">
                    অ্যাডভান্সড কোড জেনারেটর
                  </h3>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    শেয়ারড কোড, মেয়াদ ও একাধিক বিষয় সিলেক্ট করুন
                  </p>
                </button>

                <button
                  onClick={() => setActiveTab("notices")}
                  className="p-4 rounded-2xl bg-purple-50/60 hover:bg-purple-50 border border-purple-200 text-left transition cursor-pointer"
                >
                  <Bell size={18} className="text-purple-700 mb-2" />
                  <h3 className="font-bold text-xs text-purple-950">
                    নোটিশ পাঠান ({notices.length})
                  </h3>
                  <p className="text-[11px] text-purple-900/70 mt-0.5">
                    সকল শিক্ষার্থীর অ্যাপ ও ওয়েবসাইটে ফুল নোটিশ পাঠান
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
                    বর্তমানে ৳{unitPrice}/বিষয় সক্রিয় আছে
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
              {usedCodesCount === 0 ? (
                <p className="text-xs text-gray-400 py-6 text-center">
                  এখনো কোনো কোড ব্যবহৃত হয়নি।
                </p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {codes
                    .filter(
                      (c) =>
                        c.used ||
                        (typeof c.usedCount === "number" && c.usedCount > 0)
                    )
                    .slice(0, 8)
                    .map((c) => {
                      const maxU = Math.max(1, Number(c.maxUses) || 1);
                      const usedU =
                        typeof c.usedCount === "number"
                          ? c.usedCount
                          : c.used
                          ? 1
                          : 0;
                      return (
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
                              {c.usedByEmail || "একাধিক ইউজার"} ({usedU}/{maxU})
                            </span>
                            <div className="text-[11px] text-gray-400 mt-0.5">
                              {formatAssignedSubjectsText(c.assignedSubjectIds)}
                              {c.accessDurationDays
                                ? ` • মেয়াদ: ${toBengaliDigits(c.accessDurationDays)} দিন`
                                : " • স্থায়ী (Permanent)"}
                            </div>
                          </div>
                          <span className="text-[11px] text-gray-400 font-mono">
                            {c.usedAt
                              ? new Date(c.usedAt).toLocaleString("bn-BD")
                              : "ব্যবহৃত"}
                          </span>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 2: GLOBAL FREE SUBJECT MANAGER */}
        {/* ============================================================== */}
        {activeTab === "free_access" && (
          <div className="space-y-6 animate-in fade-in duration-150">
            {/* Configure Free Window Card */}
            <div className="bg-white border border-gray-200 rounded-3xl p-6 sm:p-7 shadow-xs space-y-5">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-700 flex items-center justify-center">
                    <Gift size={20} />
                  </div>
                  <div>
                    <h2 className="font-serif font-black text-base sm:text-lg text-gray-900">
                      যেকোনো বিষয় সবার জন্য ফ্রি করুন (Global Free Access)
                    </h2>
                    <p className="text-xs text-gray-500">
                      ফ্রি থাকাকালীন লগইন করা ইউজার, যারা বই কেনেনি এবং গেস্ট (লগইন ছাড়া)—সবাই সম্পূর্ণ বই পড়তে পারবে
                    </p>
                  </div>
                </div>
              </div>

              {freeActionMsg && (
                <div
                  className={`p-3.5 rounded-2xl text-xs font-bold flex items-center gap-2 ${
                    freeActionMsg.type === "success"
                      ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
                      : "bg-red-50 border border-red-200 text-red-700"
                  }`}
                >
                  {freeActionMsg.type === "success" ? (
                    <CheckCircle2 size={16} />
                  ) : (
                    <AlertCircle size={16} />
                  )}
                  <span>{freeActionMsg.text}</span>
                </div>
              )}

              {/* Subject Multi-Select for Free Window */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-gray-700">
                    ১. কোন কোন বিষয় ফ্রি করতে চান সিলেক্ট করুন:
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setFreeSelectedSubjects(
                        freeSelectedSubjects.length === ALL_SUBJECT_IDS.length
                          ? []
                          : [...ALL_SUBJECT_IDS]
                      )
                    }
                    className="text-xs font-bold text-[#141413] underline cursor-pointer"
                  >
                    {freeSelectedSubjects.length === ALL_SUBJECT_IDS.length
                      ? "সব আনসিলেক্ট"
                      : "সব ৭টি বিষয় সিলেক্ট"}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                  {CHAPTERS.map((ch) => {
                    const isSelected = freeSelectedSubjects.includes(ch.id);
                    const win = settingsForm.freeSubjects?.[ch.id];
                    const status = evaluateFreeWindowStatus(win, serverNowMs);
                    return (
                      <button
                        key={ch.id}
                        type="button"
                        onClick={() => toggleFreeSubjectSelect(ch.id)}
                        className={`p-2.5 rounded-xl border text-left text-xs transition cursor-pointer flex items-center justify-between gap-2 ${
                          isSelected
                            ? "bg-[#141413] text-white border-[#141413]"
                            : "bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div
                            className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border ${
                              isSelected
                                ? "bg-white text-black border-white"
                                : "border-gray-300 bg-white"
                            }`}
                          >
                            {isSelected && <Check size={10} strokeWidth={3} />}
                          </div>
                          <div className="min-w-0">
                            <span className="font-bold block truncate">
                              বই {ch.bookNumber}: {ch.courseCode}
                            </span>
                            <span
                              className={`text-[10px] block truncate ${
                                isSelected ? "text-gray-300" : "text-gray-500"
                              }`}
                            >
                              {ch.titleBn}
                            </span>
                          </div>
                        </div>
                        {status === "active" && (
                          <span className="text-[9px] font-bold bg-emerald-400 text-black px-1.5 py-0.5 rounded-full shrink-0">
                            ফ্রি চালু
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Duration Mode & Presets */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200 space-y-3">
                  <label className="block text-xs font-bold text-gray-800">
                    ২. ফ্রি অ্যাক্সেসের মেয়াদ নির্ধারণ করুন:
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setFreeDurationMode("days")}
                      className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition ${
                        freeDurationMode === "days"
                          ? "bg-[#141413] text-white border-[#141413]"
                          : "bg-white text-gray-700 border-gray-200 hover:bg-gray-100"
                      }`}
                    >
                      <Clock size={14} />
                      <span>নির্দিষ্ট দিন (Specific Days)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setFreeDurationMode("unlimited")}
                      className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition ${
                        freeDurationMode === "unlimited"
                          ? "bg-emerald-700 text-white border-emerald-700"
                          : "bg-white text-gray-700 border-gray-200 hover:bg-gray-100"
                      }`}
                    >
                      <InfinityIcon size={14} />
                      <span>অনির্দিষ্টকাল (Unlimited)</span>
                    </button>
                  </div>

                  {freeDurationMode === "days" ? (
                    <div className="space-y-2 pt-1">
                      <div className="flex flex-wrap gap-1.5">
                        {[1, 3, 7, 15, 30].map((d) => (
                          <button
                            key={d}
                            type="button"
                            onClick={() => setFreeDurationDays(d)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
                              freeDurationDays === d
                                ? "bg-emerald-600 text-white border-emerald-600"
                                : "bg-white text-gray-700 border-gray-300 hover:bg-gray-100"
                            }`}
                          >
                            {toBengaliDigits(d)} দিন
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-gray-600">
                          কাস্টম দিন:
                        </span>
                        <input
                          type="number"
                          min={1}
                          max={3650}
                          value={freeDurationDays}
                          onChange={(e) =>
                            setFreeDurationDays(
                              Math.max(1, parseInt(e.target.value, 10) || 1)
                            )
                          }
                          className="w-28 px-3 py-1.5 rounded-xl border border-gray-300 text-xs font-mono font-bold bg-white"
                        />
                        <span className="text-xs text-gray-500">দিন</span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl p-2.5">
                      অনির্দিষ্টকাল সিলেক্ট করলে আপনি ম্যানুয়ালি বন্ধ না করা পর্যন্ত বিষয়টি সবার জন্য ফ্রি থাকবে।
                    </p>
                  )}
                </div>

                <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200 space-y-3">
                  <label className="block text-xs font-bold text-gray-800">
                    ৩. শুরুর সময় ও নোট (ঐচ্ছিক):
                  </label>
                  <div>
                    <span className="text-[11px] text-gray-500 block mb-1">
                      শুরুর সময় (ফাঁকা রাখলে এখনই শুরু হবে):
                    </span>
                    <input
                      type="datetime-local"
                      value={freeStartAtInput}
                      onChange={(e) => setFreeStartAtInput(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs bg-white font-mono"
                    />
                  </div>
                  <div>
                    <span className="text-[11px] text-gray-500 block mb-1">
                      অ্যাডমিন নোট (ঐচ্ছিক):
                    </span>
                    <input
                      type="text"
                      value={freeNote}
                      onChange={(e) => setFreeNote(e.target.value)}
                      placeholder="যেমন: পরীক্ষার স্পেশাল ফ্রি ক্যাম্পেইন"
                      className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs bg-white"
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="button"
                  disabled={savingFreeWindow || freeSelectedSubjects.length === 0}
                  onClick={() =>
                    handleApplyFreeWindow(freeSelectedSubjects, {
                      enabled: true,
                      isUnlimited: freeDurationMode === "unlimited",
                      durationDays:
                        freeDurationMode === "days" ? freeDurationDays : null,
                      startAt: freeStartAtInput
                        ? new Date(freeStartAtInput).toISOString()
                        : null,
                      note: freeNote,
                    })
                  }
                  className="px-6 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm transition cursor-pointer disabled:opacity-50 flex items-center gap-2 shadow-sm"
                >
                  <Gift size={16} />
                  <span>
                    {savingFreeWindow
                      ? "আপডেট হচ্ছে..."
                      : `নির্বাচিত বিষয় ফ্রি চালু করুন (${toBengaliDigits(
                          freeSelectedSubjects.length
                        )}টি)`}
                  </span>
                </button>

                <button
                  type="button"
                  disabled={savingFreeWindow || freeSelectedSubjects.length === 0}
                  onClick={() =>
                    handleApplyFreeWindow(freeSelectedSubjects, {
                      enabled: false,
                    })
                  }
                  className="px-5 py-3 rounded-2xl bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-bold text-xs sm:text-sm transition cursor-pointer disabled:opacity-50"
                >
                  নির্বাচিত বিষয়ের ফ্রি বন্ধ করুন
                </button>
              </div>
            </div>

            {/* All 7 Subjects Free Status Table */}
            <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-xs space-y-4">
              <h3 className="font-serif font-black text-base text-gray-900">
                সকল ৭টি বিষয়ের ফ্রি অ্যাক্সেস স্ট্যাটাস ও কন্ট্রোল
              </h3>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-gray-200 text-gray-500 font-bold">
                      <th className="py-2.5 px-3">বিষয়</th>
                      <th className="py-2.5 px-3">স্ট্যাটাস</th>
                      <th className="py-2.5 px-3">শুরু (Start)</th>
                      <th className="py-2.5 px-3">শেষ (End / বাকি সময়)</th>
                      <th className="py-2.5 px-3 text-right">কুইক অ্যাকশন</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {CHAPTERS.map((ch) => {
                      const win = settingsForm.freeSubjects?.[ch.id];
                      const status = evaluateFreeWindowStatus(win, serverNowMs);
                      const remainingMs =
                        win?.endAt && !win.isUnlimited
                          ? Date.parse(win.endAt) - serverNowMs
                          : 0;

                      return (
                        <tr key={ch.id} className="hover:bg-gray-50/70">
                          <td className="py-3.5 px-3">
                            <div className="font-bold text-gray-900">
                              বই {ch.bookNumber}: {ch.titleBn}
                            </div>
                            <span className="text-[11px] font-mono text-gray-500">
                              কোর্স কোড: {ch.courseCode}
                            </span>
                          </td>

                          <td className="py-3.5 px-3">
                            {status === "active" ? (
                              <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 font-bold px-2.5 py-1 rounded-full text-[11px]">
                                <CheckCircle2 size={12} /> সক্রিয় (Active)
                              </span>
                            ) : status === "scheduled" ? (
                              <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 font-bold px-2.5 py-1 rounded-full text-[11px]">
                                <Calendar size={12} /> সিডিউলড (Scheduled)
                              </span>
                            ) : status === "expired" ? (
                              <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 font-bold px-2.5 py-1 rounded-full text-[11px]">
                                <Clock size={12} /> মেয়াদ শেষ (Expired)
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-600 font-bold px-2.5 py-1 rounded-full text-[11px]">
                                <Lock size={11} /> লকড (Normal)
                              </span>
                            )}
                          </td>

                          <td className="py-3.5 px-3 text-gray-600 font-mono text-[11px]">
                            {win?.enabled && win.startAt
                              ? new Date(win.startAt).toLocaleString("bn-BD")
                              : "—"}
                          </td>

                          <td className="py-3.5 px-3">
                            {status === "active" ? (
                              win?.isUnlimited || !win?.endAt ? (
                                <span className="font-bold text-emerald-700">
                                  অনির্দিষ্টকাল (Unlimited)
                                </span>
                              ) : (
                                <div>
                                  <span className="font-bold text-emerald-700 block">
                                    {formatRemainingDurationBn(win.endAt, serverNowMs).textBn}
                                  </span>
                                  <span className="text-[10px] font-mono text-gray-400">
                                    {new Date(win.endAt).toLocaleString("bn-BD")}
                                  </span>
                                </div>
                              )
                            ) : win?.endAt ? (
                              <span className="text-[11px] font-mono text-gray-400">
                                {new Date(win.endAt).toLocaleString("bn-BD")}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>

                          <td className="py-3.5 px-3 text-right space-x-1.5 whitespace-nowrap">
                            <button
                              type="button"
                              disabled={savingFreeWindow}
                              onClick={() => handleExtendFreeSubject(ch.id, 1)}
                              className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold text-[11px] cursor-pointer transition"
                              title="১ দিন ফ্রি মেয়াদ বাড়ান বা চালু করুন"
                            >
                              +১ দিন
                            </button>
                            <button
                              type="button"
                              disabled={savingFreeWindow}
                              onClick={() => handleExtendFreeSubject(ch.id, 7)}
                              className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold text-[11px] cursor-pointer transition"
                              title="৭ দিন ফ্রি মেয়াদ বাড়ান বা চালু করুন"
                            >
                              +৭ দিন
                            </button>
                            <button
                              type="button"
                              disabled={savingFreeWindow}
                              onClick={() =>
                                handleApplyFreeWindow([ch.id], {
                                  enabled: true,
                                  isUnlimited: true,
                                })
                              }
                              className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 font-bold text-[11px] cursor-pointer transition"
                              title="অনির্দিষ্টকালের জন্য ফ্রি করুন"
                            >
                              আনলিমিটেড
                            </button>
                            {(status === "active" || status === "scheduled") && (
                              <button
                                type="button"
                                disabled={savingFreeWindow}
                                onClick={() =>
                                  handleApplyFreeWindow([ch.id], {
                                    enabled: false,
                                  })
                                }
                                className="px-2.5 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-bold text-[11px] cursor-pointer transition"
                              >
                                বন্ধ করুন
                              </button>
                            )}
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

        {/* ============================================================== */}
        {/* TAB 3: ADVANCED CODES MANAGEMENT */}
        {/* ============================================================== */}
        {activeTab === "codes" && (
          <div className="space-y-6 animate-in fade-in duration-150">
            {/* Generator Card */}
            <div className="bg-white border border-gray-200 rounded-3xl p-6 sm:p-7 shadow-xs">
              <h2 className="font-serif font-black text-base sm:text-lg text-gray-900 mb-4 flex items-center gap-2">
                <Key size={18} />
                <span>অ্যাডভান্সড আনলক কোড জেনারেটর</span>
              </h2>

              <form onSubmit={handleGenerate} className="space-y-5">
                {/* 1. Subject Selector */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-bold text-gray-700">
                      ১. কোন কোন বিষয়ের জন্য কোড প্রযোজ্য হবে? (এক বা একাধিক সিলেক্ট করুন)
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
                          className={`p-2.5 rounded-xl border text-left text-xs transition cursor-pointer flex items-center gap-2 ${
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
                          <div className="truncate">
                            <span className="font-bold">
                              বই {ch.bookNumber}: {ch.courseCode}
                            </span>
                            <span className="block text-[10px] opacity-75 truncate">
                              {ch.titleBn}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 2. Code Quantity, Usage Limit (maxUses) & Format */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Number of codes */}
                  <div className="p-3.5 rounded-2xl bg-gray-50 border border-gray-200 space-y-2">
                    <label className="block text-xs font-bold text-gray-800">
                      ২. কতগুলো কোড তৈরি করবেন?
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {[1, 5, 10, 20, 50].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setGenCount(n)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold border cursor-pointer transition ${
                            genCount === n
                              ? "bg-[#141413] text-white border-[#141413]"
                              : "bg-white text-gray-700 border-gray-300"
                          }`}
                        >
                          {toBengaliDigits(n)}টি
                        </button>
                      ))}
                    </div>
                    <input
                      type="number"
                      min={1}
                      max={200}
                      value={genCount}
                      onChange={(e) =>
                        setGenCount(
                          Math.min(
                            200,
                            Math.max(1, parseInt(e.target.value, 10) || 1)
                          )
                        )
                      }
                      className="w-full px-3 py-1.5 rounded-xl border border-gray-300 text-xs font-mono font-bold bg-white"
                      placeholder="কাস্টম সংখ্যা (১-২০০)"
                    />
                  </div>

                  {/* Usage limit per code (maxUses) */}
                  <div className="p-3.5 rounded-2xl bg-gray-50 border border-gray-200 space-y-2">
                    <label className="block text-xs font-bold text-gray-800">
                      ৩. প্রতি কোড কতজন ব্যবহার করতে পারবে? (Max Uses)
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {[1, 5, 10, 20, 50].map((u) => (
                        <button
                          key={u}
                          type="button"
                          onClick={() => setMaxUses(u)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold border cursor-pointer transition ${
                            maxUses === u
                              ? "bg-blue-600 text-white border-blue-600"
                              : "bg-white text-gray-700 border-gray-300"
                          }`}
                        >
                          {toBengaliDigits(u)} জন
                        </button>
                      ))}
                    </div>
                    <input
                      type="number"
                      min={1}
                      max={10000}
                      value={maxUses}
                      onChange={(e) =>
                        setMaxUses(
                          Math.max(1, parseInt(e.target.value, 10) || 1)
                        )
                      }
                      className="w-full px-3 py-1.5 rounded-xl border border-gray-300 text-xs font-mono font-bold bg-white"
                      placeholder="কাস্টম লিমিট (যেমন: 20)"
                    />
                  </div>

                  {/* Access Duration (Permanent vs Days) */}
                  <div className="p-3.5 rounded-2xl bg-gray-50 border border-gray-200 space-y-2">
                    <label className="block text-xs font-bold text-gray-800">
                      ৪. আনলক অ্যাক্সেসের মেয়াদ (Access Duration)
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setAccessDurationType("permanent")}
                        className={`py-1.5 px-2 rounded-lg text-xs font-bold border cursor-pointer transition ${
                          accessDurationType === "permanent"
                            ? "bg-emerald-600 text-white border-emerald-600"
                            : "bg-white text-gray-700 border-gray-300"
                        }`}
                      >
                        স্থায়ী (Permanent)
                      </button>
                      <button
                        type="button"
                        onClick={() => setAccessDurationType("days")}
                        className={`py-1.5 px-2 rounded-lg text-xs font-bold border cursor-pointer transition ${
                          accessDurationType === "days"
                            ? "bg-amber-600 text-white border-amber-600"
                            : "bg-white text-gray-700 border-gray-300"
                        }`}
                      >
                        নির্দিষ্ট দিন (Timed)
                      </button>
                    </div>
                    {accessDurationType === "days" ? (
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap gap-1">
                          {[1, 3, 7, 15, 30].map((d) => (
                            <button
                              key={d}
                              type="button"
                              onClick={() => setAccessDurationDays(d)}
                              className={`px-2 py-0.5 rounded text-[11px] font-bold border cursor-pointer ${
                                accessDurationDays === d
                                  ? "bg-amber-600 text-white border-amber-600"
                                  : "bg-white text-gray-700 border-gray-300"
                              }`}
                            >
                              {toBengaliDigits(d)} দিন
                            </button>
                          ))}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min={1}
                            max={3650}
                            value={accessDurationDays}
                            onChange={(e) =>
                              setAccessDurationDays(
                                Math.max(1, parseInt(e.target.value, 10) || 1)
                              )
                            }
                            className="w-full px-3 py-1 rounded-xl border border-gray-300 text-xs font-mono font-bold bg-white"
                          />
                          <span className="text-xs text-gray-600 shrink-0">
                            দিন
                          </span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[11px] text-emerald-800 pt-1">
                        ইউজার কোড রিডিম করলে আজীবনের জন্য স্থায়ী আনলক হবে।
                      </p>
                    )}
                  </div>
                </div>

                {/* 3. Code Format, Prefix, Custom Code, Redeem Expiry, Note */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      কোড প্রিফিক্স ও দৈর্ঘ্য
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={codePrefix}
                        onChange={(e) =>
                          setCodePrefix(e.target.value.toUpperCase())
                        }
                        placeholder="BACK"
                        className="w-1/2 px-3 py-2 rounded-xl border border-gray-300 text-xs font-mono uppercase"
                        title="কোডের শুরুতে থাকা প্রিফিক্স"
                      />
                      <select
                        value={codeLength}
                        onChange={(e) =>
                          setCodeLength(parseInt(e.target.value, 10))
                        }
                        className="w-1/2 px-2 py-2 rounded-xl border border-gray-300 text-xs bg-white font-semibold"
                        title="র‍্যান্ডম অংশের অক্ষর সংখ্যা"
                      >
                        <option value={6}>৬ অক্ষর</option>
                        <option value={8}>৮ অক্ষর</option>
                        <option value={10}>১০ অক্ষর</option>
                        <option value={12}>১২ অক্ষর</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      কাস্টম কোড (১টির ক্ষেত্রে ঐচ্ছিক)
                    </label>
                    <input
                      type="text"
                      value={customCode}
                      onChange={(e) =>
                        setCustomCode(e.target.value.toUpperCase())
                      }
                      placeholder="যেমন: BOTANY-VIP"
                      className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      কোড ব্যবহারের শেষ তারিখ (ঐচ্ছিক)
                    </label>
                    <input
                      type="date"
                      value={codeRedeemExpiryDate}
                      onChange={(e) => setCodeRedeemExpiryDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      বায়ার নোট / ব্যাচ নাম
                    </label>
                    <input
                      type="text"
                      value={buyerNote}
                      onChange={(e) => setBuyerNote(e.target.value)}
                      placeholder="যেমন: রাফি / মেসেঞ্জার গ্রুপ"
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
                  className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-[#141413] text-white font-bold text-xs sm:text-sm hover:opacity-90 transition cursor-pointer disabled:opacity-50"
                >
                  {generating
                    ? "তৈরি হচ্ছে..."
                    : `${toBengaliDigits(genCount)}টি কোড তৈরি করুন →`}
                </button>
              </form>

              {/* Newly Generated Codes Box */}
              {newCodes.length > 0 && (
                <div className="mt-5 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-900">
                      🎉 সদ্য তৈরি হওয়া কোড ({toBengaliDigits(newCodes.length)}টি):
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
                  সকল কোডের তালিকা ({toBengaliDigits(filteredCodes.length)})
                </h3>

                {/* Filters & CSV Export */}
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
                      setCodeFilterStatus(
                        e.target.value as
                          | "all"
                          | "unused"
                          | "used"
                          | "expired"
                          | "disabled"
                      )
                    }
                    className="px-2.5 py-1.5 rounded-xl border border-gray-300 text-xs bg-white font-bold"
                  >
                    <option value="all">সকল স্ট্যাটাস</option>
                    <option value="unused">অব্যবহৃত ({unusedCodesCount})</option>
                    <option value="used">ব্যবহৃত ({usedCodesCount})</option>
                    <option value="expired">মেয়াদোত্তীর্ণ</option>
                    <option value="disabled">নিষ্ক্রিয় (Disabled)</option>
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

                  <button
                    type="button"
                    onClick={exportCodesToCSV}
                    className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer transition"
                    title="CSV ফাইলে এক্সপোর্ট করুন"
                  >
                    <Download size={13} />
                    <span>CSV এক্সপোর্ট</span>
                  </button>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-gray-200 text-gray-500 font-bold">
                      <th className="py-2.5 px-3">কোড</th>
                      <th className="py-2.5 px-3">বিষয় ও মেয়াদ</th>
                      <th className="py-2.5 px-3">ব্যবহার (Uses)</th>
                      <th className="py-2.5 px-3">স্ট্যাটাস</th>
                      <th className="py-2.5 px-3">ব্যবহারকারী / নোট</th>
                      <th className="py-2.5 px-3 text-right">অ্যাকশন</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredCodes.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="py-8 text-center text-gray-400"
                        >
                          কোনো কোড পাওয়া যায়নি।
                        </td>
                      </tr>
                    ) : (
                      filteredCodes.map((c) => {
                        const status = evaluateCodeStatus(c, serverNowMs);
                        const maxU = Math.max(1, Number(c.maxUses) || 1);
                        const usedU =
                          typeof c.usedCount === "number"
                            ? c.usedCount
                            : Array.isArray(c.redeemers)
                            ? c.redeemers.length
                            : c.used
                            ? 1
                            : 0;
                        const redeemers = Array.isArray(c.redeemers)
                          ? c.redeemers
                          : [];

                        return (
                          <React.Fragment key={c.code}>
                            <tr className="hover:bg-gray-50/60">
                              <td className="py-3 px-3 font-mono font-bold text-gray-900">
                                <div className="flex items-center gap-1.5">
                                  <span>{c.code}</span>
                                  {copiedKey === c.code && (
                                    <span className="text-[10px] text-emerald-600 font-sans">
                                      কপি হয়েছে!
                                    </span>
                                  )}
                                </div>
                              </td>

                              <td className="py-3 px-3 text-gray-600">
                                <div className="font-semibold text-gray-800">
                                  {formatAssignedSubjectsText(
                                    c.assignedSubjectIds
                                  )}
                                </div>
                                <div className="text-[10px] text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
                                  <span
                                    className={
                                      c.accessDurationDays
                                        ? "text-amber-700 font-bold"
                                        : "text-emerald-700 font-bold"
                                    }
                                  >
                                    {c.accessDurationDays
                                      ? `⏳ ${toBengaliDigits(c.accessDurationDays)} দিন`
                                      : "♾️ স্থায়ী"}
                                  </span>
                                  {c.expiresAt && (
                                    <span className="text-gray-400 font-mono">
                                      • শেষ তারিখ:{" "}
                                      {new Date(c.expiresAt).toLocaleDateString(
                                        "bn-BD"
                                      )}
                                    </span>
                                  )}
                                </div>
                              </td>

                              <td className="py-3 px-3 font-mono font-bold">
                                <span
                                  className={`px-2 py-0.5 rounded-lg text-[11px] ${
                                    usedU >= maxU
                                      ? "bg-blue-50 text-blue-800"
                                      : usedU > 0
                                      ? "bg-amber-50 text-amber-800"
                                      : "bg-gray-100 text-gray-700"
                                  }`}
                                >
                                  {usedU} / {maxU}
                                </span>
                              </td>

                              <td className="py-3 px-3">
                                {status === "disabled" ? (
                                  <span className="inline-flex items-center gap-1 text-red-700 bg-red-50 font-bold px-2 py-0.5 rounded-full text-[10px]">
                                    <Ban size={11} /> নিষ্ক্রিয়
                                  </span>
                                ) : status === "expired" ? (
                                  <span className="inline-flex items-center gap-1 text-amber-800 bg-amber-100 font-bold px-2 py-0.5 rounded-full text-[10px]">
                                    <Clock size={11} /> মেয়াদোত্তীর্ণ
                                  </span>
                                ) : status === "used" ? (
                                  <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 font-bold px-2 py-0.5 rounded-full text-[10px]">
                                    <Check size={11} strokeWidth={3} /> ব্যবহৃত (পূর্ণ)
                                  </span>
                                ) : status === "partial" ? (
                                  <span className="inline-flex items-center gap-1 text-blue-700 bg-blue-50 font-bold px-2 py-0.5 rounded-full text-[10px]">
                                    আংশিক ব্যবহৃত
                                  </span>
                                ) : (
                                  <span className="text-gray-600 bg-gray-100 font-bold px-2 py-0.5 rounded-full text-[10px]">
                                    অব্যবহৃত
                                  </span>
                                )}
                              </td>

                              <td className="py-3 px-3 text-gray-500">
                                {redeemers.length > 0 ? (
                                  <div>
                                    <span className="font-semibold text-gray-800">
                                      {redeemers[redeemers.length - 1].email}
                                    </span>
                                    {redeemers.length > 1 && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setExpandedCodeDetails(
                                            expandedCodeDetails === c.code
                                              ? null
                                              : c.code
                                          )
                                        }
                                        className="ml-1.5 text-[10px] font-bold text-blue-600 underline cursor-pointer"
                                      >
                                        +{toBengaliDigits(redeemers.length - 1)} জন দেখুন
                                      </button>
                                    )}
                                    {c.note && (
                                      <span className="block text-[10px] italic text-gray-400">
                                        নোট: {c.note}
                                      </span>
                                    )}
                                  </div>
                                ) : c.usedByEmail ? (
                                  <div>
                                    <span className="font-semibold text-gray-800">
                                      {c.usedByEmail}
                                    </span>
                                  </div>
                                ) : c.note ? (
                                  <span className="italic">{c.note}</span>
                                ) : (
                                  "—"
                                )}
                              </td>

                              <td className="py-3 px-3 text-right space-x-1 whitespace-nowrap">
                                <button
                                  onClick={() => copyText(c.code, c.code)}
                                  className="p-1.5 rounded-lg hover:bg-gray-200 transition text-gray-600 cursor-pointer"
                                  title="কপি করুন"
                                >
                                  <Copy size={13} />
                                </button>
                                <button
                                  onClick={() =>
                                    handleToggleDisableCode(
                                      c.code,
                                      !c.disabled
                                    )
                                  }
                                  className={`p-1.5 rounded-lg transition cursor-pointer ${
                                    c.disabled
                                      ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                      : "hover:bg-red-50 text-gray-500 hover:text-red-600"
                                  }`}
                                  title={
                                    c.disabled
                                      ? "কোডটি সক্রিয় (Enable) করুন"
                                      : "কোডটি নিষ্ক্রিয় (Disable) করুন"
                                  }
                                >
                                  <Ban size={13} />
                                </button>
                                {(usedU > 0 || c.used) && (
                                  <button
                                    onClick={() => handleResetCode(c.code)}
                                    className="p-1.5 rounded-lg hover:bg-amber-100 text-amber-700 transition cursor-pointer"
                                    title="রিসেট করুন (পুনরায় অব্যবহৃত করুন)"
                                  >
                                    <RotateCcw size={13} />
                                  </button>
                                )}
                                <button
                                  onClick={() => handleDeleteCode(c.code)}
                                  className="p-1.5 rounded-lg hover:bg-red-100 text-red-600 transition cursor-pointer"
                                  title="মুছে ফেলুন"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </td>
                            </tr>

                            {expandedCodeDetails === c.code &&
                              redeemers.length > 0 && (
                                <tr className="bg-gray-50">
                                  <td colSpan={6} className="p-3">
                                    <div className="text-[11px] font-bold text-gray-700 mb-1.5">
                                      কোড {c.code} ব্যবহারকারীদের তালিকা (
                                      {toBengaliDigits(redeemers.length)} জন):
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                      {redeemers.map((r, i) => (
                                        <div
                                          key={i}
                                          className="p-2 rounded-lg bg-white border border-gray-200 text-[11px]"
                                        >
                                          <div className="font-bold text-gray-900 truncate">
                                            {i + 1}. {r.email}
                                          </div>
                                          <div className="text-[10px] text-gray-400 font-mono">
                                            সময়:{" "}
                                            {new Date(
                                              r.redeemedAt
                                            ).toLocaleString("bn-BD")}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </td>
                                </tr>
                              )}
                          </React.Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 4: NOTICE BOARD MANAGEMENT */}
        {/* ============================================================== */}
        {activeTab === "notices" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in duration-150">
            {/* Create Notice Form */}
            <div className="lg:col-span-5 bg-white border border-gray-200 rounded-3xl p-6 shadow-xs space-y-4 h-fit">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-700 flex items-center justify-center">
                  <Bell size={18} />
                </div>
                <div>
                  <h2 className="font-serif font-black text-base text-gray-900">
                    নতুন নোটিশ পাঠান
                  </h2>
                  <p className="text-xs text-gray-500">
                    শিক্ষার্থীরা সম্পূর্ণ নোটিশটি স্ক্রল করে পড়তে পারবে
                  </p>
                </div>
              </div>

              {noticeMsg && (
                <div
                  className={`p-3 rounded-2xl text-xs font-bold flex items-center gap-2 ${
                    noticeMsg.type === "success"
                      ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
                      : "bg-red-50 border border-red-200 text-red-700"
                  }`}
                >
                  {noticeMsg.type === "success" ? (
                    <CheckCircle2 size={15} />
                  ) : (
                    <AlertCircle size={15} />
                  )}
                  <span>{noticeMsg.text}</span>
                </div>
              )}

              <form onSubmit={handleAddNotice} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    নোটিশের শিরোনাম (Title)
                  </label>
                  <input
                    type="text"
                    required
                    value={noticeTitle}
                    onChange={(e) => setNoticeTitle(e.target.value)}
                    placeholder="যেমন: ৩য় বর্ষের পরীক্ষার রুটিন ও ফ্রি সাজেশন আপডেট"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-xs font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    সম্পূর্ণ নোটিশ বিস্তারিত (Full Text)
                  </label>
                  <textarea
                    rows={7}
                    required
                    value={noticeBody}
                    onChange={(e) => setNoticeBody(e.target.value)}
                    placeholder="আপনার সম্পূর্ণ নোটিশ এখানে লিখুন। কোনো অংশ কাটা যাবে না, শিক্ষার্থীরা পুরো নোটিশ পড়তে পারবে..."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-xs leading-relaxed"
                  />
                </div>

                <label className="flex items-center gap-2 text-xs font-bold text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={noticeImportant}
                    onChange={(e) => setNoticeImportant(e.target.checked)}
                    className="w-4 h-4 rounded accent-black"
                  />
                  <span>জরুরি নোটিশ (Important Highlight) হিসেবে মার্ক করুন</span>
                </label>

                <button
                  type="submit"
                  disabled={savingNotice}
                  className="w-full py-3 rounded-2xl bg-[#141413] text-white font-bold text-xs sm:text-sm hover:opacity-90 transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Plus size={15} />
                  <span>
                    {savingNotice ? "প্রকাশ হচ্ছে..." : "নোটিশ প্রকাশ করুন →"}
                  </span>
                </button>
              </form>
            </div>

            {/* Published Notices List */}
            <div className="lg:col-span-7 bg-white border border-gray-200 rounded-3xl p-6 shadow-xs space-y-4">
              <h3 className="font-serif font-black text-base text-gray-900">
                প্রকাশিত সকল নোটিশ ({toBengaliDigits(notices.length)})
              </h3>

              {notices.length === 0 ? (
                <div className="text-center py-12 text-xs text-gray-400">
                  এখনো কোনো নোটিশ পাঠানো হয়নি।
                </div>
              ) : (
                <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
                  {notices.map((n) => (
                    <div
                      key={n.id}
                      className={`p-4 rounded-2xl border space-y-2 ${
                        n.important
                          ? "bg-amber-50/40 border-amber-300"
                          : "bg-gray-50 border-gray-200"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            {n.important && (
                              <span className="text-[10px] font-bold bg-amber-200 text-amber-950 px-2 py-0.5 rounded-full">
                                জরুরি
                              </span>
                            )}
                            <h4 className="font-bold text-sm text-gray-900">
                              {n.title}
                            </h4>
                          </div>
                          <span className="text-[11px] text-gray-400 font-mono">
                            {new Date(n.createdAt).toLocaleString("bn-BD")}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteNotice(n.id)}
                          className="p-1.5 rounded-lg hover:bg-red-100 text-red-600 transition cursor-pointer shrink-0"
                          title="নোটিশ মুছে ফেলুন"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">
                        {n.body}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 5: PRICING & OFFERS */}
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
        {/* TAB 6: CONTACT CHANNELS */}
        {/* ============================================================== */}
        {activeTab === "channels" &&
          (() => {
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

                <div className="my-5 p-4 rounded-2xl bg-gradient-to-br from-blue-50/70 to-indigo-50/50 border border-blue-200/80 text-xs text-gray-700 space-y-2.5">
                  <div className="flex items-center gap-2 text-blue-900 font-bold text-xs">
                    <Info size={16} className="text-blue-600 shrink-0" />
                    <span>কীভাবে সঠিক নম্বর বা লিংক যুক্ত করবেন?</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1 text-[11px] leading-relaxed">
                    <div className="p-2.5 rounded-xl bg-white/80 border border-blue-100 space-y-1">
                      <span className="font-bold text-emerald-700 flex items-center gap-1">
                        <MessageCircle size={13} /> WhatsApp / Business:
                      </span>
                      <p className="text-gray-600">
                        সাধারণ নম্বর (017...) অথবা বিজনেস লিংক (wa.me/message/...) সরাসরি দিন।
                      </p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white/80 border border-blue-100 space-y-1">
                      <span className="font-bold text-[#229ED9] flex items-center gap-1">
                        <Send size={13} /> Telegram:
                      </span>
                      <p className="text-gray-600">
                        ইউজারনেম (@username) অথবা সরাসরি https://t.me/username দিতে পারেন।
                      </p>
                    </div>
                  </div>
                </div>

                <form onSubmit={handleSaveSettings} className="space-y-5 mt-6">
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
                          setSettingsForm({
                            ...settingsForm,
                            contactChannel: "both",
                          })
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
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#229ED9] text-white text-[11px] font-bold hover:bg-[#1E88E5] transition cursor-pointer"
                        >
                          <ExternalLink size={12} />
                          <span>টেস্ট করুন</span>
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
                          className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs bg-white"
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
                          className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs bg-white"
                        />
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
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#25D366] text-white text-[11px] font-bold hover:bg-[#1EBE5D] transition cursor-pointer"
                        >
                          <ExternalLink size={12} />
                          <span>টেস্ট করুন</span>
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-gray-600 mb-1">
                          WhatsApp নম্বর
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
                          placeholder="017XXXXXXXX"
                          className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs bg-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-gray-600 mb-1">
                          WhatsApp লিঙ্ক
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
                          placeholder="https://wa.me/..."
                          className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs bg-white font-mono"
                        />
                      </div>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={savingSettings}
                    className="w-full py-3 rounded-2xl bg-[#141413] text-white font-bold text-xs sm:text-sm hover:opacity-90 transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <Save size={15} />
                    <span>
                      {savingSettings
                        ? "সেভ হচ্ছে..."
                        : "যোগাযোগ সেটিংস সেভ করুন"}
                    </span>
                  </button>
                </form>
              </div>
            );
          })()}

        {/* ============================================================== */}
        {/* TAB 7: USERS DIRECTORY */}
        {/* ============================================================== */}
        {activeTab === "users" && (
          <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-xs animate-in fade-in duration-150 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-serif font-black text-base text-gray-900">
                  নিবন্ধিত শিক্ষার্থী তালিকা ({toBengaliDigits(usersList.length)})
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
                          {toBengaliDigits(u.unlockedCount)}/৭টি বিষয়
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
        {/* TAB 8: SECURITY & SETTINGS */}
        {/* ============================================================== */}
        {activeTab === "security" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in duration-150">
            {/* System Announcement & Limits */}
            <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-xs space-y-4">
              <h3 className="font-serif font-black text-base text-gray-900 flex items-center gap-2">
                <Settings size={16} />
                <span>সিস্টেম ঘোষণা ও ফ্রি পৃষ্ঠা লিমিট</span>
              </h3>

              <form onSubmit={handleSaveSettings} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    ফ্রি প্রিভিউ পৃষ্ঠা লিমিট (লকড বিষয়ের জন্য)
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
                    হোম পেজ ও ইন-অ্যাপ সংক্ষিপ্ত ঘোষণা (Announcement)
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
                  {changingPassword
                    ? "পরিবর্তন হচ্ছে..."
                    : "পাসওয়ার্ড পরিবর্তন করুন"}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
