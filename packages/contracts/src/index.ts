import { z } from "zod";

export const opaqueIdSchema = z.uuid();
export type OpaqueId = z.infer<typeof opaqueIdSchema>;

export const cursorSchema = z.string().min(1).max(512);

export const paginationQuerySchema = z.object({
  cursor: cursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const fieldIssueSchema = z.object({
  path: z.array(z.union([z.string(), z.number()])),
  message: z.string(),
});

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    issues: z.array(fieldIssueSchema).optional(),
    requestId: z.string().min(1).optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("wordinator-api"),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const emailSchema = z.string().trim().email().max(254);
export const passwordSchema = z.string().min(6).max(256);
export const displayNameSchema = z.string().trim().min(1).max(80);
export const bioSchema = z.string().trim().max(500);
export const groupNameSchema = z.string().trim().min(1).max(100);
export const languageSchema = z.enum(["nl", "de"]);
export const membershipStateSchema = z.enum(["pending", "active", "rejected", "left", "removed"]);

export const signInRequestSchema = z.object({ email: emailSchema, password: passwordSchema });
export const registerRequestSchema = z.object({
  invitationToken: z.string().min(32).max(256),
  email: emailSchema,
  password: passwordSchema,
  displayName: displayNameSchema,
});
export const isSingleEmojiGrapheme = (value: string): boolean => {
  const graphemes = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value)];
  if (graphemes.length !== 1) return false;
  const codePoints = [...value].map((character) => character.codePointAt(0)!);
  return codePoints.some((codePoint) => (
    (codePoint >= 0x1f000 && codePoint <= 0x1faff)
    || (codePoint >= 0x2600 && codePoint <= 0x27bf)
    || (codePoint >= 0x2300 && codePoint <= 0x23ff)
  )) || /^[#*0-9]\uFE0F?\u20E3$/u.test(value);
};
export const quickReactionSchema = z.string().trim().refine(isSingleEmojiGrapheme, "Choose one emoji.");
export const quickReactionsSchema = z.array(quickReactionSchema).length(3).refine(
  (values) => new Set(values.map((value) => value.normalize("NFC"))).size === values.length,
  "Choose three different emoji.",
);

export const changePasswordRequestSchema = z.object({ currentPassword: passwordSchema.optional(), password: passwordSchema });
export const createGroupRequestSchema = z.object({ name: groupNameSchema, language: languageSchema });
export const membershipDecisionRequestSchema = z.object({ decision: z.enum(["accept", "reject"]) });
export const updateAccountSettingsRequestSchema = z.object({
  displayName: displayNameSchema,
  bio: bioSchema,
  quickReactions: quickReactionsSchema,
});
export const renameGroupRequestSchema = z.object({ name: groupNameSchema });
export const memberLifecycleRequestSchema = z.object({ confirmation: z.literal(true) });

export const POST_BODY_MAX = 10_000;
export const POST_NOTES_MAX = 4_000;
export const READING_QUESTION_MAX = 1_000;
export const READING_QUESTION_COUNT_MAX = 50;
export const FILL_EXPECTED_ANSWER_MAX = 500;
export const postTypeSchema = z.enum(["shared_sentence", "question", "reading", "fill_in"]);
export type PostType = z.infer<typeof postTypeSchema>;
// Feed posts also include the system-created `course` type, which the composer never offers.
export const feedPostTypeSchema = z.enum([...postTypeSchema.options, "course"]);
export type FeedPostType = z.infer<typeof feedPostTypeSchema>;
export const postBodySchema = z.string().trim().min(1).max(POST_BODY_MAX);
export const postNotesSchema = z.string().trim().max(POST_NOTES_MAX).nullable().optional();
export const readingQuestionInputSchema = z.object({ id: opaqueIdSchema.optional(), text: z.string().trim().min(1).max(READING_QUESTION_MAX) });
export const fillExpectedAnswerInputSchema = z.string().trim().max(FILL_EXPECTED_ANSWER_MAX).nullable();

const sharedSentenceInputSchema = z.object({ type: z.literal("shared_sentence"), body: postBodySchema, notes: postNotesSchema });
const questionInputSchema = z.object({ type: z.literal("question"), body: postBodySchema, notes: postNotesSchema });
const readingInputSchema = z.object({
  type: z.literal("reading"), body: postBodySchema, notes: postNotesSchema,
  questions: z.array(readingQuestionInputSchema).min(1).max(READING_QUESTION_COUNT_MAX),
});
const fillInInputSchema = z.object({
  type: z.literal("fill_in"), body: postBodySchema, notes: postNotesSchema,
  expectedAnswers: z.array(fillExpectedAnswerInputSchema).max(READING_QUESTION_COUNT_MAX),
});
export const postInputSchema = z.discriminatedUnion("type", [sharedSentenceInputSchema, questionInputSchema, readingInputSchema, fillInInputSchema]).superRefine((value, context) => {
  if (value.type !== "fill_in") return;
  const blanks = [...value.body].filter((character) => character === "…").length;
  if (blanks < 1) context.addIssue({ code: "custom", path: ["body"], message: "Add at least one … blank." });
  if (value.expectedAnswers.length !== blanks) context.addIssue({ code: "custom", path: ["expectedAnswers"], message: "Provide one expected-answer slot per blank." });
});
export const createPostRequestSchema = postInputSchema;
export const updatePostRequestSchema = postInputSchema;
export type PostInput = z.infer<typeof postInputSchema>;

export const postAuthorSchema = z.object({ id: opaqueIdSchema, displayName: z.string(), avatarUrl: z.string().url().nullable() });
// Course details are present only while the viewer may open the course; otherwise the post shows it as unavailable.
export const postCourseSchema = z.object({
  id: opaqueIdSchema, available: z.boolean(), title: z.string().nullable(), summary: z.string().nullable(),
  level: z.string().nullable(), coverUrl: z.string().url().nullable(),
});
export type PostCourse = z.infer<typeof postCourseSchema>;
export const postSchema = z.object({
  id: opaqueIdSchema, groupId: opaqueIdSchema, type: feedPostTypeSchema, body: z.string(), notes: z.string().nullable(),
  course: postCourseSchema.nullable(),
  author: postAuthorSchema, createdAt: z.number().int(), updatedAt: z.number().int(), edited: z.boolean(),
  questions: z.array(z.object({ id: opaqueIdSchema, position: z.number().int().nonnegative(), text: z.string() })),
  expectedAnswers: z.array(z.object({ position: z.number().int().nonnegative(), text: z.string().nullable() })),
  commentCount: z.number().int().nonnegative(), reactionCount: z.number().int().nonnegative(),
  reactions: z.array(z.object({ emoji: z.string(), count: z.number().int().positive(), reacted: z.boolean(), members: z.array(z.object({ id: opaqueIdSchema, displayName: z.string() })) })),
  permissions: z.object({ edit: z.boolean(), delete: z.boolean() }),
});
export type Post = z.infer<typeof postSchema>;
export const postPageSchema = z.object({ items: z.array(postSchema), nextCursor: z.string().nullable() });
export type PostPage = z.infer<typeof postPageSchema>;
export const createPostResponseSchema = z.object({ post: postSchema });
export const postResponseSchema = z.object({ post: postSchema });
export const feedQuerySchema = paginationQuerySchema.extend({ newerThan: cursorSchema.optional() });

export const groupSummarySchema = z.object({
  id: opaqueIdSchema,
  name: z.string(),
  language: languageSchema,
  role: z.enum(["creator", "member"]),
  icon: z.string(),
  iconUrl: z.string().url().nullable(),
});
export const deletedGroupSummarySchema = z.object({
  id: opaqueIdSchema,
  name: z.string(),
  language: languageSchema,
  role: z.enum(["creator", "member"]),
  deletedAt: z.number().int(),
});
export const membershipRequestSummarySchema = z.object({
  groupId: opaqueIdSchema,
  groupName: z.string(),
  state: membershipStateSchema,
});
export const sessionResponseSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("signedOut") }),
  z.object({
    status: z.literal("signedIn"),
    user: z.object({ 
      id: opaqueIdSchema, 
      displayName: z.string(), 
      avatarUrl: z.string().nullable(), 
      mustChangePassword: z.boolean() }),
    groups: z.array(groupSummarySchema),
    requests: z.array(membershipRequestSummarySchema),
    deletedGroups: z.array(deletedGroupSummarySchema),
  }),
]);
export type SessionResponse = z.infer<typeof sessionResponseSchema>;

