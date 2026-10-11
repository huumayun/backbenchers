import { readFileSync } from "fs";
import { join } from "path";
import { CHAPTERS } from "./chapters";

export interface BookQuestionTocItem {
  id: string;           // e.g. "q-0-1", "q-1-5", "q-2-3"
  qNumber: number;      // 1-based within the section
  sectionIndex: number; // 0 = ক-বিভাগ, 1 = খ-বিভাগ, 2 = গ-বিভাগ
  sectionLabel: string; // "ক-বিভাগ", "খ-বিভাগ", "গ-বিভাগ"
  title: string;        // Clean question text
  pageNumber: number;   // 1-indexed page within this standalone book
}

export interface KaRangeGroup {
  rangeLabel: string;      // e.g. "1-10", "11-20", "21-30"
  rangeLabelBn: string;    // e.g. "১–১০", "১১–২০", "২১–৩০"
  startQ: number;
  endQ: number;
  firstQuestionId: string;
  pageNumber: number;
  endPageNumber: number;
  questions: BookQuestionTocItem[];
}

export interface BookToc {
  chapterIndex: number;
  bookNumber: number;
  kaRanges: KaRangeGroup[];
  kaQuestions: BookQuestionTocItem[];
  khaQuestions: BookQuestionTocItem[];
  gaQuestions: BookQuestionTocItem[];
}

export interface ParsedBookPage {
  pageNumber: number; // 1-indexed within this standalone book (e.g. 1..28)
  chapterIndex: number; // 0..6 (Book 1 to Book 7)
  bookNumber: number;   // 1..7
  chapterTitleBn: string;
  courseCode: string;
  sectionLabel?: string;
  html: string;
  plainText: string;
  isFree: boolean;
}

interface CachedBookData {
  css: string;
  pages: ParsedBookPage[];
  tocs: Record<number, BookToc>;
}

let cachedBook: CachedBookData | null = null;

const BN_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
function toBnNum(n: number): string {
  return String(n)
    .split("")
    .map((ch) => (ch >= "0" && ch <= "9" ? BN_DIGITS[Number(ch)] : ch))
    .join("");
}

function stripTags(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function extractQuestionTitle(blockHtml: string, fallbackQNum: number): string {
  const h3Match = blockHtml.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
  if (h3Match && h3Match[1]) {
    const clean = stripTags(h3Match[1]);
    if (clean) return clean;
  }
  const strongMatch = blockHtml.match(/<strong[^>]*>([\s\S]*?)<\/strong>/i);
  if (strongMatch && strongMatch[1]) {
    const clean = stripTags(strongMatch[1]);
    if (clean) return clean;
  }
  const plain = stripTags(blockHtml);
  return plain.slice(0, 90) || `${toBnNum(fallbackQNum)}। প্রশ্ন`;
}

/**
 * Splits a section's inner HTML into `numPages` chunks along `<div class="question-item">` boundaries.
 * When `firstPageQuestionLimit` is provided (e.g. 10 for ক-বিভাগ), Page 1 strictly contains only the first 10 questions.
 */
function splitSectionIntoPages(
  sectionInnerHtml: string,
  numPages: number,
  firstPageQuestionLimit?: number
): string[] {
  if (numPages <= 1) return [sectionInnerHtml];

  const marker = '<div class="question-item">';
  const indices: number[] = [];
  let pos = 0;
  while ((pos = sectionInnerHtml.indexOf(marker, pos)) !== -1) {
    indices.push(pos);
    pos += marker.length;
  }

  if (indices.length <= 1) {
    return [sectionInnerHtml, ...Array(numPages - 1).fill("")];
  }

  // Strictly put only the first N questions (e.g. 10 questions of ক-বিভাগ) on the first page
  if (
    firstPageQuestionLimit &&
    firstPageQuestionLimit > 0 &&
    indices.length > firstPageQuestionLimit &&
    numPages >= 2
  ) {
    const splitPos = indices[firstPageQuestionLimit];
    const firstPageHtml = sectionInnerHtml.slice(0, splitPos);
    const restSectionHtml = sectionInnerHtml.slice(splitPos);
    const remainingChunks = splitSectionIntoPages(restSectionHtml, numPages - 1);
    return [firstPageHtml, ...remainingChunks];
  }

  const blocks: string[] = [];
  if (indices[0] > 0) {
    blocks.push(sectionInnerHtml.slice(0, indices[0]));
  }
  for (let i = 0; i < indices.length; i++) {
    const start = indices[i];
    const end = i + 1 < indices.length ? indices[i + 1] : sectionInnerHtml.length;
    blocks.push(sectionInnerHtml.slice(start, end));
  }

  const totalLen = blocks.reduce((acc, b) => acc + b.length, 0);
  const targetLenPerPage = totalLen / numPages;

  const pages: string[] = [];
  let currentChunk = "";
  let currentLen = 0;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const remainingBlocks = blocks.length - i;
    const remainingPages = numPages - pages.length;

    currentChunk += block;
    currentLen += block.length;

    if (
      pages.length < numPages - 1 &&
      (currentLen >= targetLenPerPage || remainingBlocks <= remainingPages)
    ) {
      pages.push(currentChunk);
      currentChunk = "";
      currentLen = 0;
    }
  }

  if (currentChunk || pages.length < numPages) {
    pages.push(currentChunk);
  }

  while (pages.length < numPages) {
    pages.push("");
  }

  return pages.slice(0, numPages);
}

