import { wordDrillDirectionSchema, wordDrillResultSchema } from "@wordinator/contracts/lesson-document";
import {
  componentWords, saveAiPracticeArgsSchema, TUTOR_COMPONENT_KINDS, TUTOR_NOTES_MAX, tutorComponentPayloadSchemas, tutorComponentView,
  type QuickReviewCardView, type TutorComponent, type TutorComponentKind, type TutorComponentView, type TutorConfirmationAction,
  type TutorConfirmationSummary, type TutorStoredPart, type TutorToolDetail,
} from "@wordinator/contracts/tutor";
import { z } from "zod";
import type { AiToolDefinition } from "../ai";
import { recordWordReviews } from "../learningData";
import { completeLesson, readLessonProgress, resetLesson } from "../learning/progress";
import { listAiPractices, saveAiPractice } from "./aiPractices";
import { recentLessons, recentMistakes, recentWords, searchWords, weakestWords } from "./learner";
import { lessonForModel, nextLesson, readableCourse, readableCourses, readableLesson, readableWords, wordKey, type ReadableLesson } from "./library";
import { writeTutorNotes } from "./profile";
import { parseParts } from "./store";

// The tutor's tools (docs/ai-tutor.md#tools). Every tool runs as the signed-in account: the context carries its user ID and no
// tool accepts one. Lessons, courses, and words are resolved under the account's read rules (published lessons of visible
// courses in its library); anything else is reported as not found. Results reach the model as JSON data in a tool message.
// Interactive tools return a component and confirmed writes a confirmation card; the loop then stops and waits for the learner.

export type ToolContext = { db: D1Database; userId: string; conversationId: string; now: () => number; random: () => number };

export type ToolOutcome =
  | { kind: "result"; ok: boolean; error: string | null; detail: TutorToolDetail; data: unknown }
  | { kind: "component"; component: TutorComponent; view: TutorComponentView }
  | { kind: "confirmation"; summary: TutorConfirmationSummary; arguments: Record<string, unknown> };

const ok = (detail: TutorToolDetail, data: unknown): ToolOutcome => ({ kind: "result", ok: true, error: null, detail, data });
const failed = (error: string, message: string, detail: TutorToolDetail = {}): ToolOutcome => ({ kind: "result", ok: false, error, detail, data: { error, message } });
const notFound = (what: "lesson" | "course" | "word") =>
  failed(`${what.toUpperCase()}_NOT_FOUND`, `This ${what} is not available. Use IDs from earlier tool results.`);

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
  get_lesson: {
    description: "Reads a published lesson: blocks with IDs, new words with IDs, examples, dialogues, and practices. lessonId \"next\" reads the lesson the learner should study next.",
    schema: z.object({ lessonId: z.union([z.uuid(), z.literal("next")]) }),
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
};
const COMPONENT_NOTE = " Name the lesson (lessonId) and the lesson words it tests (words) when it practises a lesson. Ask one question per turn, then wait.";

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
} as const;

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
    ...Object.entries(READ_TOOLS).map(([name, tool]) => ({ name, description: tool.description, parameters: parameters(tool.schema) })),
    ...TUTOR_COMPONENT_KINDS.map((kind) => ({ name: `ask_${kind}`, description: COMPONENT_DESCRIPTIONS[kind] + COMPONENT_NOTE, parameters: parameters(tutorComponentPayloadSchemas[kind]) })),
    ...Object.entries(CONFIRMED_TOOLS).map(([name, tool]) => ({ name, description: tool.description, parameters: parameters(tool.schema) })),
    ...Object.entries(WRITE_TOOLS).map(([name, tool]) => ({ name, description: tool.description, parameters: parameters(tool.schema) })),
  ];
  return definitions;
}

const invalidArguments = (error: z.ZodError) =>
  failed("INVALID_ARGUMENTS", `The arguments do not fit the tool: ${error.issues.slice(0, 5).map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ")}`);

