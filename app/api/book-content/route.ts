import { NextRequest, NextResponse } from "next/server";
import { getParsedBook, searchBookPages, BookToc } from "@/lib/book/server-parser";
import { verifyUserActiveSession } from "@/lib/server/store";
import { CHAPTERS } from "@/lib/book/chapters";

async function getRequestAccessInfo(req: NextRequest): Promise<{
  sessionInvalidated: boolean;
  unlockedSubjects: string[];
}> {
  const uid =
    req.headers.get("x-user-uid") ||
    req.cookies.get("ebook_uid")?.value ||
    req.nextUrl.searchParams.get("uid") ||
    null;
  const sessionToken =
    req.headers.get("x-session-token") ||
    req.cookies.get("ebook_session_token")?.value ||
    req.nextUrl.searchParams.get("sessionToken") ||
    null;

  if (!uid || !sessionToken) {
    return { sessionInvalidated: false, unlockedSubjects: [] };
  }

  const check = await verifyUserActiveSession(uid, sessionToken);
  if (!check.valid) {
    return {
      sessionInvalidated: Boolean(check.sessionInvalidated),
      unlockedSubjects: [],
    };
  }

  return {
    sessionInvalidated: false,
    unlockedSubjects: check.unlockedSubjects,
  };
}

function filterTocForAccess(
  rawToc: BookToc,
  isSubjectUnlocked: boolean,
  freePageNumbers: Set<number>
) {
  if (isSubjectUnlocked) {
    return {
      ...rawToc,
      isTocLocked: false,
      lockedKaCount: 0,
      lockedKhaCount: 0,
      lockedGaCount: 0,
      totalLockedQuestions: 0,
    };
  }

  // Strictly expose ONLY the first 10 questions of ক-বিভাগ on free preview
  const visibleKa = rawToc.kaQuestions
    .filter((q) => freePageNumbers.has(q.pageNumber) && q.qNumber <= 10)
    .slice(0, 10);
  const visibleKha: typeof rawToc.khaQuestions = [];
  const visibleGa: typeof rawToc.gaQuestions = [];

  const visibleKaRanges = rawToc.kaRanges
    .slice(0, 1)
    .map((grp) => {
      const allowedQs = grp.questions.filter(
        (q) => freePageNumbers.has(q.pageNumber) && q.qNumber <= 10
      );
      if (allowedQs.length === 0) return null;
      const firstQ = allowedQs[0];
      const lastQ = allowedQs[allowedQs.length - 1];
      return {
        ...grp,
        endQ: lastQ.qNumber,
        firstQuestionId: firstQ.id,
        pageNumber: firstQ.pageNumber,
        endPageNumber: lastQ.pageNumber,
        questions: allowedQs,
      };
    })
    .filter((g): g is NonNullable<typeof g> => g !== null);

  const lockedKaCount = Math.max(0, rawToc.kaQuestions.length - visibleKa.length);
  const lockedKhaCount = rawToc.khaQuestions.length;
  const lockedGaCount = rawToc.gaQuestions.length;

  return {
    chapterIndex: rawToc.chapterIndex,
    bookNumber: rawToc.bookNumber,
    kaRanges: visibleKaRanges,
    kaQuestions: visibleKa,
    khaQuestions: visibleKha,
    gaQuestions: visibleGa,
    isTocLocked: true,
    lockedKaCount,
    lockedKhaCount,
    lockedGaCount,
    totalLockedQuestions: lockedKaCount + lockedKhaCount + lockedGaCount,
  };
}

