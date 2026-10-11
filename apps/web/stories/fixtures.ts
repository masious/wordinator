import {
  accountSettingsResponseSchema, postSchema, sessionResponseSchema, type Post, type PostLessonShare,
} from "@wordinator/contracts";
import { courseDetailResponseSchema, LESSON_DOCUMENT_SCHEMA_VERSION, type CourseLesson, type LessonBlockOf, type LessonTopBlock } from "@wordinator/contracts/lesson-document";
import type { QueryClient } from "@tanstack/react-query";

// Story fixtures. Every response is parsed with its contract schema, so a contract change breaks the stories that no longer match.

export const groupId = "20000000-0000-4000-8000-000000000001";
export const accountId = "10000000-0000-4000-8000-000000000001";
const friendId = "10000000-0000-4000-8000-000000000002";
export const courseId = "30000000-0000-4000-8000-000000000001";
export const lessonId = "40000000-0000-4000-8000-000000000001";
const exampleId = "50000000-0000-4000-8000-000000000001";
const dialogueId = "50000000-0000-4000-8000-000000000002";
const practiceId = "50000000-0000-4000-8000-000000000003";
const readingId = "50000000-0000-4000-8000-000000000004";

// A short tone served from `.storybook/public`, standing in for every speech clip.
export const speechUrl = new URL("fixtures/speech.wav", window.location.href).href;

export const session = sessionResponseSchema.parse({
  status: "signedIn", user: { id: accountId, displayName: "Ada", username: "ada", avatarUrl: null, mustChangePassword: false, onboardingComplete: true },
  groups: [], requests: [], deletedGroups: [],
});
const settings = accountSettingsResponseSchema.parse({ email: "ada@example.com", displayName: "Ada", bio: "", avatarUrl: null, quickReactions: ["👍", "❤️", "😂"] });

// Extra cache entries a story needs, keyed exactly as the app's query options key them.
export type QuerySeed = Array<{ key: readonly unknown[]; data: unknown }>;
export function seedQueries(client: QueryClient, seed: QuerySeed = []) {
  client.setQueryData(["session"], session);
  client.setQueryData(["settings"], settings);
  for (const entry of seed) client.setQueryData(entry.key, entry.data);
}

const hours = (count: number) => Date.now() - count * 3_600_000;
const NOTE = "Er is (there is) takes a singular noun; er zijn takes a plural one.";

function post(value: Partial<Post> & Pick<Post, "type">, note: boolean): Post {
  return postSchema.parse({
    id: "60000000-0000-4000-8000-000000000001", groupId, body: "", notes: note ? NOTE : null, course: null, lessonShare: null,
    author: { id: friendId, displayName: "Bram", avatarUrl: null }, createdAt: hours(5), updatedAt: hours(5), edited: false,
    questions: [], expectedAnswers: [], commentCount: 3, reactionCount: 4,
    reactions: [
      { emoji: "👍", count: 3, reacted: true, members: [{ id: accountId, displayName: "Ada" }, { id: friendId, displayName: "Bram" }, { id: "10000000-0000-4000-8000-000000000003", displayName: "Cas" }] },
      { emoji: "❤️", count: 1, reacted: false, members: [{ id: friendId, displayName: "Bram" }] },
    ],
    permissions: { edit: true, delete: true }, ...value,
  });
}

const text = (value: string) => [{ type: "text" as const, text: value, styles: {} }];
const source = (linked: boolean) => linked
  ? { courseId, lessonId, blockId: exampleId, linked, courseTitle: "Dutch Foundations", lessonTitle: "Mijn huis", lessonNumber: 3, courseSlug: "dutch-foundations", lessonSlug: "mijn-huis" }
  : { courseId, lessonId: null, blockId: exampleId, linked, courseTitle: "Dutch Foundations", lessonTitle: "Mijn huis", lessonNumber: null, courseSlug: null, lessonSlug: null };
const share = (value: PostLessonShare, note: boolean) => post({ type: "lesson_share", lessonShare: value }, note);

const exampleShare = (linked: boolean): PostLessonShare => ({
  kind: "example", source: source(linked), speechUrl,
  example: {
    content: [{ type: "text", text: "Er is ", styles: {} }, { type: "text", text: "een balkon", styles: { bold: true } }, { type: "text", text: " aan de achterkant.", styles: {} }],
    translation: "There is a balcony at the back.", note: "Er is introduces something new.",
  },
});
const dialogueShare = (available: boolean): PostLessonShare => ({
  kind: "dialogue", source: { ...source(available), blockId: dialogueId }, available,
  turns: available ? [{ speaker: "Anna", text: "Is er een tuin achter het huis?" }, { speaker: "Bram", text: "Nee, maar er is een groot balkon." }] : null,
  speech: available ? { [`turn:${dialogueId}:0`]: speechUrl, [`turn:${dialogueId}:1`]: speechUrl } : {},
});
const questionShare = (fillIn: boolean): PostLessonShare => ({
  kind: "question", source: { ...source(true), blockId: practiceId },
  question: fillIn
    ? { instruction: "Vul in.", prompt: "… een tuin en … twee slaapkamers.", authorsVersion: ["Er is", "er zijn"], itemIndex: 1 }
    : { instruction: "Vertaal.", prompt: "There is a garden behind the house.", authorsVersion: ["Er is een tuin achter het huis."], itemIndex: 0 },
});
const course = (available: boolean) => available
  ? { id: courseId, available, title: "Dutch Foundations", summary: "Existence, location, and the house.", level: "A1", coverUrl: null }
  : { id: courseId, available, title: null, summary: null, level: null, coverUrl: null };

