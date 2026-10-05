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
export const postSchema = z.object({
  id: opaqueIdSchema, groupId: opaqueIdSchema, type: postTypeSchema, body: z.string(), notes: z.string().nullable(),
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
    user: z.object({ id: opaqueIdSchema, displayName: z.string(), mustChangePassword: z.boolean() }),
    groups: z.array(groupSummarySchema),
    requests: z.array(membershipRequestSummarySchema),
    deletedGroups: z.array(deletedGroupSummarySchema),
  }),
]);
export type SessionResponse = z.infer<typeof sessionResponseSchema>;

export const invitationResponseSchema = z.object({ groupId: opaqueIdSchema, groupName: z.string(), language: languageSchema });
export const pendingMemberSchema = z.object({ userId: opaqueIdSchema, displayName: z.string(), requestedAt: z.number().int() });
export const groupShellResponseSchema = z.object({
  group: groupSummarySchema,
  invitationToken: z.string().min(32),
  pendingMembers: z.array(pendingMemberSchema),
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
  permissions: z.object({ manageMembers: z.boolean(), leave: z.boolean() }),
});
export type MemberDirectoryResponse = z.infer<typeof memberDirectoryResponseSchema>;
export const temporaryPasswordResponseSchema = z.object({ password: z.string().min(16) });
export const imageResponseSchema = z.object({ url: z.string().url() });

export const notificationKindSchema = z.enum(["join_requested", "join_accepted", "join_rejected", "member_removed", "post_response", "reply", "answer_pinned", "reaction"]);
export const notificationSchema = z.object({
  id: opaqueIdSchema,
  groupId: opaqueIdSchema,
  groupName: z.string(),
  actor: z.object({ id: opaqueIdSchema, displayName: z.string() }),
  kind: notificationKindSchema,
  postId: opaqueIdSchema.nullable(),
  commentId: opaqueIdSchema.nullable(),
  targetAvailable: z.boolean(),
  createdAt: z.number().int(),
  readAt: z.number().int().nullable(),
});
export const notificationPageSchema = z.object({ items: z.array(notificationSchema) });
export const restrictedNotificationPageSchema = z.object({ items: z.array(notificationSchema) });
export type Notification = z.infer<typeof notificationSchema>;

export const COMMENT_BODY_MAX = 10_000;
export const RESPONSE_ANSWER_MAX = 4_000;
export const commentKindSchema = z.enum(["text", "reading_response", "fill_response"]);
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
  id: string; parentId: string | null; kind: "text" | "reading_response" | "fill_response"; body: string | null;
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
