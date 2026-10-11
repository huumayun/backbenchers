import { NextRequest, NextResponse } from "next/server";
import {
  getUserReadingData,
  saveUserReadingData,
  verifyUserActiveSession,
} from "@/lib/server/store";

export async function GET(req: NextRequest) {
  try {
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

    if (!uid) {
      return NextResponse.json({ data: null, unlockedSubjects: [] });
    }

    if (sessionToken) {
      const check = await verifyUserActiveSession(uid, sessionToken);
      if (!check.valid && check.sessionInvalidated) {
        return NextResponse.json(
          {
            data: null,
            sessionInvalidated: true,
            unlockedSubjects: [],
          },
          { status: 401 }
        );
      }
    }

    const data = await getUserReadingData(uid);
    return NextResponse.json({
      data,
      unlockedSubjects: data?.unlockedSubjects || [],
    });
  } catch {
    return NextResponse.json({ data: null }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      uid,
      sessionToken: bodySessionToken,
      bookmarks,
      progress,
      perBookProgress,
      preferences,
    } = body;

    if (!uid) {
      return NextResponse.json(
        { success: false, message: "লগইন প্রয়োজন।" },
        { status: 400 }
      );
    }

    const sessionToken =
      bodySessionToken ||
      req.headers.get("x-session-token") ||
      req.cookies.get("ebook_session_token")?.value ||
      "";

    if (sessionToken) {
      const check = await verifyUserActiveSession(
        String(uid),
        String(sessionToken)
      );
      if (!check.valid && check.sessionInvalidated) {
        return NextResponse.json(
          {
            success: false,
            sessionInvalidated: true,
            message: "আপনার সেশনটি অন্য ডিভাইসে লগইন হওয়ার কারণে বাতিল হয়েছে।",
          },
          { status: 401 }
        );
      }
    }

    const saved = await saveUserReadingData(uid, {
      ...(bookmarks !== undefined ? { bookmarks } : {}),
      ...(progress !== undefined ? { progress } : {}),
      ...(perBookProgress !== undefined ? { perBookProgress } : {}),
      ...(preferences !== undefined ? { preferences } : {}),
    });

    return NextResponse.json({
      success: true,
      data: saved,
      unlockedSubjects: saved.unlockedSubjects || [],
    });
  } catch {
    return NextResponse.json(
      { success: false, message: "ডেটা সেভ করা যায়নি।" },
      { status: 500 }
    );
  }
}
