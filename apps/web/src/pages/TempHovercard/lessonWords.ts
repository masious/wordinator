import { inlineText, readDialogueTurns, readVocabularyBlock, walkLessonBlocks, type LessonBlock, type LessonDocument, type VocabularyWord } from "@wordinator/contracts/lesson-document";
import { findWords, type MatchLanguage, type WordSpan } from "./wordMatch";

// Prototype: where each new word of a lesson is marked in its text. A New words block's words belong to the block before it, and
// words with nothing before them in their section (none, or a heading) to the block after, as on the lesson page
// (docs/courses.md#lesson-pages). A word is marked in that block, or else in the nearest block before it in the same section (a
// country list, whose words sit in separate list items, or a paragraph that introduces the word), wherever it occurs there.
// Words found nowhere stay listed under their block.
export type LessonMarks = {
  // The spans of each marked block, one list per text (a dialogue has one per turn).
  spans: Map<string, WordSpan[][]>;
  // The words a block introduces but whose text does not show them.
  missing: Map<string, VocabularyWord[]>;
  words: Map<string, VocabularyWord>;
};

// The texts of a block that words are looked for in: its inline text, an example's sentence, or each dialogue turn.
export function blockTexts(block: LessonBlock): string[] {
  if (block.type === "dialogue") return readDialogueTurns(block).map((turn) => turn.text);
  return "content" in block && Array.isArray(block.content) ? [inlineText(block.content)] : [];
}

export function markLesson(document: LessonDocument, language: MatchLanguage): LessonMarks {
  const blocks = [...walkLessonBlocks(document.blocks)].map(({ block }) => block);
  const marks: LessonMarks = { spans: new Map(), missing: new Map(), words: new Map() };
  const add = (block: LessonBlock, spans: WordSpan[][]) => {
    const current = marks.spans.get(block.id) ?? blockTexts(block).map(() => []);
    marks.spans.set(block.id, current.map((list, index) => [...list, ...(spans[index] ?? [])].sort((a, b) => a.start - b.start)));
  };
  blocks.forEach((block, index) => {
    if (block.type !== "vocabulary") return;
    const words = readVocabularyBlock(block).words;
    for (const word of words) marks.words.set(word.id, word);
    const earlier = blocks.slice(0, index).reverse();
    const sectionStart = earlier.findIndex((other) => other.type === "heading");
    const section = (sectionStart < 0 ? earlier : earlier.slice(0, sectionStart)).filter((other) => other.type !== "vocabulary");
    const later = blocks.slice(index + 1);
    const sectionEnd = later.findIndex((other) => other.type === "heading");
    const after = (sectionEnd < 0 ? later : later.slice(0, sectionEnd)).filter((other) => other.type !== "vocabulary");
    const owner = section[0] ?? after[0];
    if (!owner) return;
    let left = [...words];
    for (const candidate of new Set([owner, ...section, ...after])) {
      if (!left.length) break;
      // Words already marked in a block are not marked there again by a later New words block.
      const taken = new Set((marks.spans.get(candidate.id) ?? []).flat().map((span) => span.wordId));
      const spans = blockTexts(candidate).map((text) => findWords(text, left, language)
        .filter((span) => !taken.has(span.wordId)));
      const found = new Set(spans.flat().map((span) => span.wordId));
      if (!found.size) continue;
      // Overlapping spans from two New words blocks keep the earlier block's.
      add(candidate, spans.map((list, text) => list.filter((span) => !(marks.spans.get(candidate.id)?.[text] ?? [])
        .some((other) => span.start < other.end && other.start < span.end))));
      left = left.filter((word) => !found.has(word.id));
    }
    if (left.length) marks.missing.set(owner.id, [...(marks.missing.get(owner.id) ?? []), ...left]);
  });
  return marks;
}
