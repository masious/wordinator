import {
  conversationTitle, messageSpanTexts, toPublicPart, tutorConversationPageSchema, tutorConversationResponseSchema,
  tutorConversationsQuerySchema, tutorMessagePageSchema, tutorMessageRequestSchema, tutorMessagesQuerySchema, tutorProfileResponseSchema,
  tutorModelsResponseSchema, tutorRespondRequestSchema, tutorSetAnswersRequestSchema, tutorSkipSetRequestSchema, tutorSpeechRequestSchema, tutorUsageQuerySchema, tutorUsageResponseSchema, updateTutorConversationRequestSchema, updateTutorProfileRequestSchema, type TutorStoredPart, type TutorStreamEvent,
} from "@wordinator/contracts/tutor";
import { Hono, type Context } from "hono";
import { createMiddleware } from "hono/factory";
import { streamSSE } from "hono/streaming";
import { aiErrorResponse, assertDailyTurnCap, availableProviders, preferProvider, readAiSettings, readTutorUsage } from "../ai";
import type { AuthUser } from "../auth";
import { apiError, parseJson } from "../http";
import { logInfo } from "../logger";
import { gradeComponentAnswer, modelJudge } from "./grading";
import { accountLibrary } from "./library";
import { runAgentTurn, type TurnEmit } from "./loop";
import { speakStoredText } from "./onDemandSpeech";
import { LANGUAGE_NAMES } from "./prompt";
import { readTutorProfile, updateTutorProfile, writeTutorNotes } from "./profile";
import { recordComponentAnswer } from "./recording";
import {
  createConversation, decodeCursor, findToolCallMessage, hasAwaitingMessage, insertMessageStatement, lastMessageAt, listConversations,
  presentConversation, presentMessage, readConversation, readMessage, readMessagePage, replacePart, setArchived, setConversationProvider, setConversationTitle, storeAnswer,
  touchConversationStatement,
} from "./store";
import { applyConfirmation } from "./tools";

// The AI tutor routes (docs/ai-tutor.md#api), mounted at `/api/ai` after the session middleware. Every route needs a signed-in
// account that finished setup; every conversation, message, and tool call ID is resolved under that account, so another
// account's IDs are `404`. Turns stream as server-sent events (see the contracts' `tutorStreamEventSchema`).

type TutorEnvironment = { Bindings: Env; Variables: { user: AuthUser | null } };
type TutorContext = Context<TutorEnvironment>;

const requireTutorAccess = createMiddleware<TutorEnvironment>(async (context, next) => {
  const user = context.get("user");
  if (!user) return apiError(context, 401, "AUTH_REQUIRED", "Sign in to continue.");
  if (user.mustChangePassword) return apiError(context, 403, "PASSWORD_CHANGE_REQUIRED", "Change your password to continue.");
  if (!user.onboardingComplete) return apiError(context, 403, "ONBOARDING_REQUIRED", "Finish setting up your account to continue.");
  await next();
});

export const tutorRoutes = new Hono<TutorEnvironment>();
tutorRoutes.use("*", requireTutorAccess);

const userIdOf = (context: TutorContext) => context.get("user")!.id;
const conversationMissing = (context: TutorContext) => apiError(context, 404, "CONVERSATION_NOT_FOUND", "This conversation is not available.");
async function ownConversation(context: TutorContext) {
  const id = context.req.param("conversationId") ?? "";
  const row = await readConversation(context.env.DB, userIdOf(context), id);
  return row ? { row } : { error: conversationMissing(context) };
}

// ---- Conversations ----

tutorRoutes.get("/conversations", async (context) => {
  const parsed = tutorConversationsQuerySchema.safeParse(context.req.query());
  const cursor = parsed.success && parsed.data.cursor ? decodeCursor(parsed.data.cursor) : null;
  if (!parsed.success || (parsed.data.cursor && !cursor)) return apiError(context, 400, "INVALID_CURSOR", "The conversation list cursor is invalid.");
  return context.json(tutorConversationPageSchema.parse(await listConversations(context.env.DB, userIdOf(context), parsed.data.archived, cursor)));
});