export const invitationResponseSchema = z.object({ groupId: opaqueIdSchema, groupName: z.string(), language: languageSchema });
export const groupShellResponseSchema = z.object({
  group: groupSummarySchema,
  invitationToken: z.string().min(32),
  pendingRequestCount: z.number().int().nonnegative(),
});
export type GroupShellResponse = z.infer<typeof groupShellResponseSchema>;

export const okResponseSchema = z.object({ ok: z.literal(true) });
export const createGroupResponseSchema = z.object({ group: groupSummarySchema });
export const accountSettingsResponseSchema = z.object({
  email: emailSchema,
  displayName: displayNameSchema,
  bio: z.string(),
  avatarUrl: z.string().url().nullable(),
  quickReactions: quickReactionsSchema,
});
export type AccountSettingsResponse = z.infer<typeof accountSettingsResponseSchema>;

export const profileResponseSchema = z.object({
  profile: z.object({
    id: opaqueIdSchema,
    displayName: displayNameSchema,
    bio: z.string().nullable(),
    avatarUrl: z.string().url().nullable(),
    membership: z.enum(["active", "former"]),
  }),
  posts: postPageSchema,
});
export type ProfileResponse = z.infer<typeof profileResponseSchema>;

export const memberDirectoryItemSchema = z.object({
  id: opaqueIdSchema,
  displayName: displayNameSchema,
  bio: z.string().nullable(),
  avatarUrl: z.string().url().nullable(),
  membership: z.enum(["active", "former"]),
  isCreator: z.boolean(),
  joinedAt: z.number().int(),
});
export const memberDirectoryResponseSchema = z.object({
  active: z.array(memberDirectoryItemSchema),
  former: z.array(memberDirectoryItemSchema),
  permissions: z.object({ leave: z.boolean() }),
});
export type MemberDirectoryResponse = z.infer<typeof memberDirectoryResponseSchema>;
export const membershipAdminItemSchema = z.object({
  id: opaqueIdSchema,
  displayName: z.string(),
  avatarUrl: z.string().url().nullable(),
  state: z.enum(["pending", "active", "rejected", "left", "removed"]),
  isCreator: z.boolean(),
  requestedAt: z.number().int(),
  decidedAt: z.number().int().nullable(),
});
export const membershipAdminResponseSchema = z.object({
  pending: z.array(membershipAdminItemSchema),
  active: z.array(membershipAdminItemSchema),
  rejected: z.array(membershipAdminItemSchema),
  former: z.array(membershipAdminItemSchema),
});
export type MembershipAdminItem = z.infer<typeof membershipAdminItemSchema>;
export type MembershipAdminResponse = z.infer<typeof membershipAdminResponseSchema>;
export const temporaryPasswordResponseSchema = z.object({ password: z.string().min(16) });
export const imageResponseSchema = z.object({ url: z.string().url() });