// Every journal post variant. `note` adds the post's notes, which the post page conceals until shown.
export const postVariants = {
  sharedSentence: (note: boolean) => post({ type: "shared_sentence", body: "Ik woon in een klein huis met een groot balkon." }, note),
  question: (note: boolean) => post({ type: "question", body: "Wanneer zeg je ‘er is’ en wanneer ‘het is’?" }, note),
  reading: (note: boolean) => post({
    type: "reading", body: "Mijn huis heeft twee verdiepingen. Beneden is de keuken, boven zijn de slaapkamers.",
    questions: [{ id: "70000000-0000-4000-8000-000000000001", position: 0, text: "Waar is de keuken?" }, { id: "70000000-0000-4000-8000-000000000002", position: 1, text: "Hoeveel verdiepingen heeft het huis?" }],
  }, note),
  fillIn: (note: boolean) => post({ type: "fill_in", body: "… een tuin achter het huis.", expectedAnswers: [{ position: 0, text: "Er is" }] }, note),
  course: () => post({ type: "course", course: course(true), permissions: { edit: false, delete: false } }, false),
  courseUnavailable: () => post({ type: "course", course: course(false), permissions: { edit: false, delete: false } }, false),
  exampleShare: (note: boolean) => share(exampleShare(true), note),
  exampleShareUnlinked: (note: boolean) => share(exampleShare(false), note),
  dialogueShare: (note: boolean) => share(dialogueShare(true), note),
  dialogueShareUnavailable: (note: boolean) => share(dialogueShare(false), note),
  questionShare: (note: boolean) => share(questionShare(false), note),
  fillInQuestionShare: (note: boolean) => share(questionShare(true), note),
} satisfies Record<string, (note: boolean) => Post>;
export type PostVariant = keyof typeof postVariants;

// A published lesson with every shareable kind, as the course read returns it, for the share action and dialog.
const example: LessonBlockOf<"example"> = { id: exampleId, type: "example", props: { translation: "There is a balcony.", note: "Er is = there is." }, content: text("Er is een balkon."), children: [] };
const dialogue: LessonBlockOf<"dialogue"> = { id: dialogueId, type: "dialogue", props: { turns: JSON.stringify([{ speaker: "Anna", text: "Is er een tuin?" }, { speaker: "Bram", text: "Nee." }]) }, children: [] };
const blocks: LessonTopBlock[] = [
  example, dialogue,
  { id: practiceId, type: "practice", children: [], props: { data: JSON.stringify({ instruction: "Vertaal.", passage: null, items: [{ prompt: "There is a garden.", authorsVersion: ["Er is een tuin."], note: "Editor only." }] }) } },
  { id: readingId, type: "practice", children: [], props: { data: JSON.stringify({ instruction: "Lees en antwoord.", passage: { title: "Het huis", content: "Het huis is groot." }, items: [{ prompt: "Is het huis groot?", authorsVersion: ["Ja."], note: null }] }) } },
];
export const shareBlocks = { example, dialogue, practice: practiceId, reading: readingId };
export function shareLesson(myShares: Record<string, string> = {}) {
  const summary = {
    id: lessonId, slug: "mijn-huis", position: 0, title: "Mijn huis", goal: null, published: true, publishedAt: 1, changed: false,
    updatedBy: { id: accountId, displayName: "Ada" }, updatedAt: 1, wordCount: 0, practiceCount: 2, imageUrl: null,
  };
  const detail = courseDetailResponseSchema.parse({
    course: {
      id: courseId, slug: "dutch-foundations", groupId, title: "Dutch Foundations", summary: "Home", level: null, intendedLearner: null, coverUrl: null, status: "published",
      owner: { id: friendId, displayName: "Bram", avatarUrl: null }, createdAt: 1, updatedAt: 1, speechCast: {}, contribution: null,
      permissions: { edit: false, publish: false, archive: false, removeContent: false, contribute: false, requestContribution: true, leaveContribution: false, manageContributors: false },
    },
    outline: [summary],
    lessons: [{
      ...summary, document: { schemaVersion: LESSON_DOCUMENT_SCHEMA_VERSION, blocks }, practiceProgress: {}, draft: null,
      speech: { [`example:${exampleId}`]: speechUrl, [`turn:${dialogueId}:0`]: speechUrl }, draftSpeech: null, myShares,
    }],
  });
  return { detail, lesson: detail.lessons[0] as CourseLesson };
}