tutorRoutes.post("/conversations", async (context) => {
  const row = await createConversation(context.env.DB, userIdOf(context));
  return context.json(tutorConversationResponseSchema.parse({ conversation: presentConversation(row) }), 201);
});

tutorRoutes.get("/conversations/:conversationId", async (context) => {
  const found = await ownConversation(context); if ("error" in found) return found.error;
  return context.json(tutorConversationResponseSchema.parse({ conversation: presentConversation(found.row) }));
});

// Chooses the conversation's model for its next turns (`null` goes back to the default order), renames it, or both. Only a
// provider the learner could pick from `GET /models` is accepted. A title the learner sets is theirs: the tutor no longer renames
// the conversation. Archived conversations can be renamed.
tutorRoutes.patch("/conversations/:conversationId", async (context) => {
  const found = await ownConversation(context); if ("error" in found) return found.error;
  const parsed = await parseJson(context, updateTutorConversationRequestSchema, 1_024); if ("response" in parsed) return parsed.response;
  const db = context.env.DB; const userId = userIdOf(context);
  const { provider, title } = parsed.data;
  if (provider && !availableProviders(context.env, await readAiSettings(db)).some((item) => item.provider === provider)) {
    return apiError(context, 409, "AI_PROVIDER_UNAVAILABLE", "This model is not available right now.");
  }
  if (title !== undefined) await setConversationTitle(db, userId, found.row.id, title, "user");
  const row = provider !== undefined ? await setConversationProvider(db, userId, found.row.id, provider) : await readConversation(db, userId, found.row.id);
  return context.json(tutorConversationResponseSchema.parse({ conversation: presentConversation(row!) }));
});

// The learner's own token counts and turns (docs/ai-tutor.md#usage-box); a conversation of another account is `404`.
tutorRoutes.get("/usage", async (context) => {
  const parsed = tutorUsageQuerySchema.safeParse(context.req.query());
  if (!parsed.success) return apiError(context, 400, "VALIDATION_ERROR", "The usage query is invalid.");
  const db = context.env.DB; const userId = userIdOf(context);
  const conversationId = parsed.data.conversationId ?? null;
  if (conversationId && !(await readConversation(db, userId, conversationId))) return conversationMissing(context);
  const [usage, settings] = await Promise.all([readTutorUsage(db, userId, conversationId), readAiSettings(db)]);
  return context.json(tutorUsageResponseSchema.parse({ today: { ...usage.today, turnCap: settings.dailyTurnCap }, conversation: usage.conversation }));
});

tutorRoutes.get("/models", async (context) =>
  context.json(tutorModelsResponseSchema.parse({ items: availableProviders(context.env, await readAiSettings(context.env.DB)) })));

for (const [path, archived] of [["archive", true], ["unarchive", false]] as const) {
  tutorRoutes.post(`/conversations/:conversationId/${path}`, async (context) => {
    const found = await ownConversation(context); if ("error" in found) return found.error;
    const row = await setArchived(context.env.DB, userIdOf(context), found.row.id, archived);
    return context.json(tutorConversationResponseSchema.parse({ conversation: presentConversation(row!) }));
  });
}

tutorRoutes.get("/conversations/:conversationId/messages", async (context) => {
  const found = await ownConversation(context); if ("error" in found) return found.error;
  const parsed = tutorMessagesQuerySchema.safeParse(context.req.query());
  const cursor = parsed.success && parsed.data.cursor ? decodeCursor(parsed.data.cursor) : null;
  if (!parsed.success || (parsed.data.cursor && !cursor)) return apiError(context, 400, "INVALID_CURSOR", "The message cursor is invalid.");
  return context.json(tutorMessagePageSchema.parse(await readMessagePage(context.env.DB, userIdOf(context), found.row.id, cursor)));
});

// ---- Turns ----

