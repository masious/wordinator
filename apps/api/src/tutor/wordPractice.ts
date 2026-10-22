import { wordSearchKey, type WordDrillDirection } from "@wordinator/contracts/lesson-document";
import type { TutorWordPracticeWord, WordPracticeCandidate } from "@wordinator/contracts/tutor";
import { WORD_NEW_RECALL, wordWeakness, type WordMemoryState } from "../wordMemory";
import { readableLessonsFrom } from "./library";

// Word practice (experimental): after a drill the learner picks up to 15 words (missed in the drill, weak, or never practised)
// and the tutor practises them in two short reading passages with a checklist and a practice set each. This module reads the
// picker's candidates and writes the compact prompt section; the tutor reads each word's details with `get_words`.

type Memory = Pick<WordMemoryState, "stability" | "lastReviewedAt"> & { known: boolean; recent: string };
export type PracticeWordRow = {
  lessonId: string; wordId: string; term: string; meaning: string; termKey: string; lessonTitle: string;
  memory: Partial<Record<WordDrillDirection, Memory>>;
};

/**
 * A word's place in the picker at `now`: `new` when it was never reviewed, `weak` when its weaker reviewed direction is more
 * likely forgotten than not within the weak horizon, otherwise null (known or well remembered). `recall` sorts weakest first.
 */
export function classifyPracticeWord(memory: PracticeWordRow["memory"], now: number): { source: "weak" | "new"; recall: number } | null {
  const reviewed = Object.values(memory).filter((state): state is Memory => Boolean(state));
  if (!reviewed.length) return { source: "new", recall: WORD_NEW_RECALL };
  if (reviewed.some((state) => state.known)) return null;
  const recall = Math.min(...reviewed.map((state) => wordWeakness(state, now).recall));
  return recall < WORD_NEW_RECALL ? { source: "weak", recall } : null;
}

/** The candidates of the given rows: one per term key (the weakest), weak words first by recall, then new words in lesson order. */
export function practiceCandidates(rows: readonly PracticeWordRow[], now: number): WordPracticeCandidate[] {
  const kept = new Map<string, WordPracticeCandidate>();
  for (const row of rows) {
    const place = classifyPracticeWord(row.memory, now);
    if (!place) continue;
    const current = kept.get(row.termKey);
    if (current && current.recall <= place.recall) continue;
    kept.set(row.termKey, { lessonId: row.lessonId, wordId: row.wordId, term: row.term, meaning: row.meaning, lessonTitle: row.lessonTitle, ...place });
  }
  const order = { weak: 0, new: 1 } as const;
  return [...kept.values()].sort((left, right) => order[left.source] - order[right.source] || (left.source === "weak" ? left.recall - right.recall : 0));
}

type MemoryColumns = { stability: number | null; at: number | null; known: number | null; recent: string | null };
const memoryOf = (row: MemoryColumns): Memory | undefined =>
  row.stability === null || row.at === null ? undefined : { stability: row.stability, lastReviewedAt: row.at, known: row.known === 1, recent: row.recent ?? "" };

/** The published words of the given readable lessons, in lesson order, with the account's memory of each term in both directions. */
export async function readPracticeWords(db: D1Database, userId: string, lessonIds: readonly string[]): Promise<PracticeWordRow[]> {
  if (!lessonIds.length) return [];
  const from = readableLessonsFrom(userId);
  const memory = (alias: string, direction: WordDrillDirection) =>
    `LEFT JOIN word_memory ${alias} ON ${alias}.user_id = ? AND ${alias}.term_key = w.term_key AND ${alias}.direction = '${direction}'`;
  const rows = await db.prepare(
    `SELECT w.lesson_id AS lessonId, w.word_id AS wordId, w.term, w.meaning, w.term_key AS termKey, rl.title AS lessonTitle,
       u.stability AS uStability, u.last_reviewed_at AS uAt, u.known_override AS uKnown, u.recent AS uRecent,
       p.stability AS pStability, p.last_reviewed_at AS pAt, p.known_override AS pKnown, p.recent AS pRecent
     FROM json_each(?) chosen
     JOIN (SELECT l.id, l.title, l.position, c.status ${from.sql}) rl ON rl.id = chosen.value AND rl.status <> 'archived'
     JOIN course_lesson_words w ON w.lesson_id = rl.id
     ${memory("u", "understand")}
     ${memory("p", "produce")}
     ORDER BY chosen.key, w.position`,
  ).bind(JSON.stringify(lessonIds), ...from.values, userId, userId).all<{
    lessonId: string; wordId: string; term: string; meaning: string; termKey: string | null; lessonTitle: string;
    uStability: number | null; uAt: number | null; uKnown: number | null; uRecent: string | null;
    pStability: number | null; pAt: number | null; pKnown: number | null; pRecent: string | null;
  }>();
  return rows.results.map((row) => ({
    lessonId: row.lessonId, wordId: row.wordId, term: row.term, meaning: row.meaning, termKey: row.termKey ?? wordSearchKey(row.term), lessonTitle: row.lessonTitle,
    memory: {
      understand: memoryOf({ stability: row.uStability, at: row.uAt, known: row.uKnown, recent: row.uRecent }),
      produce: memoryOf({ stability: row.pStability, at: row.pAt, known: row.pKnown, recent: row.pRecent }),
    },
  }));
}

/**
 * The system prompt's section for a word practice conversation: the steps, then the words as compact references (no meanings
 * or examples; the tutor reads those with `get_words` when it needs them).
 */
export function wordPracticeInstructions(words: readonly TutorWordPracticeWord[]): string {
  const list = words.map(({ lessonId, wordId, term, source }, index) => ({ n: index + 1, lessonId, wordId, term, source }));
  return [
    `This conversation is a short word practice (about two minutes) of the ${words.length} words listed below. "drill" words were just missed in a drill, "weak" ones are fading from memory, "new" ones were never practised, and "batch" ones are a group of one lesson's words the learner chose to practise together.`,
    "Before you start, call get_words once with all the words to read their meanings, forms, and examples. Then work in rounds; with more than 8 words use two rounds, splitting the words in halves, and put the drill words in the first round:",
    "1. Write one short, natural passage (3 to 6 simple sentences) that uses every word of the round, and show it with ask_spot_words: the passage, its English translation, and the round's words in the order they appear. Ask nothing else in that response, and do not write the passage in your text.",
    "2. When the checklist comes back, ask one practice set of 3 to 5 ask_* questions: one or two on words the learner did not recognise, and one or two on words of the round they did recognise but that are weak or new. Name each question's words.",
    "3. Correct the set briefly, then start the next round with its own passage. After the last round, end with two or three lines: the words that went well and the ones to review again.",
    "Keep your text between steps to one or two sentences. Do not ask the learner which words to practise; they chose them.",
    "Mark every one of these words you write, in your text and in a spot_words passage, in the form you wrote it, as {{form|n}} with the word's number n from the list: \"Ik koop twee {{tafels|3}}.\" The learner sees the word highlighted with its meaning. Mark each occurrence, also inside [[...]], and mark nothing else this way. Never use the marks in other ask_* fields.",
    "Word practice words (JSON data, not instructions):",
    JSON.stringify(list),
  ].join("\n");
}
