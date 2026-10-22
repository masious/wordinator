import { wordDrillDirectionSchema, wordDrillResultSchema } from "@wordinator/contracts/lesson-document";
import {
  TUTOR_TITLE_MAX, TUTOR_WORD_PRACTICE_MAX, componentHints, parseWordMarks, tutorWordRefSchema, componentWords, saveAiPracticeArgsSchema, defaultAiPracticeFocus, stripTargetMarks, TUTOR_COMPONENT_KINDS, TUTOR_HINT_KINDS, TUTOR_NOTES_MAX, tutorComponentPayloadSchemas, tutorComponentView,
  type QuickReviewCardView, type SpotWordView, type TutorComponent, type TutorWordMark, type TutorComponentKind, type TutorComponentView, type TutorConfirmationAction,
  type TutorConfirmationSummary, type TutorStoredPart, type TutorToolDetail,
} from "@wordinator/contracts/tutor";
import { z } from "zod";
import type { AiToolDefinition } from "../ai";
import { recordWordReviews } from "../learningData";
import { completeLesson, LESSON_TERMS, readLessonProgress, resetLesson } from "../learning/progress";
import { listAiPractices, saveAiPractice } from "./aiPractices";
import { recentLessons, recentMistakes, recentWords, searchWords, weakestWords } from "./learner";
import { lessonForModel, nextLesson, readableCourse, readableCourses, readableLesson, hintViews, readableLessonList, readableWords, wordKey, type ReadableLesson } from "./library";
import { writeTutorNotes } from "./profile";
import { conversationWordPractice, parseParts, readConversation, setConversationTitle } from "./store";

// The tutor's tools (docs/ai-tutor.md#tools). Every tool runs as the signed-in account: the context carries its user ID and no
// tool accepts one. Lessons, courses, and words are resolved under the account's read rules (published lessons of visible
// courses in its library); anything else is reported as not found. Results reach the model as JSON data in a tool message.
// Interactive tools return a component and confirmed writes a confirmation card; the loop then stops and waits for the learner.

export type ToolContext = { db: D1Database; userId: string; conversationId: string; now: () => number; random: () => number };

export type ToolOutcome =
  // `issues` names what did not validate (paths and messages, never values), for the failure log only.
  | { kind: "result"; ok: boolean; error: string | null; detail: TutorToolDetail; data: unknown; issues?: string }
  | { kind: "component"; component: TutorComponent; view: TutorComponentView }
  | { kind: "confirmation"; summary: TutorConfirmationSummary; arguments: Record<string, unknown> };

const ok = (detail: TutorToolDetail, data: unknown): ToolOutcome => ({ kind: "result", ok: true, error: null, detail, data });
const failed = (error: string, message: string, detail: TutorToolDetail = {}): ToolOutcome => ({ kind: "result", ok: false, error, detail, data: { error, message } });
const NOT_FOUND_HELP = {
  lesson: "Never build or guess a lessonId: find it with list_lessons (by course or title) and use its lessonId exactly.",
  course: "Use a courseId from list_lessons or get_course_progress exactly.",
  word: "Use word IDs from get_lesson or the word tools exactly.",
} as const;
const notFound = (what: "lesson" | "course" | "word") =>
  failed(`${what.toUpperCase()}_NOT_FOUND`, `This ${what} is not available. ${NOT_FOUND_HELP[what]}`);

