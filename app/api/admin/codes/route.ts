import { NextRequest, NextResponse } from "next/server";
import {
  listAllCodes,
  saveCodeRecord,
  deleteCodeRecord,
  getCodeRecord,
  getSiteSettings,
  updateSiteSettings,
  verifyAdminSecret,
  changeAdminSecret,
  ALL_SUBJECT_IDS,
  SubjectFreeWindow,
  NoticeItem,
} from "@/lib/server/store";
import { CHAPTERS } from "@/lib/book/chapters";

function generateRandomCode(
  prefix?: string,
  codeLength: number = 8,
  existingSet?: Set<string>
): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const cleanPrefix = (prefix || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
  const len = Math.min(Math.max(4, Number(codeLength) || 8), 16);

  for (let attempt = 0; attempt < 50; attempt++) {
    let raw = "";
    for (let i = 0; i < len; i++) {
      raw += chars[Math.floor(Math.random() * chars.length)];
    }
    const grouped =
      raw.length >= 8
        ? `${raw.slice(0, 4)}-${raw.slice(4)}`
        : raw;
    const candidate = cleanPrefix ? `${cleanPrefix}-${grouped}` : grouped;
    if (!existingSet || !existingSet.has(candidate)) {
      existingSet?.add(candidate);
      return candidate;
    }
  }
  const fallback = `${Date.now().toString(36).toUpperCase()}-${Math.random()
    .toString(36)
    .substring(2, 6)
    .toUpperCase()}`;
  return cleanPrefix ? `${cleanPrefix}-${fallback}` : fallback;
}