export const notificationKindSchema = z.enum([
  "join_requested", "join_accepted", "join_rejected", "member_removed", "post_response", "reply", "answer_pinned", "reaction",
  "contributor_requested", "contributor_accepted", "contributor_rejected",
]);
export const notificationSchema = z.object({
  id: opaqueIdSchema,
  groupId: opaqueIdSchema,
  groupName: z.string(),
  actor: z.object({ id: opaqueIdSchema, displayName: z.string() }),
  kind: notificationKindSchema,
  postId: opaqueIdSchema.nullable(),
  commentId: opaqueIdSchema.nullable(),
  // Contributor notifications link to the course instead of a post.
  courseId: opaqueIdSchema.nullable(),
  targetAvailable: z.boolean(),
  createdAt: z.number().int(),
  readAt: z.number().int().nullable(),
});
export const notificationPageSchema = z.object({ items: z.array(notificationSchema) });
export const restrictedNotificationPageSchema = z.object({ items: z.array(notificationSchema) });
export type Notification = z.infer<typeof notificationSchema>;

export const COMMENT_BODY_MAX = 10_000;
export const RESPONSE_ANSWER_MAX = 4_000;
export const commentKindSchema = z.enum(["text", "reading_response", "fill_response", "practice_response"]);
export const textCommentInputSchema = z.object({ kind: z.literal("text"), body: z.string().trim().min(1).max(COMMENT_BODY_MAX), parentId: opaqueIdSchema.nullable().optional() });
export const readingResponseInputSchema = z.object({ kind: z.literal("reading_response"), answers: z.array(z.string().max(RESPONSE_ANSWER_MAX)).min(1).max(READING_QUESTION_COUNT_MAX) });
export const fillResponseInputSchema = z.object({ kind: z.literal("fill_response"), answers: z.array(z.string().max(FILL_EXPECTED_ANSWER_MAX)).min(1).max(READING_QUESTION_COUNT_MAX) });
export const createCommentRequestSchema = z.discriminatedUnion("kind", [textCommentInputSchema, readingResponseInputSchema, fillResponseInputSchema]);
export const updateCommentRequestSchema = z.discriminatedUnion("kind", [
  textCommentInputSchema.omit({ parentId: true }), readingResponseInputSchema, fillResponseInputSchema,
]);
export const reactionSummarySchema = z.object({
  emoji: quickReactionSchema, count: z.number().int().positive(), reacted: z.boolean(),
  members: z.array(z.object({ id: opaqueIdSchema, displayName: z.string() })),
});
export type ReactionSummary = z.infer<typeof reactionSummarySchema>;
export const responseItemSchema = z.object({ position: z.number().int().nonnegative(), prompt: z.string().nullable(), answer: z.string(), skipped: z.boolean(), matched: z.boolean().nullable() });
export type DiscussionItem = {
  id: string; parentId: string | null; kind: z.infer<typeof commentKindSchema>; body: string | null;
  author: z.infer<typeof postAuthorSchema>; createdAt: number; updatedAt: number; edited: boolean; pinned: boolean;
  responseItems: z.infer<typeof responseItemSchema>[]; reactions: ReactionSummary[];
  permissions: { edit: boolean; delete: boolean; reply: boolean; pin: boolean }; replies: DiscussionItem[];
};
export const discussionItemSchema: z.ZodType<DiscussionItem> = z.lazy(() => z.object({
  id: opaqueIdSchema, parentId: opaqueIdSchema.nullable(), kind: commentKindSchema, body: z.string().nullable(), author: postAuthorSchema,
  createdAt: z.number().int(), updatedAt: z.number().int(), edited: z.boolean(), pinned: z.boolean(), responseItems: z.array(responseItemSchema),
  reactions: z.array(reactionSummarySchema), permissions: z.object({ edit: z.boolean(), delete: z.boolean(), reply: z.boolean(), pin: z.boolean() }),
  replies: z.array(discussionItemSchema),
}));
export const discussionResponseSchema = z.object({
  items: z.array(discussionItemSchema), count: z.number().int().nonnegative(), concealed: z.boolean(), quickReactions: quickReactionsSchema,
});
export type DiscussionResponse = z.infer<typeof discussionResponseSchema>;
export const commentResponseSchema = z.object({ item: discussionItemSchema });
export const toggleReactionRequestSchema = z.object({ emoji: quickReactionSchema, active: z.boolean() });
export const reactionTargetResponseSchema = z.object({ reactions: z.array(reactionSummarySchema) });
export const pinRequestSchema = z.object({ commentId: opaqueIdSchema.nullable() });