export async function GET(req: NextRequest) {
  try {
    const mode = req.nextUrl.searchParams.get("mode") || "chapter";
    const search = req.nextUrl.searchParams.get("search");
    const { sessionInvalidated, unlockedSubjects } =
      await getRequestAccessInfo(req);

    const { css, pages, tocs } = getParsedBook();

    // 1. Search mode across all 7 books (only returns results from free pages or unlocked subjects)
    if (search !== null) {
      const rawResults = searchBookPages(search, true);
      const filteredResults = rawResults
        .filter((r) => {
          const ch = CHAPTERS[r.chapterIndex];
          const canReadPage =
            r.pageNumber <= (ch?.freePagesUpTo || 2) ||
            Boolean(ch && unlockedSubjects.includes(ch.id));
          return canReadPage;
        })
        .map((r) => ({
          ...r,
          isLocked: false,
        }));

      return NextResponse.json({
        results: filteredResults,
        unlockedSubjects,
        sessionInvalidated,
      });
    }

    // Clamp book index (0..6 for the 7 standalone books)
    const rawCh = parseInt(req.nextUrl.searchParams.get("chapter") || "0", 10);
    const chapterIndex =
      !isNaN(rawCh) && rawCh >= 0 && rawCh < CHAPTERS.length ? rawCh : 0;
    const bookMeta = CHAPTERS[chapterIndex] || CHAPTERS[0];
    const isSubjectUnlocked = unlockedSubjects.includes(bookMeta.id);

    const bookPages = pages.filter((p) => p.chapterIndex === chapterIndex);
    const freePageNumbers = new Set(
      bookPages.filter((p) => p.isFree).map((p) => p.pageNumber)
    );

    const rawBookToc: BookToc = tocs[chapterIndex] || {
      chapterIndex,
      bookNumber: bookMeta.bookNumber,
      kaRanges: [],
      kaQuestions: [],
      khaQuestions: [],
      gaQuestions: [],
    };

    // Only expose free-page questions in TOC when the subject is locked!
    const bookToc = filterTocForAccess(
      rawBookToc,
      isSubjectUnlocked,
      freePageNumbers
    );

    // 2. Flipbook mode for the selected standalone book (?mode=flipbook&chapter=0..6)
    if (mode === "flipbook") {
      const flipPages = bookPages.map((p) => {
        const isAllowed = p.isFree || isSubjectUnlocked;
        return {
          pageNumber: p.pageNumber,
          chapterIndex: p.chapterIndex,
          bookNumber: p.bookNumber,
          chapterTitleBn: p.chapterTitleBn,
          courseCode: p.courseCode,
          sectionLabel: p.sectionLabel,
          isFree: p.isFree,
          isLocked: !isAllowed,
          html: isAllowed ? p.html : "",
        };
      });

      return NextResponse.json({
        css,
        book: bookMeta,
        toc: bookToc,
        totalPages: flipPages.length,
        freePagesLimit: bookMeta.freePagesUpTo,
        hasAccess: isSubjectUnlocked,
        isSubjectUnlocked,
        unlockedSubjects,
        sessionInvalidated,
        pages: flipPages,
      });
    }

    // 3. Standard Reader mode for the selected standalone book (?mode=chapter&chapter=0..6)
    const allowedPages = bookPages.filter((p) => p.isFree || isSubjectUnlocked);
    const lockedPagesCount = bookPages.length - allowedPages.length;

    return NextResponse.json({
      css,
      chapter: bookMeta,
      toc: bookToc,
      hasAccess: isSubjectUnlocked,
      isSubjectUnlocked,
      unlockedSubjects,
      sessionInvalidated,
      freePagesLimit: bookMeta.freePagesUpTo,
      totalChapterPages: bookPages.length,
      unlockedChapterPages: allowedPages.length,
      lockedPagesCount,
      pages: bookPages.map((p) => {
        const isAllowed = p.isFree || isSubjectUnlocked;
        return {
          pageNumber: p.pageNumber,
          sectionLabel: p.sectionLabel,
          isFree: p.isFree,
          isLocked: !isAllowed,
          html: isAllowed ? p.html : "",
        };
      }),
    });
  } catch (error) {
    console.error("Book content API error:", error);
    return NextResponse.json(
      { error: "বইয়ের কনটেন্ট লোড করতে সমস্যা হয়েছে।" },
      { status: 500 }
    );
  }
}
