import { NextRequest, NextResponse } from "next/server";
import {
  getSiteSettings,
  verifyUserActiveSession,
  redeemUnlockCodeForUser,
  SUBJECT_PRICE_BDT,
} from "@/lib/server/store";

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "127.0.0.1"
  );
}

export async function GET(req: NextRequest) {
  const uid =
    req.nextUrl.searchParams.get("uid") ||
    req.headers.get("x-user-uid") ||
    req.cookies.get("ebook_uid")?.value ||
    null;
  const sessionToken =
    req.nextUrl.searchParams.get("sessionToken") ||
    req.headers.get("x-session-token") ||
    req.cookies.get("ebook_session_token")?.value ||
    null;

  const settings = await getSiteSettings();

  if (uid && sessionToken) {
    const check = await verifyUserActiveSession(uid, sessionToken);
    if (!check.valid) {
      return NextResponse.json({
        unlocked: false,
        unlockedSubjects: [],
        sessionInvalidated: Boolean(check.sessionInvalidated),
        pricePerSubject: SUBJECT_PRICE_BDT,
        settings,
      });
    }

    return NextResponse.json({
      unlocked: check.unlockedSubjects.length > 0,
      unlockedSubjects: check.unlockedSubjects,
      sessionInvalidated: false,
      code: check.user?.unlockCode || null,
      pricePerSubject: SUBJECT_PRICE_BDT,
      settings,
    });
  }

  return NextResponse.json({
    unlocked: false,
    unlockedSubjects: [],
    sessionInvalidated: false,
    pricePerSubject: SUBJECT_PRICE_BDT,
    settings,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { code, deviceId, uid, email, sessionToken: bodySessionToken } = body;

    const activeUid =
      uid ||
      req.headers.get("x-user-uid") ||
      req.cookies.get("ebook_uid")?.value ||
      null;
    const activeSessionToken =
      bodySessionToken ||
      req.headers.get("x-session-token") ||
      req.cookies.get("ebook_session_token")?.value ||
      null;

    // Require account login/registration before redeeming an unlock code
    if (!activeUid) {
      return NextResponse.json(
        {
          success: false,
          message: "আনলক কোড ব্যবহার করার আগে অনুগ্রহ করে রেজিস্ট্রেশন বা লগইন করুন।",
        },
        { status: 401 }
      );
    }

    // Verify single active login session on server
    if (activeSessionToken) {
      const sessionCheck = await verifyUserActiveSession(
        String(activeUid),
        String(activeSessionToken)
      );
      if (!sessionCheck.valid && sessionCheck.sessionInvalidated) {
        return NextResponse.json(
          {
            success: false,
            sessionInvalidated: true,
            message:
              "অন্য একটি ডিভাইসে আপনার অ্যাকাউন্টে লগইন করায় এই সেশনটি বাতিল হয়েছে। অনুগ্রহ করে আবার লগইন করুন।",
          },
          { status: 401 }
        );
      }
    }

    if (!code || typeof code !== "string") {
      return NextResponse.json(
        { success: false, message: "অনুগ্রহ করে আনলক কোডটি লিখুন।" },
        { status: 400 }
      );
    }

    const clientIp = getClientIp(req);
    const userAgent = req.headers.get("user-agent") || "unknown";

    const result = await redeemUnlockCodeForUser({
      code: code.trim(),
      uid: String(activeUid),
      email: email ? String(email) : null,
      deviceId: String(deviceId || "browser"),
      ip: clientIp,
      userAgent,
    });

    return NextResponse.json(
      {
        success: result.success,
        message: result.message,
        unlockedSubjects: result.unlockedSubjects || [],
        newlyUnlockedSubjects: result.newlyUnlockedSubjects || [],
        code: result.code || null,
      },
      { status: result.status }
    );
  } catch (err) {
    console.error("Unlock error:", err);
    return NextResponse.json(
      { success: false, message: "সার্ভার সমস্যা হয়েছে। আবার চেষ্টা করুন।" },
      { status: 500 }
    );
  }
}
