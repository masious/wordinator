import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { lessonDocumentSchema, readVocabularyBlock, walkLessonBlocks, type LessonDocument } from "../../../packages/contracts/src/lessonDocument";
import { authoredWordMarksSchema, resolveWordMarks, wordMarkKey, wordMarkTexts, wordMarkTokens } from "../../../packages/contracts/src/wordMarks";
import { authoredDocument } from "./normalize";

// Word marks pipeline (docs/courses.md#word-marks; instructions for annotators in WORD_MARKS.md).
//   dump  <lesson.json>       the annotator's input: the new words and every markable text with numbered tokens and their formatting
//   check <lesson.json ...>   resolves word-marks/<slug>.json against the lesson, prints problems, words never marked, and unmarked
//                             exact uses of a term or form to review; exits 1 on problems
const marksDir = join(dirname(new URL(import.meta.url).pathname), "..", "word-marks");
export const marksPath = (lessonFile: string) => join(marksDir, basename(lessonFile));

type Raw = { title: string; blocks: Array<{ id?: string; children?: unknown[] }> };
function load(file: string): LessonDocument {
  const raw = JSON.parse(readFileSync(file, "utf8")) as Raw;
  const missing = (blocks: Raw["blocks"]): boolean => blocks.some((block) => !block.id || missing((block.children ?? []) as Raw["blocks"]));
  if (missing(raw.blocks)) throw new Error(`${file}: blocks without IDs; run lesson.ts check first`);
  return lessonDocumentSchema.parse(authoredDocument(structuredClone(raw.blocks)));
}

const words = (document: LessonDocument) => [...walkLessonBlocks(document.blocks)]
  .flatMap(({ block }) => block.type === "vocabulary" ? readVocabularyBlock(block).words : []);

const fold = (value: string) => value.normalize("NFKD").replace(/\p{M}/gu, "").replace(/’/g, "'").toLowerCase();

function dump(file: string) {
  const document = load(file);
  const out = [`# ${basename(file, ".json")}`, "", "## New words (id | term | forms | meaning)"];
  for (const word of words(document)) out.push(`${word.id} | ${word.term} | ${word.forms ?? ""} | ${word.meaning}`);
  const types = new Map([...walkLessonBlocks(document.blocks)].map(({ block }) => [block.id, block.type + ("variant" in block.props ? `/${String(block.props.variant)}` : "")]));
  out.push("", "## Texts", "Each token is followed by ⟨index⟩, with its formatting when it has any: b bold, i italic, a colour name, bg:<colour> background.");
  for (const entry of wordMarkTexts(document)) {
    // The formatting of each character of inline content.
    const styles: string[] = [];
    for (const item of entry.content ?? []) for (const piece of item.type === "text" ? [item] : item.content) {
      const s = piece.styles as Record<string, unknown>;
      const tags = [s.bold && "b", s.italic && "i", typeof s.textColor === "string" && s.textColor !== "default" && s.textColor,
        typeof s.backgroundColor === "string" && s.backgroundColor !== "default" && `bg:${s.backgroundColor}`].filter(Boolean).join(" ");
      for (let index = 0; index < piece.text.length; index += 1) styles.push(tags);
    }
    let line = ""; let at = 0;
    for (const token of wordMarkTokens(entry.text)) {
      const tags = styles[token.start];
      line += entry.text.slice(at, token.end) + `⟨${token.index}${tags ? ` ${tags}` : ""}⟩`;
      at = token.end;
    }
    out.push("", `### ${entry.blockId} ${entry.field} (${types.get(entry.blockId)})`, line + entry.text.slice(at));
  }
  console.log(out.join("\n"));
}

function check(file: string): boolean {
  const document = load(file);
  const path = marksPath(file);
  if (!existsSync(path)) { console.log(`${basename(file)}: no marks file`); return false; }
  const authored = authoredWordMarksSchema.parse(JSON.parse(readFileSync(path, "utf8"))).marks;
  const { marks, problems } = resolveWordMarks(document, authored);
  const lessonWords = words(document);
  const used = new Set(marks.fields.flatMap((field) => field.marks.map((mark) => mark.wordId)));
  // Exact single-token uses of a term or form that no mark covers: likely misses, or English homographs to leave unmarked.
  const covered = new Map(marks.fields.map((field) => [wordMarkKey(field.blockId, field.field), field.marks.flatMap((mark) => mark.parts)]));
  const keys = new Map<string, string>();
  for (const word of lessonWords) for (const source of [word.term, ...(word.forms ?? "").split(/[·/,;]/)]) {
    const tokens = wordMarkTokens(source.replace(/\([^)]*\)/g, " ")).map((token) => fold(token.text)).filter((token) => !["de", "het", "een"].includes(token));
    if (tokens.length === 1 && tokens[0]!.length > 1) keys.set(tokens[0]!, word.term);
  }
  const review: string[] = [];
  for (const entry of wordMarkTexts(document)) {
    const parts = covered.get(wordMarkKey(entry.blockId, entry.field)) ?? [];
    for (const token of wordMarkTokens(entry.text)) {
      const term = keys.get(fold(token.text));
      if (term && !parts.some(([start, end]) => token.start >= start && token.end <= end)) review.push(`  ${entry.blockId} ${entry.field} ⟨${token.index}⟩ "${token.text}" (${term})`);
    }
  }
  const unused = lessonWords.filter((word) => !used.has(word.id)).map((word) => word.term);
  const count = marks.fields.reduce((sum, field) => sum + field.marks.length, 0);
  console.log(`${basename(file)}: ${count} marks, ${used.size}/${lessonWords.length} words used${problems.length ? `, ${problems.length} PROBLEMS` : ""}`);
  for (const problem of problems) console.log(`  PROBLEM ${problem}`);
  if (unused.length) console.log(`  never marked: ${unused.join(" · ")}`);
  if (review.length) console.log(`  unmarked exact uses (${review.length}):\n${review.join("\n")}`);
  return !problems.length;
}

const [command, ...files] = process.argv.slice(2);
if (command === "dump") files.forEach(dump);
else if (command === "check") {
  mkdirSync(marksDir, { recursive: true });
  const ok = files.map(check).every(Boolean);
  process.exit(ok ? 0 : 1);
} else {
  console.error("usage: word-marks.ts dump|check <lesson.json ...>");
  process.exit(2);
}