export const COURSE_TITLE_MAX = 200;
export const COURSE_TEXT_MAX = 2_000;
export const COURSE_LEVEL_MAX = 200;
export const courseStatusSchema = z.enum(["draft", "published", "archived"]);
export type CourseStatus = z.infer<typeof courseStatusSchema>;
const optionalCourseTextSchema = (max: number) => z.string().trim().max(max).nullable().optional();
export const courseInputSchema = z.object({
  title: z.string().trim().min(1).max(COURSE_TITLE_MAX),
  summary: z.string().trim().min(1).max(COURSE_TEXT_MAX),
  level: optionalCourseTextSchema(COURSE_LEVEL_MAX),
  intendedLearner: optionalCourseTextSchema(COURSE_TEXT_MAX),
});
export const createCourseRequestSchema = courseInputSchema;
export const updateCourseRequestSchema = courseInputSchema;
export type CourseInput = z.infer<typeof courseInputSchema>;
export const courseVisibilityRequestSchema = z.object({ status: z.enum(["draft", "published"]) });
export const courseSchema = z.object({
  id: opaqueIdSchema, groupId: opaqueIdSchema, title: z.string(), summary: z.string(),
  level: z.string().nullable(), intendedLearner: z.string().nullable(), coverUrl: z.string().url().nullable(),
  status: courseStatusSchema, owner: postAuthorSchema, createdAt: z.number().int(), updatedAt: z.number().int(),
  // The viewer's own contributor request or role; null when they have neither.
  contribution: z.enum(["pending", "active"]).nullable(),
  permissions: z.object({
    edit: z.boolean(), publish: z.boolean(), archive: z.boolean(), removeContent: z.boolean(),
    // Adding lessons and editing lesson drafts: the owner and active contributors.
    contribute: z.boolean(), requestContribution: z.boolean(), leaveContribution: z.boolean(), manageContributors: z.boolean(),
  }),
});
export type Course = z.infer<typeof courseSchema>;
export const coursePageSchema = z.object({ items: z.array(courseSchema), nextCursor: z.string().nullable() });
export type CoursePage = z.infer<typeof coursePageSchema>;
export const courseResponseSchema = z.object({ course: courseSchema });
export const courseContributorSchema = z.object({
  user: postAuthorSchema, state: z.enum(["pending", "active"]), requestedAt: z.number().int(), decidedAt: z.number().int().nullable(),
});
export type CourseContributor = z.infer<typeof courseContributorSchema>;
// Pending requests are listed only for the course owner.
export const courseContributorsResponseSchema = z.object({ active: z.array(courseContributorSchema), pending: z.array(courseContributorSchema) });
export type CourseContributorsResponse = z.infer<typeof courseContributorsResponseSchema>;
export const contributorDecisionRequestSchema = z.object({ decision: z.enum(["accept", "reject"]) });