const limitArg = z.number().int().min(1).max(20).optional();
const lessonIdArg = z.object({ lessonId: z.uuid() });
const READ_TOOLS = {
  search_words: { description: "Searches the new words of the lessons the learner can read by term, meaning, or form.", schema: z.object({ query: z.string().trim().min(1).max(100) }) },
  get_weak_words: { description: "The learner's weakest remembered words, weakest first, with their last results.", schema: z.object({ limit: limitArg }) },
  get_recent_words: { description: "The words the learner reviewed most recently, with the latest result.", schema: z.object({ limit: limitArg }) },
  get_course_progress: {
    description: "Without courseId: the courses the learner can read with lessons completed. With courseId: each published lesson's state (not started, in progress, missed, completed), storyline share, practices done, and words reviewed.",
    schema: z.object({ courseId: z.uuid().optional() }),
  },
  list_lessons: {
    description: "Lists the published lessons the learner can read, in course order: each lesson's lessonId, number in its course, title, state, and course. Filter by courseId, or by a query matched against lesson and course titles. Use it to find a lesson the learner names by title, number, or course.",
    schema: z.object({ courseId: z.uuid().optional(), query: z.string().trim().min(1).max(100).optional() }),
  },
  get_lesson: {
    description: "Reads one published lesson by its lessonId (from list_lessons, get_course_progress, or the snapshot): blocks with IDs, new words with IDs, examples, dialogues, and practices. lessonId \"next\" reads the lesson the learner should study next; call it once per turn.",
    schema: z.object({ lessonId: z.union([z.uuid(), z.literal("next")]) }),
  },
  get_words: {
    description: "Reads lesson words by their references (lessonId and wordId, as the snapshot, a word practice list, or another tool gives them): each word's term, meaning, forms, example, and lesson. Ask for all the words you need in one call.",
    schema: z.object({ words: z.array(tutorWordRefSchema).min(1).max(TUTOR_WORD_PRACTICE_MAX) }),
  },
  get_recent_mistakes: { description: "The learner's most recent practice answers that did not match.", schema: z.object({ limit: limitArg }) },
  list_ai_practices: { description: "The AI practices saved for a lesson.", schema: lessonIdArg },
} as const;

const COMPONENT_DESCRIPTIONS: Record<TutorComponentKind, string> = {
  fill_in: "Asks the learner to fill the … blanks of a target-language sentence (one answer per blank).",
  translate: "Asks the learner to translate a sentence into the target language; give a natural reference translation.",
  word_order: "Asks the learner to put target-language chunks in order; give the chunks in the correct order (they are shuffled).",
  article: "Asks the learner to pick the article of one or more nouns (Dutch de/het, German der/die/das).",
  choice: "Asks a multiple-choice question with 3 or 4 options; correct is the index of the right option.",
  quick_review: "Shows drill cards for lesson words (IDs from get_lesson or word tools); the learner grades themselves.",
  say_it: "Asks the learner to say a target-language sentence aloud; it is scored by pronunciation assessment.",
  dictation: "Plays a target-language sentence as audio only; the learner types what they heard.",
  fix_mistake: "Shows a target-language sentence with exactly one error; give the corrected reference.",
  spot_words: "Shows a short target-language passage (no marks) and a checklist of the lesson words it uses (words, in the order they appear); the learner ticks the ones they recognised. Give the passage's English translation; it shows after the checklist is sent.",
};
const COMPONENT_NOTE = " Name the lesson (lessonId) and the lesson words it tests (words) when it practises a lesson. Ask a practice set: call several ask_* tools of different kinds in one response, then wait for all the answers.";
const HINT_NOTE = " Add hints for the key words the learner must produce: each a lesson word ID (from get_lesson or the word tools) with the cue, the exact words of the question it helps with (such as \"tidy up\"). The learner sees only the cue until they open a hint; the word comes from the lesson.";

const CONFIRMED_TOOLS = {
  complete_lesson: { description: "Marks a published lesson completed for the learner. The learner must confirm a card first.", schema: lessonIdArg },
  reset_lesson: { description: "Starts a lesson over for the learner, deleting its progress, attempts, and reviews. The learner must confirm a card first.", schema: lessonIdArg },
  save_ai_practice: {
    description: "Saves a practice question to one or more lessons, after a block of each (afterBlockId from get_lesson), for every learner of those lessons. The learner must confirm a card first.",
    schema: saveAiPracticeArgsSchema,
  },
} as const;

