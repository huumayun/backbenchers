import { NextRequest, NextResponse } from "next/server";
import {
  verifyUserActiveSession,
  acquireOfflineBookLease,
  releaseOfflineBookLease,
} from "@/lib/server/store";
import { CHAPTERS } from "@/lib/book/chapters";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      action = "acquire",
      uid: bodyUid,
      sessionToken: bodyToken,
      deviceId: bodyDeviceId,
      chapterIndex,
      subjectId: bodySubjectId,
    } = body;

    const uid =
      bodyUid ||
      req.headers.get("x-user-uid") ||
      req.cookies.get("ebook_uid")?.value ||
      "";
    const sessionToken =
      bodyToken ||
      req.headers.get("x-session-token") ||
      req.cookies.get("ebook_session_token")?.value ||
      "";
    const deviceId =
      bodyDeviceId || req.headers.get("x-device-id") || "browser";

    if (!uid || !sessionToken) {
      return NextResponse.json(
        {
          success: false,
          message: "অফলাইন মোড ব্যবহার করতে অনুগ্রহ করে লগইন করুন।",
        },
        { status: 401 }
      );
    }

    const sessionCheck = await verifyUserActiveSession(uid, sessionToken);
    if (!sessionCheck.valid) {
      return NextResponse.json(
        {
          success: false,
          sessionInvalidated: Boolean(sessionCheck.sessionInvalidated),
          message:
            "আপনার লগইন সেশনটি আর সক্রিয় নেই। আবার লগইন করে চেষ্টা করুন।",
        },
        { status: 401 }
      );
    }

    const resolvedSubjectId =
      bodySubjectId ||
      (typeof chapterIndex === "number" && CHAPTERS[chapterIndex]
        ? CHAPTERS[chapterIndex].id
        : undefined);

    if (action === "acquire" || action === "renew") {
      if (
        resolvedSubjectId &&
        !sessionCheck.unlockedSubjects.includes(resolvedSubjectId) &&
        sessionCheck.user?.role !== "admin"
      ) {
        return NextResponse.json(
          {
            success: false,
            message: "এই বিষয়টি অফলাইনে সেভ করার জন্য আগে আনলক করতে হবে।",
          },
          { status: 403 }
        );
      }

      const lease = await acquireOfflineBookLease(
        uid,
        deviceId,
        resolvedSubjectId
      );
      return NextResponse.json({
        success: true,
        expiresAt: lease.expiresAt,
        offlineSubjectIds: lease.offlineSubjectIds,
        message: "অফলাইন লিজ সফলভাবে সক্রিয় হয়েছে।",
      });
    }

    if (action === "release") {
      const released = await releaseOfflineBookLease(
        uid,
        deviceId,
        resolvedSubjectId
      );
      return NextResponse.json({
        success: true,
        offlineSubjectIds: released.offlineSubjectIds,
        message: "অফলাইন লিজ রিলিজ করা হয়েছে।",
      });
    }

    return NextResponse.json(
      { success: false, message: "Invalid action" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Offline lease API error:", error);
    return NextResponse.json(
      { success: false, message: "সার্ভার সমস্যা হয়েছে।" },
      { status: 500 }
    );
  }
}