// Streams `run`'s events. A client that goes away does not stop the turn: writes are ignored and the turn is still stored.
function streamTurn(context: TutorContext, run: (emit: TurnEmit) => Promise<void>) {
  return streamSSE(context, async (stream) => {
    let open = true;
    stream.onAbort(() => { open = false; });
    const emit: TurnEmit = async (event: TutorStreamEvent) => {
      if (!open) return;
      try { await stream.writeSSE({ event: event.type, data: JSON.stringify(event) }); } catch { open = false; }
    };
    await run(emit);
  }, async (error) => {
    logInfo("ai.turn_stream_failed", { reason: error.name });
  });
}

const turnOptions = (context: TutorContext, conversationId: string) => ({
  env: context.env, db: context.env.DB, userId: userIdOf(context), conversationId,
});

tutorRoutes.post("/conversations/:conversationId/messages", async (context) => {
  const found = await ownConversation(context); if ("error" in found) return found.error;
  const db = context.env.DB; const userId = userIdOf(context);
  if (found.row.archivedAt !== null) return apiError(context, 409, "CONVERSATION_ARCHIVED", "Unarchive this conversation to continue it.");
  const parsed = await parseJson(context, tutorMessageRequestSchema, 32_768); if ("response" in parsed) return parsed.response;
  if (await hasAwaitingMessage(db, userId, found.row.id)) return apiError(context, 409, "TURN_IN_PROGRESS", "Answer the open question or card first.");
  const settings = preferProvider(await readAiSettings(db), found.row.provider);
  try {
    await assertDailyTurnCap(db, userId, settings);
  } catch (error) {
    const response = aiErrorResponse(context, error); if (response) return response;
    throw error;
  }
  const createdAt = Math.max(Date.now(), (await lastMessageAt(db, found.row.id)) + 1);
  const message = {
    id: crypto.randomUUID(), conversationId: found.row.id, role: "user" as const, status: "complete" as const,
    parts: [{ type: "text" as const, text: parsed.data.text, spans: [] }], provider: null, model: null, createdAt,
  };
  await db.batch([insertMessageStatement(db, userId, message), touchConversationStatement(db, userId, found.row.id, createdAt, conversationTitle(parsed.data.text))]);
  return streamTurn(context, async (emit) => {
    await emit({ type: "user_message", message: presentMessage(message) });
    await runAgentTurn({ ...turnOptions(context, found.row.id), settings, emit, turnStart: true });
  });
});