export const COURSE_HEADING_MAX = 200;
export const COURSE_BLOCK_TEXT_MAX = 10_000;
export const COURSE_SENTENCE_MAX = 1_000;
export const COURSE_NOTE_MAX = 2_000;
export const COURSE_SPEAKER_MAX = 40;
export const COURSE_DIALOGUE_TURNS_MAX = 50;
export const COURSE_LESSONS_MAX = 200;
export const COURSE_BLOCKS_MAX = 200;

// Block payloads of the v1 per-row model. They remain the shape of practice and dialogue data inside lesson documents
// and of the course fixture; `upgradeLegacyBlocks` in ./lessonDocument turns them into documents.
const requiredBlockText = (max: number) => z.string().trim().min(1).max(max);
const optionalBlockText = (max: number) => z.string().trim().max(max).nullable().optional().transform((value) => value || null);
export const headingPayloadSchema = z.object({ title: requiredBlockText(COURSE_HEADING_MAX) });
export const textPayloadSchema = z.object({ content: requiredBlockText(COURSE_BLOCK_TEXT_MAX) });
export const examplePayloadSchema = z.object({
  sentence: requiredBlockText(COURSE_SENTENCE_MAX),
  translation: optionalBlockText(COURSE_SENTENCE_MAX),
  note: optionalBlockText(COURSE_NOTE_MAX),
});
export const dialoguePayloadSchema = z.object({
  turns: z.array(z.object({ speaker: requiredBlockText(COURSE_SPEAKER_MAX), text: requiredBlockText(COURSE_SENTENCE_MAX) })).min(1).max(COURSE_DIALOGUE_TURNS_MAX),
});
export const COURSE_INSTRUCTION_MAX = 2_000;
export const COURSE_PRACTICE_ITEMS_MAX = 50;
export const COURSE_AUTHORS_VERSION_MAX = 1_000;
export const countBlanks = (value: string) => [...value].filter((character) => character === "…").length;
const authorsVersionEntrySchema = z.string().trim().max(COURSE_AUTHORS_VERSION_MAX).nullable().transform((value) => value || null);
// A prompt with … blanks is a fill-in item whose author's version has one nullable entry per blank; any other prompt is open
// and has at most one entry. A version with no filled entry is stored as an empty list, meaning there is no author's version.
export const practiceItemSchema = z.object({
  prompt: requiredBlockText(COURSE_SENTENCE_MAX),
  authorsVersion: z.array(authorsVersionEntrySchema).max(COURSE_PRACTICE_ITEMS_MAX).optional().transform((value) => value?.some((entry) => entry !== null) ? value : []),
  note: optionalBlockText(COURSE_NOTE_MAX),
}).superRefine((item, context) => {
  const blanks = countBlanks(item.prompt);
  if (blanks > 0 && item.authorsVersion.length > 0 && item.authorsVersion.length !== blanks) {
    context.addIssue({ code: "custom", path: ["authorsVersion"], message: "Provide one author's version entry per blank." });
  }
  if (blanks === 0 && item.authorsVersion.length > 1) context.addIssue({ code: "custom", path: ["authorsVersion"], message: "An open item has at most one author's version." });
});
export const practicePayloadSchema = z.object({
  instruction: requiredBlockText(COURSE_INSTRUCTION_MAX),
  passage: z.object({ title: optionalBlockText(COURSE_HEADING_MAX), content: requiredBlockText(COURSE_BLOCK_TEXT_MAX) }).nullable().optional().transform((value) => value ?? null),
  items: z.array(practiceItemSchema).min(1).max(COURSE_PRACTICE_ITEMS_MAX),
});
export type PracticePayload = z.output<typeof practicePayloadSchema>;
export const courseBlockKindSchema = z.enum(["heading", "text", "example", "dialogue", "practice"]);
export type CourseBlockKind = z.infer<typeof courseBlockKindSchema>;
export const courseBlockPayloadSchemas = {
  heading: headingPayloadSchema, text: textPayloadSchema, example: examplePayloadSchema, dialogue: dialoguePayloadSchema, practice: practicePayloadSchema,
} as const satisfies Record<CourseBlockKind, z.ZodType>;
export type CourseBlockPayloads = { [K in CourseBlockKind]: z.output<(typeof courseBlockPayloadSchemas)[K]> };
export const courseBlockContentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("heading"), payload: headingPayloadSchema }),
  z.object({ kind: z.literal("text"), payload: textPayloadSchema }),
  z.object({ kind: z.literal("example"), payload: examplePayloadSchema }),
  z.object({ kind: z.literal("dialogue"), payload: dialoguePayloadSchema }),
  z.object({ kind: z.literal("practice"), payload: practicePayloadSchema }),
]);
export type CourseBlockContent = z.output<typeof courseBlockContentSchema>;
export type CourseBlockContentInput = z.input<typeof courseBlockContentSchema>;

