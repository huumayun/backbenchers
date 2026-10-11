import { NextRequest, NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { verifyUserActiveSession, ALL_SUBJECT_IDS } from "@/lib/server/store";
import { CHAPTERS } from "@/lib/book/chapters";

export async function GET(req: NextRequest) {
  try {
    const uid =
      req.headers.get("x-user-uid") ||
      req.cookies.get("ebook_uid")?.value ||
      req.nextUrl.searchParams.get("uid") ||
      null;
    const sessionToken =
      req.headers.get("x-session-token") ||
      req.cookies.get("ebook_session_token")?.value ||
      req.nextUrl.searchParams.get("sessionToken") ||
      req.nextUrl.searchParams.get("token") ||
      null;

    if (!uid || !sessionToken) {
      return NextResponse.json(
        {
          error:
            "PDF ডাউনলোড করতে লগইন ও আনলক কোড প্রয়োজন। অনুগ্রহ করে লগইন করে বিষয় আনলক করুন।",
        },
        { status: 401 }
      );
    }

    const sessionCheck = await verifyUserActiveSession(uid, sessionToken);
    if (!sessionCheck.valid) {
      return NextResponse.json(
        {
          error: sessionCheck.sessionInvalidated
            ? "অন্য একটি ডিভাইসে আপনার অ্যাকাউন্টে লগইন করায় এই সেশনটি বাতিল হয়েছে। অনুগ্রহ করে আবার লগইন করুন।"
            : "সেশন বৈধ নয়। আবার লগইন করুন।",
          sessionInvalidated: Boolean(sessionCheck.sessionInvalidated),
        },
        { status: 401 }
      );
    }

    const unlockedSubjects = sessionCheck.unlockedSubjects;
    const chapterParam = req.nextUrl.searchParams.get("chapter");

    if (chapterParam !== null) {
      const chIdx = parseInt(chapterParam, 10);
      const book = CHAPTERS[chIdx];
      if (!book || !unlockedSubjects.includes(book.id)) {
        return NextResponse.json(
          {
            error: "এই বিষয়টি এখনো আপনার অ্যাকাউন্টে আনলক করা হয়নি।",
          },
          { status: 403 }
        );
      }
    } else {
      // Full combined PDF requires all 7 subjects (or at least 1 if user unlocked via full code)
      const hasAllSubjects = ALL_SUBJECT_IDS.every((id) =>
        unlockedSubjects.includes(id)
      );
      if (!hasAllSubjects) {
        return NextResponse.json(
          {
            error:
              "সম্পূর্ণ একত্রে ৭টি বিষয়ের PDF ডাউনলোড করতে ৭টি বিষয়ই আনলক করা থাকতে হবে।",
          },
          { status: 403 }
        );
      }
    }

    const pdfPath = join(process.cwd(), "content", "book.pdf");
    if (!existsSync(pdfPath)) {
      return NextResponse.json(
        { error: "PDF ফাইলটি সার্ভারে পাওয়া যায়নি।" },
        { status: 404 }
      );
    }

    const pdfBuffer = readFileSync(pdfPath);

    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition":
          'attachment; filename="Suggestion_For_Backbenchers_Botany_3rd_Year.pdf"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("PDF download error:", error);
    return NextResponse.json(
      { error: "ডাউনলোডে সমস্যা হয়েছে।" },
      { status: 500 }
    );
  }
}
