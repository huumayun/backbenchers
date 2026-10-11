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
} from "@/lib/server/store";
import { CHAPTERS } from "@/lib/book/chapters";

function generateRandomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return `${code.slice(0, 4)}-${code.slice(4)}`;
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

  return NextResponse.json({ codes, settings, subjects });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      secret,
      action = "generate",
      count = 1,
      customCode,
      note,
      code,
      settings,
      assignedSubjectIds,
      newPassword,
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

      const created: string[] = [];
      if (customCode && String(customCode).trim()) {
        const clean = String(customCode).toUpperCase().trim();
        await saveCodeRecord({
          code: clean,
          used: false,
          assignedSubjectIds: validSubjects,
          note: note || "",
          createdAt: new Date().toISOString(),
        });
        created.push(clean);
      } else {
        const num = Math.min(Math.max(1, Number(count) || 1), 50);
        for (let i = 0; i < num; i++) {
          const newCode = generateRandomCode();
          await saveCodeRecord({
            code: newCode,
            used: false,
            assignedSubjectIds: validSubjects,
            note: note || "",
            createdAt: new Date().toISOString(),
          });
          created.push(newCode);
        }
      }
      const allCodes = await listAllCodes();
      return NextResponse.json({
        success: true,
        newCodes: created,
        codes: allCodes,
      });
    }

    if (action === "reset" && code) {
      const existing = await getCodeRecord(code);
      if (existing) {
        await saveCodeRecord({
          ...existing,
          used: false,
          usedByUid: null,
          usedByEmail: null,
          usedByDevice: null,
          usedByIP: null,
          userAgent: null,
          usedAt: null,
        });
      }
      const allCodes = await listAllCodes();
      return NextResponse.json({ success: true, codes: allCodes });
    }

    if (action === "delete" && code) {
      await deleteCodeRecord(code);
      const allCodes = await listAllCodes();
      return NextResponse.json({ success: true, codes: allCodes });
    }

    if (action === "settings" && settings) {
      const updated = await updateSiteSettings(settings);
      return NextResponse.json({ success: true, settings: updated });
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