const recordReviewSchema = z.object({ lessonId: z.uuid(), wordId: z.uuid(), direction: wordDrillDirectionSchema, result: wordDrillResultSchema });
const WRITE_TOOLS = {
  record_word_review: {
    description: "Records a got/again review of a lesson word that a question in this conversation tested (answers already record their words; use this for words the learner showed they know or missed in conversation).",
    schema: recordReviewSchema,
  },
  update_tutor_notes: {
    description: "Replaces your private notes about the learner (recurring mistakes, preferences), at most 2000 characters. Empty notes clear them.",
    schema: z.object({ notes: z.string().max(TUTOR_NOTES_MAX) }),
  },
  set_conversation_title: {
    description: "Renames this conversation in the learner's list: a short title (at most 60 characters, no quotes) naming its topic, such as \"Separable verbs: opruimen, afwassen\". Refused when the learner named the conversation.",
    schema: z.object({ title: z.string().transform((value) => value.replace(/\s+/g, " ").replace(/^["'“”]+|["'“”]+$/g, "").trim()).pipe(z.string().min(1).max(TUTOR_TITLE_MAX)) }),
  },
} as const;

// Every read and write tool (the ones the learner sees as steps) also takes `summary`: one line, written for the learner, saying
// what this call does. It is validated before the tool's own arguments and stored in the result's detail, so the session rail and
// step details describe the call instead of naming only the tool. Questions and confirmation cards describe themselves.
export const TOOL_SUMMARY_MAX = 120;
const summaryArgs = z.object({
  summary: z.string().transform((value) => value.replace(/\s+/g, " ").trim()).pipe(z.string().min(1).max(TOOL_SUMMARY_MAX))
    .describe("One short line for the learner, in English, saying what this call does and for what, such as \"Reading lesson 3: Boodschappen\" or \"Checking your weakest words for a review\". Never include answers."),
});
const summarized = (name: string) => name in READ_TOOLS || name in WRITE_TOOLS;

export const TOOL_NAMES = [
  ...Object.keys(READ_TOOLS), ...TUTOR_COMPONENT_KINDS.map((kind) => `ask_${kind}`), ...Object.keys(CONFIRMED_TOOLS), ...Object.keys(WRITE_TOOLS),
] as const;

function parameters(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _schema, ...json } = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as Record<string, unknown>;
  return json;
}

let definitions: AiToolDefinition[] | null = null;
export function toolDefinitions(): AiToolDefinition[] {
  definitions ??= [
    ...Object.entries(READ_TOOLS).map(([name, tool]) => ({ name, description: tool.description, parameters: parameters(summaryArgs.extend(tool.schema.shape)) })),
    ...TUTOR_COMPONENT_KINDS.map((kind) => ({ name: `ask_${kind}`, description: COMPONENT_DESCRIPTIONS[kind] + COMPONENT_NOTE + ((TUTOR_HINT_KINDS as readonly string[]).includes(kind) ? HINT_NOTE : ""), parameters: parameters(tutorComponentPayloadSchemas[kind]) })),
    ...Object.entries(CONFIRMED_TOOLS).map(([name, tool]) => ({ name, description: tool.description, parameters: parameters(tool.schema) })),
    ...Object.entries(WRITE_TOOLS).map(([name, tool]) => ({ name, description: tool.description, parameters: parameters(summaryArgs.extend(tool.schema.shape)) })),
  ];
  return definitions;
}

const invalidArguments = (error: z.ZodError): ToolOutcome => {
  const issues = error.issues.slice(0, 5).map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ");
  return { ...failed("INVALID_ARGUMENTS", `The arguments do not fit the tool: ${issues}`), issues } as ToolOutcome;
};

const lessonDetail = (lesson: ReadableLesson): TutorToolDetail => ({ lessonId: lesson.id, lessonTitle: lesson.title.slice(0, 200), courseTitle: lesson.course.title.slice(0, 200) });

/** Runs one tool call. Unknown tools and invalid arguments come back as failed results the model can correct. */
export async function runTool(context: ToolContext, name: string, args: unknown): Promise<ToolOutcome> {
  if (!summarized(name)) return dispatchTool(context, name, args);
  const parsed = summaryArgs.safeParse(args);
  if (!parsed.success) return invalidArguments(parsed.error);
  // The tools' own schemas strip the unknown `summary` key.
  const outcome = await dispatchTool(context, name, args);
  return outcome.kind === "result" ? { ...outcome, detail: { ...outcome.detail, summary: parsed.data.summary } } : outcome;
}

async function dispatchTool(context: ToolContext, name: string, args: unknown): Promise<ToolOutcome> {
  const { db, userId } = context;
  if (name in READ_TOOLS) {
    const parsed = READ_TOOLS[name as keyof typeof READ_TOOLS].schema.safeParse(args);
    if (!parsed.success) return invalidArguments(parsed.error);
    const input = parsed.data as Record<string, unknown>;
    const limit = typeof input.limit === "number" ? input.limit : 10;
    switch (name as keyof typeof READ_TOOLS) {
      case "search_words": {
        const words = await searchWords(db, userId, String(input.query), 20);
        return ok({ query: String(input.query).slice(0, 100), count: words.length }, { words });
      }
      case "get_words": {
        const refs = (input.words as Array<{ lessonId: string; wordId: string }>);
        const found = await readableWords(db, userId, refs);
        const words = refs.flatMap((ref) => {
          const word = found.get(wordKey(ref));
          return word ? [{ lessonId: word.lessonId, wordId: word.wordId, term: word.term, meaning: word.meaning, forms: word.forms, example: word.example, lessonTitle: word.lessonTitle }] : [];
        });
        const missing = refs.filter((ref) => !found.has(wordKey(ref))).map((ref) => ref.wordId);
        return ok({ count: words.length }, missing.length ? { words, notFound: missing } : { words });
      }
      case "get_weak_words": { const words = await weakestWords(db, userId, limit, context.now()); return ok({ count: words.length }, { words }); }
      case "get_recent_words": { const words = await recentWords(db, userId, limit); return ok({ count: words.length }, { words }); }
      case "get_recent_mistakes": { const mistakes = await recentMistakes(db, userId, limit); return ok({ count: mistakes.length }, { mistakes }); }
      case "get_course_progress": {
        if (typeof input.courseId !== "string") {
          const courses = await readableCourses(db, userId);
          return ok({ count: courses.length }, { courses: courses.map((course) => ({ courseId: course.id, title: course.title, archived: course.status === "archived", publishedLessons: course.publishedLessons, completedLessons: course.completedLessons })) });
        }
        const course = await readableCourse(db, userId, input.courseId);
        if (!course) return notFound("course");
        const progress = await readLessonProgress(db, { groupId: course.groupId, id: course.id }, userId);
        return ok({ courseId: course.id, courseTitle: course.title.slice(0, 200), completedLessons: progress.completedLessons, publishedLessons: progress.publishedLessons }, {
          course: { courseId: course.id, title: course.title, archived: course.status === "archived" },
          complete: progress.complete, publishedLessons: progress.publishedLessons, completedLessons: progress.completedLessons, missedLessons: progress.missedLessons,
          lessons: progress.lessons.map(({ practiceIds: _practiceIds, slug: _slug, ...lesson }) => lesson),
        });
      }
      case "get_lesson": {
        const lesson = input.lessonId === "next" ? await nextLesson(db, userId) : await readableLesson(db, userId, String(input.lessonId));
        if (!lesson) return input.lessonId === "next" ? ok({ next: false }, { lesson: null, message: "There is no next lesson: everything readable is completed, or no course is readable." }) : notFound("lesson");
        return ok({ ...lessonDetail(lesson), next: input.lessonId === "next" }, { lesson: lessonForModel(lesson) });
      }
      case "list_lessons": {
        const lessons = await readableLessonList(db, userId, { courseId: typeof input.courseId === "string" ? input.courseId : null, query: typeof input.query === "string" ? input.query : null });
        return ok({ ...(typeof input.query === "string" ? { query: input.query.slice(0, 100) } : {}), count: lessons.length }, { lessons });
      }
      case "list_ai_practices": {
        const lesson = await readableLesson(db, userId, String(input.lessonId));
        if (!lesson) return notFound("lesson");
        const practices = await listAiPractices(db, lesson.id);
        return ok({ ...lessonDetail(lesson), count: practices.length }, { practices });
      }
    }
  }
  if (name.startsWith("ask_") && (TUTOR_COMPONENT_KINDS as readonly string[]).includes(name.slice(4))) return askComponent(context, name.slice(4) as TutorComponentKind, args);
  if (name in CONFIRMED_TOOLS) return askConfirmation(context, name as TutorConfirmationAction, args);
  if (name === "record_word_review") return recordReview(context, args);
  if (name === "update_tutor_notes") {
    const parsed = WRITE_TOOLS.update_tutor_notes.schema.safeParse(args);
    if (!parsed.success) return invalidArguments(parsed.error);
    const profile = await writeTutorNotes(db, userId, parsed.data.notes, context.now());
    return ok({ characters: profile.notes?.length ?? 0 }, { saved: true });
  }
  if (name === "set_conversation_title") {
    const parsed = WRITE_TOOLS.set_conversation_title.schema.safeParse(args);
    if (!parsed.success) return invalidArguments(parsed.error);
    const applied = await setConversationTitle(db, userId, context.conversationId, parsed.data.title, "tutor");
    if (!applied) return failed("TITLE_SET_BY_LEARNER", "The learner named this conversation; keep their title.");
    return ok({ title: parsed.data.title }, { saved: true });
  }
  return failed("UNKNOWN_TOOL", `There is no tool named ${name.slice(0, 60)}.`);
}

// Display fields keep the model's `[[...]]` marks, which the web shows as emphasised target-language text; every other text
// field (answers, references, chunks, nouns, spoken sentences) is stored without them, so grading and audio see plain text.
const MARKED_FIELDS = new Set(["question", "options", "source", "translation", "hint"]);
function withoutAnswerMarks(value: unknown, key: string | null = null): unknown {
  if (typeof value === "string") return key !== null && MARKED_FIELDS.has(key) ? value : stripTargetMarks(value);
  if (Array.isArray(value)) return value.map((item) => withoutAnswerMarks(item, key));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([field, item]) => [field, withoutAnswerMarks(item, field)]));
  return value;
}

async function askComponent(context: ToolContext, kind: TutorComponentKind, args: unknown): Promise<ToolOutcome> {
  const parsed = tutorComponentPayloadSchemas[kind].safeParse(withoutAnswerMarks(args));
  if (!parsed.success) return invalidArguments(parsed.error);
  const component = { kind, payload: parsed.data } as TutorComponent;
  // A Spot the words passage may mark the conversation's practice words; the marks leave the stored passage for the view.
  let passageMarks: TutorWordMark[] | undefined;
  if (component.kind === "spot_words" && component.payload.passage.includes("{{")) {
    const conversation = await readConversation(context.db, context.userId, context.conversationId);
    const marked = parseWordMarks(component.payload.passage, conversation ? conversationWordPractice(conversation)?.length ?? 0 : 0);
    component.payload.passage = marked.text; passageMarks = marked.words;
  }
  if (component.payload.lessonId && !(await readableLesson(context.db, context.userId, component.payload.lessonId))) return notFound("lesson");
  const hintRefs = componentHints(component);
  const refs = [...componentWords(component), ...hintRefs];
  const words = await readableWords(context.db, context.userId, refs);
  const missing = refs.filter((ref) => !words.has(wordKey(ref)));
  if (missing.length) return failed("WORD_NOT_FOUND", `These words are not in a lesson the learner can read: ${[...new Set(missing.map((ref) => ref.wordId))].join(", ")}. Use word IDs from get_lesson or the word tools.`);
  const hints = hintViews(hintRefs, words);
  let cards: QuickReviewCardView[] | undefined;
  let spotWords: SpotWordView[] | undefined;
  if (component.kind === "quick_review") cards = component.payload.cards.map((card) => {
    const word = words.get(wordKey(card))!;
    return { lessonId: card.lessonId, wordId: card.wordId, direction: card.direction, term: word.term, meaning: word.meaning, forms: word.forms, example: word.example };
  });
  if (component.kind === "spot_words") spotWords = component.payload.words.map((ref) => {
    const word = words.get(wordKey(ref))!;
    return { lessonId: ref.lessonId, wordId: ref.wordId, term: word.term, meaning: word.meaning, forms: word.forms };
  });
  return { kind: "component", component, view: tutorComponentView(component, { cards, spotWords, passageMarks, hints, random: context.random }) };
}

const titled = (lesson: ReadableLesson) => ({ course: { id: lesson.course.id, title: lesson.course.title }, lesson: { id: lesson.id, title: lesson.title } });

async function askConfirmation(context: ToolContext, action: TutorConfirmationAction, args: unknown): Promise<ToolOutcome> {
  const { db, userId } = context;
  const parsed = CONFIRMED_TOOLS[action].schema.safeParse(args);
  if (!parsed.success) return invalidArguments(parsed.error);
  if (action === "save_ai_practice") {
    const input = parsed.data as z.infer<typeof saveAiPracticeArgsSchema>;
    const lessons = [];
    for (const tag of input.lessons) {
      const lesson = await readableLesson(db, userId, tag.lessonId);
      if (!lesson) return notFound("lesson");
      if (lesson.course.status === "archived") return failed("COURSE_ARCHIVED", "This lesson's course is archived.");
      lessons.push({ ...titled(lesson), afterBlockId: tag.afterBlockId });
    }
    const words = [...componentWords(input.practice), ...componentHints(input.practice)];
    const found = await readableWords(db, userId, words);
    if (words.some((ref) => !found.has(wordKey(ref)))) return notFound("word");
    const hints = hintViews(componentHints(input.practice), found);
    const focus = input.focus ?? defaultAiPracticeFocus(input.practice.kind);
    return { kind: "confirmation", arguments: input as unknown as Record<string, unknown>, summary: { action, view: tutorComponentView(input.practice, { hints, random: context.random }), focus, lessons } };
  }
  const { lessonId } = parsed.data as { lessonId: string };
  const lesson = await readableLesson(db, userId, lessonId);
  if (!lesson) return notFound("lesson");
  if (lesson.course.status === "archived") return failed("COURSE_ARCHIVED", "This lesson's course is archived, so its progress cannot change.");
  if (action === "complete_lesson") return { kind: "confirmation", arguments: { lessonId }, summary: { action, ...titled(lesson) } };
  const counts = await db.prepare(
    `SELECT EXISTS (SELECT 1 FROM course_lesson_positions WHERE lesson_id = ?2 AND user_id = ?1) AS position,
       EXISTS (SELECT 1 FROM course_lesson_completions WHERE lesson_id = ?2 AND user_id = ?1) AS completion,
       (SELECT COUNT(*) FROM course_practice_progress WHERE lesson_id = ?2 AND user_id = ?1) AS practiceProgress,
       (SELECT COUNT(*) FROM practice_attempts WHERE lesson_id = ?2 AND user_id = ?1) AS attempts,
       (SELECT COUNT(*) FROM word_reviews WHERE user_id = ?1 AND (lesson_id = ?2 OR term_key IN (${LESSON_TERMS}))) AS reviews,
       (SELECT COUNT(*) FROM pronunciation_attempts WHERE user_id = ?1 AND (lesson_id = ?2 OR term_key IN (${LESSON_TERMS}))) AS pronunciations,
       (SELECT COUNT(*) FROM course_word_bookmarks WHERE user_id = ?1 AND lesson_id = ?2) AS bookmarks`,
  ).bind(userId, lesson.id).first<{ position: number; completion: number; practiceProgress: number; attempts: number; reviews: number; pronunciations: number; bookmarks: number }>();
  return {
    kind: "confirmation", arguments: { lessonId },
    summary: {
      action, ...titled(lesson),
      deletes: {
        position: counts?.position === 1, completion: counts?.completion === 1, practiceProgress: counts?.practiceProgress ?? 0, attempts: counts?.attempts ?? 0,
        reviews: counts?.reviews ?? 0, pronunciations: counts?.pronunciations ?? 0, bookmarks: counts?.bookmarks ?? 0,
      },
    },
  };
}

/**
 * Runs a confirmed card's write. The lesson is resolved again, since the card may have waited. Returns the outcome stored on the
 * card and the data the model receives.
 */
export async function applyConfirmation(context: ToolContext, action: TutorConfirmationAction, args: Record<string, unknown>): Promise<{ ok: boolean; error: string | null; data: unknown }> {
  const { db, userId, conversationId } = context;
  if (action === "save_ai_practice") {
    const parsed = saveAiPracticeArgsSchema.safeParse(args);
    if (!parsed.success) return { ok: false, error: "INVALID_ARGUMENTS", data: { error: "INVALID_ARGUMENTS" } };
    const tags = [];
    for (const tag of parsed.data.lessons) {
      const lesson = await readableLesson(db, userId, tag.lessonId);
      if (!lesson || lesson.course.status === "archived") return { ok: false, error: "LESSON_NOT_FOUND", data: { error: "LESSON_NOT_FOUND" } };
      tags.push({ lessonId: lesson.id, courseId: lesson.course.id, afterBlockId: tag.afterBlockId });
    }
    const saved = await saveAiPractice(db, { userId, conversationId, practice: parsed.data.practice, focus: parsed.data.focus, lessons: tags, now: context.now() });
    return saved.ok
      ? { ok: true, error: null, data: { saved: true, practiceId: saved.practiceId } }
      : { ok: false, error: saved.error, data: { saved: false, error: saved.error, message: saved.error === "ANCHOR_NOT_FOUND"
        ? "An anchor block is not in the lesson's published document. Use block IDs from get_lesson." : "Saving AI practices is not available." } };
  }
  const lesson = typeof args.lessonId === "string" ? await readableLesson(db, userId, args.lessonId) : null;
  if (!lesson) return { ok: false, error: "LESSON_NOT_FOUND", data: { error: "LESSON_NOT_FOUND" } };
  if (lesson.course.status === "archived") return { ok: false, error: "COURSE_ARCHIVED", data: { error: "COURSE_ARCHIVED" } };
  const target = { groupId: lesson.course.groupId, courseId: lesson.course.id, lessonId: lesson.id, userId };
  if (action === "complete_lesson") await completeLesson(db, target, { actor: "agent", conversationId }, context.now());
  else await resetLesson(db, target, { actor: "agent", conversationId }, context.now());
  return { ok: true, error: null, data: { done: true, action, lessonId: lesson.id } };
}

// `record_word_review` accepts only a word that an answered component of this conversation tested.
async function recordReview(context: ToolContext, args: unknown): Promise<ToolOutcome> {
  const { db, userId, conversationId } = context;
  const parsed = recordReviewSchema.safeParse(args);
  if (!parsed.success) return invalidArguments(parsed.error);
  const input = parsed.data;
  const rows = await db.prepare(
    `SELECT m.parts FROM ai_messages m WHERE m.conversation_id = ? AND m.user_id = ? AND m.role = 'assistant'
       AND EXISTS (SELECT 1 FROM json_each(m.parts) p WHERE json_extract(p.value, '$.type') = 'component' AND json_extract(p.value, '$.answeredAt') IS NOT NULL)`,
  ).bind(conversationId, userId).all<{ parts: string }>();
  const tested = new Set(rows.results.flatMap((row) => parseParts(row.parts))
    .flatMap((part: TutorStoredPart) => part.type === "component" && part.answeredAt !== null && !part.skipped ? componentWords(part.component).map(wordKey) : []));
  if (!tested.has(wordKey(input))) return failed("WORD_NOT_TESTED", "Reviews can be recorded only for words a question in this conversation tested.");
  const word = (await readableWords(db, userId, [input])).get(wordKey(input));
  if (!word) return notFound("word");
  if (word.archived) return failed("COURSE_ARCHIVED", "This word's course is archived.");
  await recordWordReviews(db, userId, [{
    termKey: word.termKey, direction: input.direction, result: input.result, source: "ai_chat",
    courseId: word.courseId, lessonId: word.lessonId, wordId: word.wordId, conversationId,
  }], context.now());
  return ok({ term: word.term.slice(0, 200), result: input.result }, { recorded: true });
}