// Answers a component (or skips it) or a confirmation card once. Grading, the open-kind verdict, and confirmed writes happen here;
// the stored answer is claimed with a conditional update, so a second answer is `409 TOOL_CALL_ANSWERED`. A component of a
// practice set whose other components still wait is stored and answered without resuming the model; the set's last answer
// resumes the turn, so the model receives every grade of the set together.
tutorRoutes.post("/conversations/:conversationId/tool-calls/:toolCallId/respond", async (context) => {
  const found = await ownConversation(context); if ("error" in found) return found.error;
  const db = context.env.DB; const userId = userIdOf(context); const conversationId = found.row.id;
  if (found.row.archivedAt !== null) return apiError(context, 409, "CONVERSATION_ARCHIVED", "Unarchive this conversation to continue it.");
  const toolCallId = context.req.param("toolCallId");
  const message = await findToolCallMessage(db, userId, conversationId, toolCallId);
  const part = message?.parts.find((entry) => (entry.type === "component" || entry.type === "confirmation") && entry.toolCallId === toolCallId);
  if (!message || !part || (part.type !== "component" && part.type !== "confirmation")) return apiError(context, 404, "TOOL_CALL_NOT_FOUND", "This question is not available.");
  const answered = () => apiError(context, 409, "TOOL_CALL_ANSWERED", "This has already been answered.");
  if (part.answeredAt !== null || message.status !== "awaiting_user") return answered();
  const parsed = await parseJson(context, tutorRespondRequestSchema, 32_768); if ("response" in parsed) return parsed.response;
  const invalid = () => apiError(context, 400, "ANSWER_INVALID", "This answer does not fit the question.");
  if (parsed.data.type !== part.type) return invalid();
  const settings = preferProvider(await readAiSettings(db), found.row.provider);
  // Only the answer that closes the set resumes the model, so only it is held to the daily turn cap.
  const openParts = message.parts.filter((entry) => (entry.type === "component" || entry.type === "confirmation") && entry.answeredAt === null).length;
  if (openParts <= 1) {
    try {
      await assertDailyTurnCap(db, userId, settings);
    } catch (error) {
      const response = aiErrorResponse(context, error); if (response) return response;
      throw error;
    }
  }
  const now = Date.now();
  const toolContext = { db, userId, conversationId, now: Date.now, random: Math.random };
  let answeredPart: TutorStoredPart;
  let stored: { stored: boolean; waiting: boolean };
  if (part.type === "component" && "skip" in parsed.data) {
    // A skip is the component's one answer: nothing is graded or recorded, and the model reads that the learner skipped it.
    answeredPart = { ...part, answer: null, grade: null, answeredAt: now, skipped: true };
    stored = await storeAnswer(db, userId, message, answeredPart);
    if (!stored.stored) return answered();
  } else if (part.type === "component" && "answer" in parsed.data) {
    const [profile, library] = await Promise.all([readTutorProfile(db, userId), accountLibrary(db, userId)]);
    const judge = modelJudge({
      env: context.env, db, settings, userId, conversationId, language: library?.language ?? "nl",
      explainIn: LANGUAGE_NAMES[profile.nativeLanguage] ?? "English",
    });
    const graded = await gradeComponentAnswer(part.component, parsed.data.answer, part.view, judge);
    if (!graded.ok) return invalid();
    answeredPart = { ...part, answer: parsed.data.answer, grade: graded.grade, answeredAt: now };
    stored = await storeAnswer(db, userId, message, answeredPart);
    if (!stored.stored) return answered();
    await recordComponentAnswer(db, { userId, source: "ai_chat", practiceId: toolCallId, conversationId, component: part.component, answer: parsed.data.answer, grade: graded.grade, now });
  } else if (part.type === "confirmation" && parsed.data.type === "confirmation") {
    const claimed: TutorStoredPart = { ...part, answer: parsed.data.confirmed ? "confirmed" : "cancelled", answeredAt: now };
    stored = await storeAnswer(db, userId, message, claimed);
    if (!stored.stored) return answered();
    answeredPart = claimed;
    if (parsed.data.confirmed) {
      const outcome = await applyConfirmation(toolContext, part.summary.action, part.arguments);
      answeredPart = { ...claimed, outcome: { ok: outcome.ok, error: outcome.error } };
      await replacePart(db, userId, message.id, answeredPart);
    }
  } else {
    return invalid();
  }
  const publicPart = toPublicPart(answeredPart);
  const waiting = stored.waiting;
  return streamTurn(context, async (emit) => {
    if (publicPart.type === "component" || publicPart.type === "confirmation") await emit({ type: "answered", messageId: message.id, part: publicPart });
    if (waiting) {
      // Other questions of the set still wait: the message is sent back as stored, and the turn resumes after the last one.
      const current = await readMessage(db, userId, conversationId, message.id);
      if (current) await emit({ type: "done", message: presentMessage(current) });
      return;
    }
    await runAgentTurn({ ...turnOptions(context, conversationId), settings, emit, turnStart: true });
  });
});