const lessonDetail = (lesson: ReadableLesson): TutorToolDetail => ({ lessonId: lesson.id, lessonTitle: lesson.title.slice(0, 200), courseTitle: lesson.course.title.slice(0, 200) });

/** Runs one tool call. Unknown tools and invalid arguments come back as failed results the model can correct. */
export async function runTool(context: ToolContext, name: string, args: unknown): Promise<ToolOutcome> {
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
  return failed("UNKNOWN_TOOL", `There is no tool named ${name.slice(0, 60)}.`);
}

async function askComponent(context: ToolContext, kind: TutorComponentKind, args: unknown): Promise<ToolOutcome> {
  const parsed = tutorComponentPayloadSchemas[kind].safeParse(args);
  if (!parsed.success) return invalidArguments(parsed.error);
  const component = { kind, payload: parsed.data } as TutorComponent;
  if (component.payload.lessonId && !(await readableLesson(context.db, context.userId, component.payload.lessonId))) return notFound("lesson");
  const refs = componentWords(component);
  const words = await readableWords(context.db, context.userId, refs);
  const missing = refs.filter((ref) => !words.has(wordKey(ref)));
  if (missing.length) return failed("WORD_NOT_FOUND", `These words are not in a lesson the learner can read: ${missing.map((ref) => ref.wordId).join(", ")}. Use word IDs from get_lesson or the word tools.`);
  let cards: QuickReviewCardView[] | undefined;
  if (component.kind === "quick_review") cards = component.payload.cards.map((card) => {
    const word = words.get(wordKey(card))!;
    return { lessonId: card.lessonId, wordId: card.wordId, direction: card.direction, term: word.term, meaning: word.meaning, forms: word.forms, example: word.example };
  });
  return { kind: "component", component, view: tutorComponentView(component, { cards, random: context.random }) };
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
    const words = componentWords(input.practice);
    const found = await readableWords(db, userId, words);
    if (words.some((ref) => !found.has(wordKey(ref)))) return notFound("word");
    return { kind: "confirmation", arguments: input as unknown as Record<string, unknown>, summary: { action, view: tutorComponentView(input.practice, { random: context.random }), lessons } };
  }
  const { lessonId } = parsed.data as { lessonId: string };
  const lesson = await readableLesson(db, userId, lessonId);
  if (!lesson) return notFound("lesson");
  if (lesson.course.status === "archived") return failed("COURSE_ARCHIVED", "This lesson's course is archived, so its progress cannot change.");
  if (action === "complete_lesson") return { kind: "confirmation", arguments: { lessonId }, summary: { action, ...titled(lesson) } };
  const counts = await db.prepare(
    `SELECT EXISTS (SELECT 1 FROM course_lesson_positions WHERE lesson_id = ?1 AND user_id = ?2) AS position,
       EXISTS (SELECT 1 FROM course_lesson_completions WHERE lesson_id = ?1 AND user_id = ?2) AS completion,
       (SELECT COUNT(*) FROM course_practice_progress WHERE lesson_id = ?1 AND user_id = ?2) AS practiceProgress,
       (SELECT COUNT(*) FROM practice_attempts WHERE lesson_id = ?1 AND user_id = ?2) AS attempts,
       (SELECT COUNT(*) FROM word_reviews WHERE lesson_id = ?1 AND user_id = ?2) AS reviews`,
  ).bind(lesson.id, userId).first<{ position: number; completion: number; practiceProgress: number; attempts: number; reviews: number }>();
  return {
    kind: "confirmation", arguments: { lessonId },
    summary: {
      action, ...titled(lesson),
      deletes: { position: counts?.position === 1, completion: counts?.completion === 1, practiceProgress: counts?.practiceProgress ?? 0, attempts: counts?.attempts ?? 0, reviews: counts?.reviews ?? 0 },
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
    const saved = await saveAiPractice(db, { userId, conversationId, practice: parsed.data.practice, lessons: tags, now: context.now() });
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
    .flatMap((part: TutorStoredPart) => part.type === "component" && part.answeredAt !== null ? componentWords(part.component).map(wordKey) : []));
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
