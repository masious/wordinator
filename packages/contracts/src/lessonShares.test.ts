import { describe, expect, it } from "vitest";
import {
  COURSE_SENTENCE_MAX, createLessonShareRequestSchema, inlineContentSchema, lessonShareExampleSnapshotSchema, lessonShareExistsErrorSchema, lessonShareKey,
  lessonShareQuestionSnapshotSchema, POST_NOTES_MAX, postLessonShareSchema, postSchema, updateLessonShareRequestSchema,
} from ".";
import { courseLessonSchema, inlineContentSchema as reexportedInlineContentSchema } from "./lessonDocument";

const courseId = "10000000-0000-4000-8000-000000000001";
const lessonId = "20000000-0000-4000-8000-000000000001";
const blockId = "30000000-0000-4000-8000-000000000001";
const postId = "40000000-0000-4000-8000-000000000001";
const hash = "a".repeat(64);
const source = {
  courseId, lessonId, blockId, linked: true, courseTitle: "Dutch Foundations", lessonTitle: "Mijn huis", lessonNumber: 3,
  courseSlug: "dutch-foundations", lessonSlug: "mijn-huis",
};

describe("lesson share requests", () => {
  it("accepts examples, dialogues, and questions with an optional trimmed note", () => {
    expect(createLessonShareRequestSchema.parse({ courseId, lessonId, blockId })).toEqual({ courseId, lessonId, blockId });
    expect(createLessonShareRequestSchema.parse({ courseId, lessonId, blockId, itemIndex: 2, note: "  Lastig!  " }))
      .toEqual({ courseId, lessonId, blockId, itemIndex: 2, note: "Lastig!" });
    expect(createLessonShareRequestSchema.parse({ courseId, lessonId, blockId, note: null }).note).toBeNull();
  });

  it("refuses malformed IDs, item indexes, oversized notes, and client-sent content", () => {
    expect(() => createLessonShareRequestSchema.parse({ courseId, lessonId, blockId: "block" })).toThrow();
    expect(() => createLessonShareRequestSchema.parse({ courseId, lessonId, blockId, itemIndex: -1 })).toThrow();
    expect(() => createLessonShareRequestSchema.parse({ courseId, lessonId, blockId, itemIndex: 50 })).toThrow();
    expect(() => createLessonShareRequestSchema.parse({ courseId, lessonId, blockId, itemIndex: 1.5 })).toThrow();
    expect(() => createLessonShareRequestSchema.parse({ courseId, lessonId, blockId, note: "x".repeat(POST_NOTES_MAX + 1) })).toThrow();
    // The server builds the snapshot; a request carrying content is malformed rather than silently trusted.
    expect(() => createLessonShareRequestSchema.parse({ courseId, lessonId, blockId, snapshot: { prompt: "Hoi" } })).toThrow();
  });

  it("edits only the note of a share post", () => {
    expect(updateLessonShareRequestSchema.parse({ type: "lesson_share", notes: " Nieuw " })).toEqual({ type: "lesson_share", notes: "Nieuw" });
    expect(() => updateLessonShareRequestSchema.parse({ type: "lesson_share", notes: null, body: "Ander" })).toThrow();
  });
});

describe("lesson share keys", () => {
  it("keys examples and dialogues by block and questions by block and normalised prompt", () => {
    expect(lessonShareKey({ blockId })).toBe(blockId);
    expect(lessonShareKey({ blockId, prompt: null })).toBe(blockId);
    expect(lessonShareKey({ blockId, prompt: "Er … een balkon." })).toBe(`${blockId}:er een balkon`);
  });

  it("ignores case, punctuation, quotes, and spacing in a question's prompt", () => {
    expect(lessonShareKey({ blockId, prompt: "  “Waar  is HET station?” " })).toBe(lessonShareKey({ blockId, prompt: "waar is het station" }));
    expect(lessonShareKey({ blockId, prompt: "Waar is het station?" })).not.toBe(lessonShareKey({ blockId, prompt: "Waar is de bus?" }));
  });
});

