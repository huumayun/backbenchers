import { getParsedBook } from "../lib/book/server-parser";
import fs from "fs";
import path from "path";

const book = getParsedBook();
const jsonStr = JSON.stringify(book);

const targets = [
  path.join(process.cwd(), "public", "book-bundle.json"),
  path.join(process.cwd(), "out", "book-bundle.json"),
  path.join(process.cwd(), "android", "app", "src", "main", "assets", "public", "book-bundle.json"),
];

for (const target of targets) {
  const dir = path.dirname(target);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(target, jsonStr, "utf-8");
  console.log(`Wrote bundle to ${target} (${(jsonStr.length / 1024).toFixed(1)} KB, ${book.pages.length} pages)`);
}