// Lesson details are edited without a version; the lesson document has its own draft version.
export const lessonInputSchema = z.object({ title: requiredBlockText(COURSE_TITLE_MAX), goal: optionalBlockText(COURSE_TEXT_MAX) });
export const createLessonRequestSchema = lessonInputSchema;
export const updateLessonRequestSchema = lessonInputSchema;
export type LessonInput = z.input<typeof lessonInputSchema>;
// Reordering sends the complete ordered lesson list of one course; anything else is a stale order.
export const reorderRequestSchema = z.object({ ids: z.array(opaqueIdSchema).max(COURSE_LESSONS_MAX) });

export const editorRefSchema = z.object({ id: opaqueIdSchema, displayName: z.string() });
// Learners receive practice prompts only. Authors' versions and item notes travel separately as the reference, which editors
// receive with the draft and everyone else receives only with the revealed answer thread.
export const learnerPracticePayloadSchema = z.object({
  instruction: z.string(), passage: z.object({ title: z.string().nullable(), content: z.string() }).nullable(), items: z.array(z.object({ prompt: z.string() })),
});
export type LearnerPracticePayload = z.infer<typeof learnerPracticePayloadSchema>;
export const practiceReferenceSchema = z.object({
  items: z.array(z.object({ prompt: z.string(), authorsVersion: z.array(z.string().nullable()), note: z.string().nullable() })),
});
export type PracticeReference = z.infer<typeof practiceReferenceSchema>;
export function splitPracticePayload(payload: PracticePayload): { payload: LearnerPracticePayload; reference: PracticeReference } {
  return {
    payload: { instruction: payload.instruction, passage: payload.passage, items: payload.items.map((item) => ({ prompt: item.prompt })) },
    reference: { items: payload.items.map((item) => ({ prompt: item.prompt, authorsVersion: item.authorsVersion, note: item.note })) },
  };
}
// The outline entry of a lesson. `changed` tells editors that the draft differs from the published document.
export const courseLessonSummarySchema = z.object({
  id: opaqueIdSchema, position: z.number().int().nonnegative(), title: z.string(), goal: z.string().nullable(),
  published: z.boolean(), publishedAt: z.number().int().nullable(), changed: z.boolean(), updatedBy: editorRefSchema, updatedAt: z.number().int(),
});
export type CourseLessonSummary = z.infer<typeof courseLessonSummarySchema>;
export const COURSE_PRELOADED_LESSONS = 3;
export const outlineResponseSchema = z.object({ outline: z.array(courseLessonSummarySchema) });