describe("lesson share snapshots", () => {
  const content = [{ type: "text" as const, text: "Er is ", styles: {} }, { type: "text" as const, text: "een", styles: { bold: true, textColor: "blue" as const } }];

  it("keeps an example's inline formatting, translation, note, and clip hash", () => {
    const example = { content, translation: "There is one.", note: null, clipHash: hash };
    expect(lessonShareExampleSnapshotSchema.parse(example)).toEqual(example);
    expect(lessonShareExampleSnapshotSchema.parse({ ...example, clipHash: null }).clipHash).toBeNull();
    expect(() => lessonShareExampleSnapshotSchema.parse({ ...example, clipHash: "speech/abc.mp3" })).toThrow();
  });

  it("refuses unsafe links, unsupported styles, and over-long sentences", () => {
    const base = { translation: null, note: null, clipHash: null };
    expect(() => lessonShareExampleSnapshotSchema.parse({ ...base, content: [{ type: "link", href: "javascript:alert(1)", content: [] }] })).toThrow();
    expect(() => lessonShareExampleSnapshotSchema.parse({ ...base, content: [{ type: "text", text: "x", styles: { underline: true } }] })).toThrow();
    expect(() => lessonShareExampleSnapshotSchema.parse({ ...base, content: [{ type: "text", text: "x".repeat(COURSE_SENTENCE_MAX + 1), styles: {} }] })).toThrow();
  });

  it("keeps a question's instruction, prompt, author's version, and index, and never an item note", () => {
    const question = { instruction: "Vul in.", prompt: "Er … een balkon.", authorsVersion: ["is"], itemIndex: 0 };
    expect(lessonShareQuestionSnapshotSchema.parse(question)).toEqual(question);
    expect(lessonShareQuestionSnapshotSchema.parse({ ...question, authorsVersion: [] }).authorsVersion).toEqual([]);
    expect(() => lessonShareQuestionSnapshotSchema.parse({ ...question, note: "Editor only" })).toThrow();
  });
});

describe("lesson share posts", () => {
  const post = {
    id: postId, groupId: courseId, type: "lesson_share", body: "", notes: null, course: null,
    author: { id: lessonId, displayName: "Ada", avatarUrl: null }, createdAt: 1, updatedAt: 1, edited: false,
    questions: [], expectedAnswers: [], commentCount: 0, reactionCount: 0, reactions: [], permissions: { edit: true, delete: true },
  };

  it("discriminates the three kinds and hides the example's clip hash behind a URL", () => {
    const example = { kind: "example", source, example: { content: [], translation: null, note: null }, speechUrl: "https://media.test/speech/a.mp3" };
    expect(postSchema.parse({ ...post, lessonShare: example }).lessonShare).toEqual(example);
    expect(() => postLessonShareSchema.parse({ ...example, example: { ...example.example, clipHash: hash } })).toThrow();
    const dialogue = { kind: "dialogue", source, available: false, turns: null, speech: {} };
    expect(postLessonShareSchema.parse(dialogue)).toEqual(dialogue);
    const question = { kind: "question", source, question: { instruction: "Vertaal.", prompt: "Hello", authorsVersion: ["Hallo"], itemIndex: 4 } };
    expect(postLessonShareSchema.parse(question)).toEqual(question);
    expect(() => postLessonShareSchema.parse({ ...question, kind: "paragraph" })).toThrow();
  });

  it("falls back to the saved titles without a lesson number or link", () => {
    const fallback = { ...source, lessonId: null, linked: false, lessonNumber: null, courseSlug: null, lessonSlug: null };
    expect(postLessonShareSchema.parse({ kind: "dialogue", source: fallback, available: false, turns: null, speech: {} }).source).toEqual(fallback);
    expect(postSchema.parse({ ...post, type: "question", lessonShare: null }).lessonShare).toBeNull();
  });

  it("names the existing post when a share is repeated", () => {
    expect(lessonShareExistsErrorSchema.parse({ error: { code: "LESSON_SHARE_EXISTS", message: "Already shared." }, postId }).postId).toBe(postId);
    expect(() => lessonShareExistsErrorSchema.parse({ error: { code: "LESSON_SHARE_EXISTS", message: "Already shared." } })).toThrow();
  });

  it("adds the viewer's shares to lesson reads", () => {
    expect(courseLessonSchema.shape.myShares.parse({ [blockId]: postId })).toEqual({ [blockId]: postId });
    expect(() => courseLessonSchema.shape.myShares.parse({ [blockId]: "post" })).toThrow();
  });

  it("keeps inline content importable from the lesson document contracts", () => {
    expect(reexportedInlineContentSchema).toBe(inlineContentSchema);
  });
});