// Answers every open question of one message's practice set at once: the learner fills the set in the chat's question dock and
// sends it together. Every answer is graded before any is stored, so an answer that does not fit its question changes nothing;
// then all are stored, attempts recorded, and the turn resumes once with every grade (or waits on an open confirmation card).
tutorRoutes.post("/conversations/:conversationId/messages/:messageId/answers", async (context) => {
  const found = await ownConversation(context); if ("error" in found) return found.error;
  const db = context.env.DB; const userId = userIdOf(context); const conversationId = found.row.id;
  if (found.row.archivedAt !== null) return apiError(context, 409, "CONVERSATION_ARCHIVED", "Unarchive this conversation to continue it.");
  const message = await readMessage(db, userId, conversationId, context.req.param("messageId"));
  if (!message || message.role !== "assistant") return apiError(context, 404, "MESSAGE_NOT_FOUND", "This message is not available.");
  const parsed = await parseJson(context, tutorSetAnswersRequestSchema, 65_536); if ("response" in parsed) return parsed.response;
  const answered = () => apiError(context, 409, "TOOL_CALL_ANSWERED", "This has already been answered.");
  const invalid = () => apiError(context, 400, "ANSWER_INVALID", "This answer does not fit the question.");
  const components = message.parts.flatMap((part) => part.type === "component" ? [part] : []);
  const open = components.filter((part) => part.answeredAt === null);
  for (const entry of parsed.data.answers) {
    const part = components.find((candidate) => candidate.toolCallId === entry.toolCallId);
    if (!part) return apiError(context, 404, "TOOL_CALL_NOT_FOUND", "This question is not available.");
    if (part.answeredAt !== null) return answered();
  }
  if (message.status !== "awaiting_user") return answered();
  if (open.some((part) => !parsed.data.answers.some((entry) => entry.toolCallId === part.toolCallId))) {
    return apiError(context, 400, "ANSWERS_INCOMPLETE", "Answer or skip every question of the set.");
  }
  const settings = preferProvider(await readAiSettings(db), found.row.provider);
  // The set resumes the model unless a confirmation card of the message still waits, so it is held to the daily turn cap.
  const cardsOpen = message.parts.some((part) => part.type === "confirmation" && part.answeredAt === null);
  if (!cardsOpen) {
    try {
      await assertDailyTurnCap(db, userId, settings);
    } catch (error) {
      const response = aiErrorResponse(context, error); if (response) return response;
      throw error;
    }
  }
  const [profile, library] = await Promise.all([readTutorProfile(db, userId), accountLibrary(db, userId)]);
  const judge = modelJudge({ env: context.env, db, settings, userId, conversationId, language: library?.language ?? "nl", explainIn: LANGUAGE_NAMES[profile.nativeLanguage] ?? "English" });
  const now = Date.now();
  const results: Array<{ part: Extract<TutorStoredPart, { type: "component" }>; record: boolean }> = [];
  for (const entry of parsed.data.answers) {
    const part = open.find((candidate) => candidate.toolCallId === entry.toolCallId)!;
    if ("skip" in entry) { results.push({ part: { ...part, answer: null, grade: null, answeredAt: now, skipped: true }, record: false }); continue; }
    const graded = await gradeComponentAnswer(part.component, entry.answer, part.view, judge);
    if (!graded.ok) return invalid();
    results.push({ part: { ...part, answer: entry.answer, grade: graded.grade, answeredAt: now }, record: true });
  }
  let waiting = false;
  for (const result of results) {
    const stored = await storeAnswer(db, userId, message, result.part);
    if (!stored.stored) return answered();
    waiting = stored.waiting;
    if (result.record && result.part.answer && result.part.grade) {
      await recordComponentAnswer(db, { userId, source: "ai_chat", practiceId: result.part.toolCallId, conversationId, component: result.part.component, answer: result.part.answer, grade: result.part.grade, now });
    }
  }
  return streamTurn(context, async (emit) => {
    for (const result of results) {
      const publicPart = toPublicPart(result.part);
      if (publicPart.type === "component") await emit({ type: "answered", messageId: message.id, part: publicPart });
    }
    if (waiting) {
      const current = await readMessage(db, userId, conversationId, message.id);
      if (current) await emit({ type: "done", message: presentMessage(current) });
      return;
    }
    await runAgentTurn({ ...turnOptions(context, conversationId), settings, emit, turnStart: true });
  });
});