export async function GET(req: NextRequest) {
  const secret =
    req.nextUrl.searchParams.get("secret") ||
    req.headers.get("x-admin-secret");

  if (!(await verifyAdminSecret(secret))) {
    return NextResponse.json(
      { error: "অ্যাডমিন পাসওয়ার্ড সঠিক নয়।" },
      { status: 401 }
    );
  }

  const [codes, settings] = await Promise.all([
    listAllCodes(),
    getSiteSettings(),
  ]);

  const subjects = CHAPTERS.map((ch) => ({
    id: ch.id,
    index: ch.index,
    bookNumber: ch.bookNumber,
    courseCode: ch.courseCode,
    titleBn: ch.titleBn,
  }));

  return NextResponse.json({
    codes,
    settings,
    subjects,
    serverTime: new Date().toISOString(),
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      secret,
      action = "generate",
      count = 1,
      customCode,
      prefix,
      codeLength = 8,
      maxUses = 1,
      accessDurationDays = null,
      expiresAt = null,
      disabled,
      note,
      code,
      settings,
      assignedSubjectIds,
      newPassword,
      // Free subject fields
      subjectIds,
      subjectId,
      enabled,
      isUnlimited,
      durationDays,
      startAt,
      endAt,
      extendDays,
      // Notice fields
      noticeTitle,
      noticeBody,
      noticeImportant,
      noticeId,
    } = body;

    if (!(await verifyAdminSecret(secret))) {
      return NextResponse.json(
        { error: "অ্যাডমিন পাসওয়ার্ড সঠিক নয়।" },
        { status: 401 }
      );
    }

    if (action === "change_password") {
      if (!newPassword || String(newPassword).trim().length < 4) {
        return NextResponse.json(
          { error: "নতুন পাসওয়ার্ড কমপক্ষে ৪ অক্ষরের হতে হবে।" },
          { status: 400 }
        );
      }
      await changeAdminSecret(String(newPassword).trim());
      return NextResponse.json({
        success: true,
        message: "✅ অ্যাডমিন পাসওয়ার্ড সফলভাবে পরিবর্তন হয়েছে!",
      });
    }

    if (action === "generate") {
      const validSubjects: string[] = Array.isArray(assignedSubjectIds)
        ? assignedSubjectIds.filter((id: string) => ALL_SUBJECT_IDS.includes(id))
        : ALL_SUBJECT_IDS;

      if (validSubjects.length === 0) {
        return NextResponse.json(
          { error: "কমপক্ষে ১টি বিষয় (Subject) সিলেক্ট করুন।" },
          { status: 400 }
        );
      }

      const normalizedMaxUses = Math.min(
        Math.max(1, Math.floor(Number(maxUses) || 1)),
        10000
      );
      const normalizedDurationDays =
        accessDurationDays !== null &&
        accessDurationDays !== undefined &&
        accessDurationDays !== "" &&
        Number(accessDurationDays) > 0
          ? Math.floor(Number(accessDurationDays))
          : null;
      const normalizedExpiresAt =
        expiresAt && String(expiresAt).trim() && !isNaN(Date.parse(String(expiresAt)))
          ? new Date(String(expiresAt)).toISOString()
          : null;

      const existingCodesList = await listAllCodes();
      const existingSet = new Set(existingCodesList.map((c) => c.code.toUpperCase()));

      const created: string[] = [];
      const nowIso = new Date().toISOString();

      if (customCode && String(customCode).trim()) {
        const clean = String(customCode).toUpperCase().trim();
        await saveCodeRecord({
          code: clean,
          used: false,
          disabled: false,
          maxUses: normalizedMaxUses,
          usedCount: 0,
          redeemers: [],
          accessDurationDays: normalizedDurationDays,
          expiresAt: normalizedExpiresAt,
          assignedSubjectIds: validSubjects,
          note: note || "",
          createdAt: nowIso,
        });
        created.push(clean);
      } else {
        const num = Math.min(Math.max(1, Number(count) || 1), 200);
        for (let i = 0; i < num; i++) {
          const newCode = generateRandomCode(prefix, Number(codeLength) || 8, existingSet);
          await saveCodeRecord({
            code: newCode,
            used: false,
            disabled: false,
            maxUses: normalizedMaxUses,
            usedCount: 0,
            redeemers: [],
            accessDurationDays: normalizedDurationDays,
            expiresAt: normalizedExpiresAt,
            assignedSubjectIds: validSubjects,
            note: note || "",
            createdAt: nowIso,
          });
          created.push(newCode);
        }
      }
      const allCodes = await listAllCodes();
      return NextResponse.json({
        success: true,
        newCodes: created,
        codes: allCodes,
        serverTime: new Date().toISOString(),
      });
    }

    if (action === "toggle_disable" && code) {
      const existing = await getCodeRecord(code);
      if (existing) {
        const nextDisabled =
          typeof disabled === "boolean" ? disabled : !existing.disabled;
        await saveCodeRecord({
          ...existing,
          disabled: nextDisabled,
        });
      }
      const allCodes = await listAllCodes();
      return NextResponse.json({
        success: true,
        codes: allCodes,
        serverTime: new Date().toISOString(),
      });
    }

    if (action === "reset" && code) {
      const existing = await getCodeRecord(code);
      if (existing) {
        await saveCodeRecord({
          ...existing,
          used: false,
          usedCount: 0,
          redeemers: [],
          usedByUid: null,
          usedByEmail: null,
          usedByDevice: null,
          usedByIP: null,
          userAgent: null,
          usedAt: null,
        });
      }
      const allCodes = await listAllCodes();
      return NextResponse.json({
        success: true,
        codes: allCodes,
        serverTime: new Date().toISOString(),
      });
    }

    if (action === "delete" && code) {
      await deleteCodeRecord(code);
      const allCodes = await listAllCodes();
      return NextResponse.json({
        success: true,
        codes: allCodes,
        serverTime: new Date().toISOString(),
      });
    }

    if (action === "set_free_subjects") {
      const currentSettings = await getSiteSettings();
      const freeSubjectsMap: Record<string, SubjectFreeWindow> = {
        ...(currentSettings.freeSubjects || {}),
      };

      const targetIds: string[] = Array.isArray(subjectIds)
        ? subjectIds.filter((id: string) => ALL_SUBJECT_IDS.includes(id))
        : subjectId && ALL_SUBJECT_IDS.includes(String(subjectId))
        ? [String(subjectId)]
        : [];

      if (targetIds.length === 0) {
        return NextResponse.json(
          { error: "কমপক্ষে ১টি বিষয় সিলেক্ট করুন।" },
          { status: 400 }
        );
      }

      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();

      for (const subId of targetIds) {
        if (!enabled) {
          freeSubjectsMap[subId] = {
            subjectId: subId,
            enabled: false,
            isUnlimited: false,
            durationDays: null,
            startAt: freeSubjectsMap[subId]?.startAt || nowIso,
            endAt: nowIso,
            updatedAt: nowIso,
          };
          continue;
        }

        const existingWin = freeSubjectsMap[subId];
        const parsedStartMs =
          startAt && !isNaN(Date.parse(String(startAt)))
            ? Date.parse(String(startAt))
            : nowMs;
        const effectiveStartIso = new Date(parsedStartMs).toISOString();

        if (isUnlimited) {
          freeSubjectsMap[subId] = {
            subjectId: subId,
            enabled: true,
            isUnlimited: true,
            durationDays: null,
            startAt: effectiveStartIso,
            endAt: null,
            updatedAt: nowIso,
          };
        } else if (extendDays && Number(extendDays) > 0 && existingWin) {
          const baseEndMs =
            existingWin.endAt && !isNaN(Date.parse(existingWin.endAt))
              ? Math.max(nowMs, Date.parse(existingWin.endAt))
              : nowMs;
          const nextEndIso = new Date(
            baseEndMs + Number(extendDays) * 24 * 60 * 60 * 1000
          ).toISOString();
          freeSubjectsMap[subId] = {
            subjectId: subId,
            enabled: true,
            isUnlimited: false,
            durationDays:
              (existingWin.durationDays || 0) + Number(extendDays),
            startAt: existingWin.startAt || nowIso,
            endAt: nextEndIso,
            updatedAt: nowIso,
          };
        } else {
          const days = Math.max(1, Number(durationDays) || 1);
          const effectiveEndIso =
            endAt && !isNaN(Date.parse(String(endAt)))
              ? new Date(String(endAt)).toISOString()
              : new Date(parsedStartMs + days * 24 * 60 * 60 * 1000).toISOString();

          freeSubjectsMap[subId] = {
            subjectId: subId,
            enabled: true,
            isUnlimited: false,
            durationDays: days,
            startAt: effectiveStartIso,
            endAt: effectiveEndIso,
            updatedAt: nowIso,
          };
        }
      }

      const updated = await updateSiteSettings({
        ...currentSettings,
        freeSubjects: freeSubjectsMap,
      });

      return NextResponse.json({
        success: true,
        settings: updated,
        serverTime: nowIso,
      });
    }

    if (action === "add_notice") {
      if (!noticeBody || !String(noticeBody).trim()) {
        return NextResponse.json(
          { error: "নোটিশের বিস্তারিত টেক্সট লিখুন।" },
          { status: 400 }
        );
      }
      const currentSettings = await getSiteSettings();
      const nowIso = new Date().toISOString();
      const newNotice: NoticeItem = {
        id: "ntc_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6),
        title: String(noticeTitle || "গুরুত্বপূর্ণ নোটিশ").trim(),
        body: String(noticeBody).trim(),
        createdAt: nowIso,
        important: Boolean(noticeImportant),
      };
      const nextNotices = [newNotice, ...(currentSettings.notices || [])];
      const updated = await updateSiteSettings({
        ...currentSettings,
        notices: nextNotices,
        announcement: newNotice.body,
      });
      return NextResponse.json({
        success: true,
        settings: updated,
        notice: newNotice,
        serverTime: nowIso,
      });
    }

    if (action === "delete_notice" && noticeId) {
      const currentSettings = await getSiteSettings();
      const nextNotices = (currentSettings.notices || []).filter(
        (n) => n.id !== String(noticeId)
      );
      const updated = await updateSiteSettings({
        ...currentSettings,
        notices: nextNotices,
        announcement: nextNotices[0]?.body || "",
      });
      return NextResponse.json({
        success: true,
        settings: updated,
        serverTime: new Date().toISOString(),
      });
    }

    if (action === "settings" && settings) {
      const updated = await updateSiteSettings(settings);
      return NextResponse.json({
        success: true,
        settings: updated,
        serverTime: new Date().toISOString(),
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    console.error("Admin API error:", err);
    return NextResponse.json(
      { error: "সার্ভার সমস্যা হয়েছে।" },
      { status: 500 }
    );
  }
}