export function getParsedBook(): CachedBookData {
  if (cachedBook) return cachedBook;

  const htmlPath = join(process.cwd(), "content", "book.html");
  const fullHtml = readFileSync(htmlPath, "utf-8");

  const cssMatch = fullHtml.match(/<style>([\s\S]*?)<\/style>/i);
  const css = cssMatch ? cssMatch[1] : "";

  const bodyMatch = fullHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const body = bodyMatch ? bodyMatch[1] : fullHtml;

  const pages: ParsedBookPage[] = [];
  const tocs: Record<number, BookToc> = {};
  const backCoverStart = body.indexOf('<div class="back-cover-page">');

  // Parse each of the 7 Subjects into its own standalone Book (pageNumber: 1..endPage)
  for (let sIdx = 0; sIdx < CHAPTERS.length; sIdx++) {
    const ch = CHAPTERS[sIdx];
    const nextCh = CHAPTERS[sIdx + 1];

    const subTag = `<section class="subject-section" id="subject-${ch.courseCode}">`;
    const subStart = body.indexOf(subTag);
    const subEnd = nextCh
      ? body.indexOf(`<section class="subject-section" id="subject-${nextCh.courseCode}">`)
      : backCoverStart !== -1
      ? backCoverStart
      : body.length;

    const subjectHtml = subStart !== -1 ? body.slice(subStart, subEnd) : "";

    const bannerStart = subjectHtml.indexOf('<div class="subject-header-banner">');
    const kaStart = subjectHtml.indexOf(`id="sec-ka-${ch.courseCode}"`);
    const khaStart = subjectHtml.indexOf(`id="sec-kha-${ch.courseCode}"`);
    const gaStart = subjectHtml.indexOf(`id="sec-ga-${ch.courseCode}"`);

    const kaDivStart = kaStart !== -1 ? subjectHtml.lastIndexOf("<div", kaStart) : -1;
    const khaDivStart = khaStart !== -1 ? subjectHtml.lastIndexOf("<div", khaStart) : -1;
    const gaDivStart = gaStart !== -1 ? subjectHtml.lastIndexOf("<div", gaStart) : -1;

    const bannerHtml =
      bannerStart !== -1 && kaDivStart !== -1
        ? subjectHtml.slice(bannerStart, kaDivStart)
        : "";

    const kaHtml =
      kaDivStart !== -1 && khaDivStart !== -1
        ? subjectHtml.slice(kaDivStart, khaDivStart)
        : "";
    const khaHtml =
      khaDivStart !== -1 && gaDivStart !== -1
        ? subjectHtml.slice(khaDivStart, gaDivStart)
        : "";
    const gaHtml =
      gaDivStart !== -1
        ? subjectHtml.slice(gaDivStart).replace(/<\/section>\s*$/i, "")
        : "";

    const secDefs = ch.sections || [];
    const secHtmls = [kaHtml, khaHtml, gaHtml];

    const sectionQuestions: BookQuestionTocItem[][] = [[], [], []];

    for (let secIdx = 0; secIdx < secDefs.length; secIdx++) {
      const secDef = secDefs[secIdx];
      const numSecPages = secDef.endPage - secDef.startPage + 1;
      const rawSecHtml = secHtmls[secIdx] || "";

      const badgeEnd = rawSecHtml.indexOf("</div>");
      const badgeHtml = badgeEnd !== -1 ? rawSecHtml.slice(0, badgeEnd + 6) : "";
      const restHtml = badgeEnd !== -1 ? rawSecHtml.slice(badgeEnd + 6) : rawSecHtml;

      const chunks = splitSectionIntoPages(
        restHtml,
        numSecPages,
        secIdx === 0 ? 10 : undefined
      );
      let qCounter = 0;

      for (let pOffset = 0; pOffset < numSecPages; pOffset++) {
        const localPageNum = secDef.startPage + pOffset; // 1..ch.endPage
        const rawChunk = chunks[pOffset] || "";

        // Tag each <div class="question-item"> with a unique ID and extract TOC item
        const marker = '<div class="question-item">';
        let taggedChunk = "";
        let lastIdx = 0;
        let findPos = 0;

        while ((findPos = rawChunk.indexOf(marker, lastIdx)) !== -1) {
          taggedChunk += rawChunk.slice(lastIdx, findPos);
          qCounter++;
          const qId = `q-${secIdx}-${qCounter}`;

          const nextQPos = rawChunk.indexOf(marker, findPos + marker.length);
          const qBlock =
            nextQPos !== -1
              ? rawChunk.slice(findPos, nextQPos)
              : rawChunk.slice(findPos);

          const qTitle = extractQuestionTitle(qBlock, qCounter);
          sectionQuestions[secIdx].push({
            id: qId,
            qNumber: qCounter,
            sectionIndex: secIdx,
            sectionLabel: secDef.label,
            title: qTitle,
            pageNumber: localPageNum,
          });

          taggedChunk += `<div class="question-item" id="${qId}" data-q-id="${qId}">`;
          lastIdx = findPos + marker.length;
        }
        taggedChunk += rawChunk.slice(lastIdx);

        let pageInner = "";

        if (secIdx === 0 && pOffset === 0) {
          pageInner += bannerHtml;
        }
        if (pOffset === 0) {
          pageInner += badgeHtml;
        } else {
          pageInner += `<div class="running-header">বই ${ch.bookNumber}: ${ch.titleBn} • ${secDef.label} (পৃষ্ঠা ${localPageNum})</div>`;
        }
        pageInner += `<div class="section-content">${taggedChunk}</div>`;

        pages.push({
          pageNumber: localPageNum,
          chapterIndex: ch.index,
          bookNumber: ch.bookNumber,
          chapterTitleBn: ch.titleBn,
          courseCode: ch.courseCode,
          sectionLabel: secDef.label,
          html: pageInner,
          plainText: stripTags(pageInner),
          isFree: localPageNum <= ch.freePagesUpTo,
        });
      }
    }

    // Group ক-বিভাগ questions into ranges of 10: 1-10, 11-20, 21-30, etc.
    const kaQs = sectionQuestions[0] || [];
    const kaRanges: KaRangeGroup[] = [];
    for (let i = 0; i < kaQs.length; i += 10) {
      const slice = kaQs.slice(i, i + 10);
      if (slice.length === 0) continue;
      const startQ = slice[0].qNumber;
      const endQ = slice[slice.length - 1].qNumber;
      kaRanges.push({
        rangeLabel: `${startQ}-${endQ}`,
        rangeLabelBn: `${toBnNum(startQ)}–${toBnNum(endQ)}`,
        startQ,
        endQ,
        firstQuestionId: slice[0].id,
        pageNumber: slice[0].pageNumber,
        endPageNumber: slice[slice.length - 1].pageNumber,
        questions: slice,
      });
    }

    tocs[ch.index] = {
      chapterIndex: ch.index,
      bookNumber: ch.bookNumber,
      kaRanges,
      kaQuestions: kaQs,
      khaQuestions: sectionQuestions[1] || [],
      gaQuestions: sectionQuestions[2] || [],
    };
  }

  cachedBook = { css, pages, tocs };
  return cachedBook;
}

export function searchBookPages(query: string, hasAccess: boolean) {
  const { pages } = getParsedBook();
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const results: {
    pageNumber: number;
    chapterIndex: number;
    bookNumber: number;
    chapterTitleBn: string;
    sectionLabel?: string;
    snippet: string;
    isLocked: boolean;
  }[] = [];

  for (const p of pages) {
    const idx = p.plainText.toLowerCase().indexOf(q);
    if (idx !== -1) {
      const isLocked = !p.isFree && !hasAccess;
      const start = Math.max(0, idx - 45);
      const end = Math.min(p.plainText.length, idx + q.length + 75);
      const snippet = isLocked
        ? "🔒 এই বইটি আনলক কোড দিয়ে খুলে সম্পূর্ণ উত্তর দেখুন..."
        : (start > 0 ? "..." : "") +
          p.plainText.slice(start, end) +
          (end < p.plainText.length ? "..." : "");

      results.push({
        pageNumber: p.pageNumber,
        chapterIndex: p.chapterIndex,
        bookNumber: p.bookNumber,
        chapterTitleBn: p.chapterTitleBn,
        sectionLabel: p.sectionLabel,
        snippet,
        isLocked,
      });
      if (results.length >= 30) break;
    }
  }

  return results;
}
