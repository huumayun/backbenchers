import { NextRequest, NextResponse } from "next/server";
import {
  registerUserAccount,
  loginUserAccount,
  issueSingleActiveSession,
  verifyUserActiveSession,
  invalidateUserSession,
  getUserAccountById,
  normalizeUnlockedSubjects,
  getPermanentlyUnlockedSubjects,
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
    "";
  const sessionToken =
    req.nextUrl.searchParams.get("sessionToken") ||
    req.headers.get("x-session-token") ||
    req.cookies.get("ebook_session_token")?.value ||
    "";

  const serverTime = new Date().toISOString();

  if (!uid || !sessionToken) {
    return NextResponse.json({
      valid: false,
      sessionInvalidated: false,
      unlockedSubjects: [],
      permanentlyUnlockedSubjects: [],
      subjectAccess: {},
      serverTime,
    });
  }

  const check = await verifyUserActiveSession(uid, sessionToken);
  if (!check.valid) {
    return NextResponse.json(
      {
        valid: false,
        sessionInvalidated: Boolean(check.sessionInvalidated),
        unlockedSubjects: [],
        permanentlyUnlockedSubjects: [],
        subjectAccess: {},
        serverTime,
        message:
          "অন্য একটি ডিভাইস বা ব্রাউজারে আপনার অ্যাকাউন্টে লগইন করায় এই ডিভাইসের সেশনটি স্বয়ংক্রিয়ভাবে লগআউট হয়েছে।",
      },
      { status: 401 }
    );
  }

  const permanentlyUnlockedSubjects = getPermanentlyUnlockedSubjects(check.user);

  return NextResponse.json({
    valid: true,
    sessionInvalidated: false,
    unlockedSubjects: check.unlockedSubjects,
    permanentlyUnlockedSubjects,
    subjectAccess: check.user?.subjectAccess || {},
    user: check.user || null,
    serverTime,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      action,
      email,
      password,
      displayName,
      firebaseUid,
      deviceId,
      uid,
    } = body;

    const clientIp = getClientIp(req);
    const userAgent = req.headers.get("user-agent") || "unknown";
    const serverTime = new Date().toISOString();

    if (action === "logout") {
      const targetUid = uid || req.cookies.get("ebook_uid")?.value;
      if (targetUid) {
        await invalidateUserSession(String(targetUid));
      }
      const res = NextResponse.json({
        success: true,
        message: "লগআউট সফল হয়েছে।",
        serverTime,
      });
      res.cookies.delete("ebook_session_token");
      res.cookies.delete("ebook_uid");
      return res;
    }

    if (action === "firebase_session" && uid) {
      const userRecord = await getUserAccountById(String(uid), email);

      const session = await issueSingleActiveSession(
        String(uid),
        String(deviceId || "browser"),
        clientIp,
        userAgent
      );
      const unlockedSubjects = normalizeUnlockedSubjects(userRecord);
      const permanentlyUnlockedSubjects = getPermanentlyUnlockedSubjects(userRecord);

      const res = NextResponse.json({
        success: true,
        sessionToken: session.sessionToken,
        unlockedSubjects,
        permanentlyUnlockedSubjects,
        subjectAccess: userRecord?.subjectAccess || {},
        serverTime,
        user: userRecord
          ? {
              uid: userRecord.uid,
              email: userRecord.email,
              displayName: userRecord.displayName,
              hasAccess: unlockedSubjects.length > 0,
              unlockedSubjects,
              subjectAccess: userRecord.subjectAccess || {},
              role: userRecord.role || "reader",
              unlockCode: userRecord.unlockCode || null,
            }
          : null,
      });

      res.cookies.set("ebook_session_token", session.sessionToken, {
        httpOnly: false,
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
        sameSite: "lax",
      });
      res.cookies.set("ebook_uid", String(uid), {
        httpOnly: false,
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
        sameSite: "lax",
      });
      return res;
    }

    if (!email || !password) {
      return NextResponse.json(
        { success: false, message: "ইমেইল এবং পাসওয়ার্ড দিন।" },
        { status: 400 }
      );
    }

    if (action === "register") {
      if (String(password).length < 6) {
        return NextResponse.json(
          { success: false, message: "পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।" },
          { status: 400 }
        );
      }

      const result = await registerUserAccount(
        String(email),
        String(password),
        String(displayName || ""),
        firebaseUid
      );

      if (!result.success || !result.user) {
        return NextResponse.json(
          {
            success: false,
            message: result.message || "রেজিস্ট্রেশন ব্যর্থ হয়েছে।",
          },
          { status: 400 }
        );
      }

      const session = await issueSingleActiveSession(
        result.user.uid,
        String(deviceId || "browser"),
        clientIp,
        userAgent
      );

      const res = NextResponse.json({
        success: true,
        user: {
          ...result.user,
          unlockedSubjects: [],
          subjectAccess: {},
          hasAccess: false,
        },
        sessionToken: session.sessionToken,
        unlockedSubjects: [],
        permanentlyUnlockedSubjects: [],
        subjectAccess: {},
        serverTime,
        message: "রেজিস্ট্রেশন সফল হয়েছে!",
      });

      res.cookies.set("ebook_session_token", session.sessionToken, {
        httpOnly: false,
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
        sameSite: "lax",
      });
      res.cookies.set("ebook_uid", result.user.uid, {
        httpOnly: false,
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
        sameSite: "lax",
      });

      return res;
    }

    if (action === "login") {
      const result = await loginUserAccount(String(email), String(password));
      if (!result.success || !result.user) {
        return NextResponse.json(
          {
            success: false,
            message: result.message || "ইমেইল বা পাসওয়ার্ড সঠিক নয়।",
          },
          { status: 401 }
        );
      }

      const user = result.user;
      const unlockedSubjects = normalizeUnlockedSubjects(user);
      const permanentlyUnlockedSubjects = getPermanentlyUnlockedSubjects(user);

      // Issue a brand new single active session for this user (invalidates any previous session on another device/browser)
      const session = await issueSingleActiveSession(
        user.uid,
        String(deviceId || "browser"),
        clientIp,
        userAgent
      );

      const res = NextResponse.json({
        success: true,
        user: {
          ...user,
          unlockedSubjects,
          hasAccess: unlockedSubjects.length > 0,
        },
        sessionToken: session.sessionToken,
        unlockedSubjects,
        permanentlyUnlockedSubjects,
        subjectAccess: user.subjectAccess || {},
        unlockedCode: user.unlockCode || null,
        serverTime,
        message: "লগইন সফল হয়েছে!",
      });

      res.cookies.set("ebook_session_token", session.sessionToken, {
        httpOnly: false,
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
        sameSite: "lax",
      });
      res.cookies.set("ebook_uid", user.uid, {
        httpOnly: false,
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
        sameSite: "lax",
      });

      return res;
    }

    return NextResponse.json(
      { success: false, message: "Invalid action" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Auth API error:", error);
    return NextResponse.json(
      { success: false, message: "সার্ভার সমস্যা হয়েছে। আবার চেষ্টা করুন।" },
      { status: 500 }
    );
  }
}