export const practiceResponseInputSchema = z.object({ kind: z.literal("practice_response"), answers: z.array(z.string().max(RESPONSE_ANSWER_MAX)).min(1).max(COURSE_PRACTICE_ITEMS_MAX) });
export const createPracticeCommentRequestSchema = z.discriminatedUnion("kind", [textCommentInputSchema, practiceResponseInputSchema]);
export const updatePracticeCommentRequestSchema = z.discriminatedUnion("kind", [textCommentInputSchema.omit({ parentId: true }), practiceResponseInputSchema]);
export type CreatePracticeCommentRequest = z.input<typeof createPracticeCommentRequestSchema>;
export const practiceDiscussionResponseSchema = z.object({
  items: z.array(discussionItemSchema), count: z.number().int().nonnegative(), quickReactions: quickReactionsSchema, reference: practiceReferenceSchema,
});
export type PracticeDiscussionResponse = z.infer<typeof practiceDiscussionResponseSchema>;

// Course progress counts the lessons a member finished in the lesson player among the currently published lessons,
// plus the passed share of each published lesson they have started but not finished.
export const courseParticipantProgressSchema = z.object({
  user: postAuthorSchema, completedLessons: z.number().int().nonnegative(), percent: z.number().int().min(0).max(100),
});
export type CourseParticipantProgress = z.infer<typeof courseParticipantProgressSchema>;
// The viewer's last step in a lesson. Positions are private to their member and never listed for others.
export const lessonPositionSchema = z.object({
  lessonId: opaqueIdSchema, stepKey: z.string().max(64), stepIndex: z.number().int().nonnegative(),
  passedSteps: z.number().int().nonnegative(), totalSteps: z.number().int().positive(), updatedAt: z.number().int(),
});
export type LessonPosition = z.infer<typeof lessonPositionSchema>;
export const courseProgressResponseSchema = z.object({
  publishedLessons: z.number().int().nonnegative(),
  // The viewer's own finished lessons, including ones currently unpublished, so the outline can mark them.
  completedLessonIds: z.array(opaqueIdSchema),
  // The viewer's unfinished positions in currently published lessons, most recent first.
  positions: z.array(lessonPositionSchema),
  participants: z.array(courseParticipantProgressSchema),
});
export type CourseProgressResponse = z.infer<typeof courseProgressResponseSchema>;
