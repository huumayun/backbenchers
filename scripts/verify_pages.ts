import { getParsedBook } from '../lib/book/server-parser';
import { CHAPTERS } from '../lib/book/chapters';

const b = getParsedBook();
console.log('Total parsed pages:', b.pages.length);

let totalErrors = 0;
for (const ch of CHAPTERS) {
  const chPages = b.pages.filter((p) => p.bookNumber === ch.bookNumber);
  console.log(`\n=== Book ${ch.bookNumber}: ${ch.titleBn} (${chPages.length} pages, expected ${ch.endPage - ch.startPage + 1}) ===`);
  for (const p of chPages) {
    const qMatches = p.html.match(/class="question-item"/g) || [];
    const plainLen = p.plainText.length;
    if (qMatches.length === 0 || plainLen < 30) {
      console.error(`  [EMPTY/ERROR] Page ${p.pageNumber}: questions=${qMatches.length}, plainLen=${plainLen}`);
      totalErrors++;
    } else {
      console.log(`  Page ${p.pageNumber} (${p.sectionLabel}): ${qMatches.length} questions, ${plainLen} chars`);
    }
  }
}

if (totalErrors === 0) {
  console.log('\n>>> SUCCESS! All 177 pages across all 7 books have valid questions and content. Zero empty pages!');
} else {
  console.error(`\n>>> FAILED: Found ${totalErrors} empty/invalid pages.`);
  process.exit(1);
}