// The learner declines an entire unanswered practice set and explains what they wanted instead. Preserve the reason as the
// failed result for each ask_* call, add their text as a user turn, and only then resume the agent.
tutorRoutes.post("/conversations/:conversationId/messages/:messageId/skip-set", async (context) => {
  const found = await ownConversation(context); if ("error" in found) return found.error;
  const db = context.env.DB; const userId = userIdOf(context); const conversationId = found.row.id;
  if (found.row.archivedAt !== null) return apiError(context, 409, "CONVERSATION_ARCHIVED", "Unarchive this conversation to continue it.");
  const message = await readMessage(db, userId, conversationId, context.req.param("messageId"));
  if (!message || message.role !== "assistant") return apiError(context, 404, "MESSAGE_NOT_FOUND", "This message is not available.");
  const parsed = await parseJson(context, tutorSkipSetRequestSchema, 32_768); if ("response" in parsed) return parsed.response;
  const all = message.parts.flatMap((part) => part.type === "component" ? [part] : []);
  const open = all.filter((part) => part.answeredAt === null);
  if (message.status !== "awaiting_user" || !open.length || open.length !== all.length) return apiError(context, 409, "TOOL_CALL_ANSWERED", "This practice set can no longer be skipped as a whole.");
  const settings = preferProvider(await readAiSettings(db), found.row.provider);
  try { await assertDailyTurnCap(db, userId, settings); } catch (error) {
    const response = aiErrorResponse(context, error); if (response) return response; throw error;
  }
  const now = Date.now();
  for (const part of open) {
    const stored = await storeAnswer(db, userId, message, { ...part, answer: null, grade: null, answeredAt: now, skipped: true, skipReason: parsed.data.reason });
    if (!stored.stored) return apiError(context, 409, "TOOL_CALL_ANSWERED", "This practice set has already been answered.");
  }
  const createdAt = Math.max(Date.now(), (await lastMessageAt(db, conversationId)) + 1);
  const userMessage = { id: crypto.randomUUID(), conversationId, role: "user" as const, status: "complete" as const,
    parts: [{ type: "text" as const, text: parsed.data.reason, spans: [] }], provider: null, model: null, createdAt };
  await db.batch([insertMessageStatement(db, userId, userMessage), touchConversationStatement(db, userId, conversationId, createdAt)]);
  return streamTurn(context, async (emit) => {
    await emit({ type: "user_message", message: presentMessage(userMessage) });
    await runAgentTurn({ ...turnOptions(context, conversationId), settings, emit, turnStart: true });
  });
});

// ---- On-demand speech ----

// Speaks stored text only: a target-language span of one of the account's assistant messages, or a Say it or Dictation
// sentence, read by ID. The request never carries text (docs/speech.md#on-demand-audio).
tutorRoutes.post("/conversations/:conversationId/messages/:messageId/speech", async (context) => {
  const found = await ownConversation(context); if ("error" in found) return found.error;
  const db = context.env.DB; const userId = userIdOf(context);
  const message = await readMessage(db, userId, found.row.id, context.req.param("messageId"));
  if (!message || message.role !== "assistant") return apiError(context, 404, "MESSAGE_NOT_FOUND", "This message is not available.");
  const parsed = await parseJson(context, tutorSpeechRequestSchema, 1_024); if ("response" in parsed) return parsed.response;
  let text: string | undefined;
  if ("spanIndex" in parsed.data) text = messageSpanTexts(message.parts)[parsed.data.spanIndex];
  else {
    const { toolCallId } = parsed.data;
    const component = message.parts.find((part) => part.type === "component" && part.toolCallId === toolCallId);
    if (component?.type === "component" && (component.component.kind === "say_it" || component.component.kind === "dictation")) text = component.component.payload.sentence;
  }
  if (text === undefined) return apiError(context, 404, "SPAN_NOT_FOUND", "There is nothing to play here.");
  const library = await accountLibrary(db, userId);
  return speakStoredText(context, context.env, { userId, text, language: library?.language ?? null, surface: "ai_message" });
});

// ---- Tutor profile ----

tutorRoutes.get("/profile", async (context) =>
  context.json(tutorProfileResponseSchema.parse({ profile: await readTutorProfile(context.env.DB, userIdOf(context)) })));

tutorRoutes.put("/profile", async (context) => {
  const parsed = await parseJson(context, updateTutorProfileRequestSchema, 8_192); if ("response" in parsed) return parsed.response;
  return context.json(tutorProfileResponseSchema.parse({ profile: await updateTutorProfile(context.env.DB, userIdOf(context), parsed.data) }));
});

tutorRoutes.delete("/profile/notes", async (context) =>
  context.json(tutorProfileResponseSchema.parse({ profile: await writeTutorNotes(context.env.DB, userIdOf(context), null) })));
