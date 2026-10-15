import { speechNarrator } from "@wordinator/contracts";
import { spokenText } from "@wordinator/contracts/speech";
import {
  conversationTitle, messageSpanTexts, toPublicPart, TUTOR_SPAN_MAX, tutorConversationPageSchema, tutorConversationResponseSchema,
  tutorConversationsQuerySchema, tutorMessagePageSchema, tutorMessageRequestSchema, tutorMessagesQuerySchema, tutorProfileResponseSchema,
  tutorRespondRequestSchema, tutorSpeechRequestSchema, updateTutorProfileRequestSchema, type TutorStoredPart, type TutorStreamEvent,
} from "@wordinator/contracts/tutor";
import { Hono, type Context } from "hono";
import { createMiddleware } from "hono/factory";
import { streamSSE } from "hono/streaming";
import { aiErrorResponse, assertDailySpeechCap, assertDailyTurnCap, readAiSettings, recordSpeechUsage } from "../ai";
import type { AuthUser } from "../auth";
import { apiError, parseJson } from "../http";
import { logInfo } from "../logger";
import { azureSynthesizer, clipUrl, hashSpeechItems, onDemandClip } from "../speech";
import { gradeComponentAnswer, modelJudge } from "./grading";
import { accountLibrary } from "./library";
import { runAgentTurn, type TurnEmit } from "./loop";
import { LANGUAGE_NAMES } from "./prompt";
import { readTutorProfile, updateTutorProfile, writeTutorNotes } from "./profile";
import { recordComponentAnswer } from "./recording";
import {
  createConversation, decodeCursor, findToolCallMessage, hasAwaitingMessage, insertMessageStatement, lastMessageAt, listConversations,
  presentConversation, presentMessage, readConversation, readMessage, readMessagePage, setArchived, storeAnswer, touchConversationStatement,
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
  const settings = await readAiSettings(db);
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

// Answers a component or a confirmation card once, then resumes the turn. Grading, the open-kind verdict, and confirmed writes
// happen here; the stored answer is claimed with a conditional update, so a second answer is `409 TOOL_CALL_ANSWERED`.
tutorRoutes.post("/conversations/:conversationId/tool-calls/:toolCallId/respond", async (context) => {
  const found = await ownConversation(context); if ("error" in found) return found.error;
  const db = context.env.DB; const userId = userIdOf(context); const conversationId = found.row.id;
  if (found.row.archivedAt !== null) return apiError(context, 409, "CONVERSATION_ARCHIVED", "Unarchive this conversation to continue it.");
  const toolCallId = context.req.param("toolCallId");
  const message = await findToolCallMessage(db, userId, conversationId, toolCallId);
  const index = message?.parts.findIndex((part) => (part.type === "component" || part.type === "confirmation") && part.toolCallId === toolCallId) ?? -1;
  const part = message?.parts[index];
  if (!message || !part || (part.type !== "component" && part.type !== "confirmation")) return apiError(context, 404, "TOOL_CALL_NOT_FOUND", "This question is not available.");
  const answered = () => apiError(context, 409, "TOOL_CALL_ANSWERED", "This has already been answered.");
  if (part.answeredAt !== null || message.status !== "awaiting_user") return answered();
  const parsed = await parseJson(context, tutorRespondRequestSchema, 32_768); if ("response" in parsed) return parsed.response;
  const invalid = () => apiError(context, 400, "ANSWER_INVALID", "This answer does not fit the question.");
  if (parsed.data.type !== part.type) return invalid();
  const settings = await readAiSettings(db);
  try {
    await assertDailyTurnCap(db, userId, settings);
  } catch (error) {
    const response = aiErrorResponse(context, error); if (response) return response;
    throw error;
  }
  const now = Date.now();
  const toolContext = { db, userId, conversationId, now: Date.now, random: Math.random };
  let answeredPart: TutorStoredPart;
  if (part.type === "component" && parsed.data.type === "component") {
    const [profile, library] = await Promise.all([readTutorProfile(db, userId), accountLibrary(db, userId)]);
    const judge = modelJudge({
      env: context.env, db, settings, userId, conversationId, language: library?.language ?? "nl",
      explainIn: LANGUAGE_NAMES[profile.nativeLanguage] ?? "English",
    });
    const graded = await gradeComponentAnswer(part.component, parsed.data.answer, part.view, judge);
    if (!graded.ok) return invalid();
    answeredPart = { ...part, answer: parsed.data.answer, grade: graded.grade, answeredAt: now };
    const parts = message.parts.map((item, position) => position === index ? answeredPart : item);
    if (!(await storeAnswer(db, userId, message, parts, toolCallId))) return answered();
    await recordComponentAnswer(db, { userId, source: "ai_chat", practiceId: toolCallId, conversationId, component: part.component, answer: parsed.data.answer, grade: graded.grade, now });
  } else if (part.type === "confirmation" && parsed.data.type === "confirmation") {
    const claimed: TutorStoredPart = { ...part, answer: parsed.data.confirmed ? "confirmed" : "cancelled", answeredAt: now };
    if (!(await storeAnswer(db, userId, message, message.parts.map((item, position) => position === index ? claimed : item), toolCallId))) return answered();
    answeredPart = claimed;
    if (parsed.data.confirmed) {
      const outcome = await applyConfirmation(toolContext, part.summary.action, part.arguments);
      answeredPart = { ...claimed, outcome: { ok: outcome.ok, error: outcome.error } };
      await db.prepare("UPDATE ai_messages SET parts = ? WHERE id = ? AND user_id = ?")
        .bind(JSON.stringify(message.parts.map((item, position) => position === index ? answeredPart : item)), message.id, userId).run();
    }
  } else {
    return invalid();
  }
  const publicPart = toPublicPart(answeredPart);
  return streamTurn(context, async (emit) => {
    if (publicPart.type === "component" || publicPart.type === "confirmation") await emit({ type: "answered", messageId: message.id, part: publicPart });
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
  if (text.length > TUTOR_SPAN_MAX) return apiError(context, 400, "SPAN_TOO_LONG", "This text is too long to play.");
  const { AZURE_SPEECH_KEY: key, AZURE_SPEECH_REGION: region } = context.env;
  const library = await accountLibrary(db, userId);
  if (!key || !region || !library) return apiError(context, 503, "SPEECH_UNAVAILABLE", "Audio is not available.");
  const spoken = spokenText(text);
  if (!spoken) return apiError(context, 404, "SPAN_NOT_FOUND", "There is nothing to play here.");
  const [item] = await hashSpeechItems([{ key: "tutor", voice: speechNarrator(library.language), text: spoken, ipa: null }]);
  const settings = await readAiSettings(db);
  try {
    await assertDailySpeechCap(db, userId, settings, spoken.length);
  } catch (error) {
    const response = aiErrorResponse(context, error); if (response) return response;
    throw error;
  }
  const clip = await onDemandClip(context.env, item!, azureSynthesizer(key, region));
  if (clip === "pending") return context.json({ status: "pending" as const }, 202);
  if (clip === "failed") return apiError(context, 503, "SPEECH_FAILED", "The audio could not be made. Try again later.");
  await recordSpeechUsage(db, { userId, surface: "ai_message", clipHash: item!.hash, characters: spoken.length, cached: clip === "cached" });
  const base = context.env.PUBLIC_MEDIA_BASE_URL.replace(/\/$/, "");
  return context.json({ url: clipUrl((key) => `${base}/${key.split("/").map(encodeURIComponent).join("/")}`, item!.hash) });
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
