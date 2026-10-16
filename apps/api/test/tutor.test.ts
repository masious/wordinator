import { env } from "cloudflare:test";
import { speechNarrator } from "@wordinator/contracts";
import { DEFAULT_AI_SETTINGS } from "@wordinator/contracts/ai";
import { spokenText } from "@wordinator/contracts/speech";
import { tutorMessagePageSchema, type TutorStreamEvent } from "@wordinator/contracts/tutor";
import { beforeEach, describe, expect, it } from "vitest";
import { writeAiSettings } from "../src/ai";
import { hashSpeechItems } from "../src/speech";
import { errorCode, resetDatabase, seedUser, signIn } from "./courseApi";
import { call, callTool, modelMessages, newConversation, readEvents, say, scriptedAi, seedLibrary, toolMessages } from "./tutorApi";

// The AI tutor API (C14g, docs/ai-tutor.md#api) against a stubbed Workers AI binding.

beforeEach(resetDatabase);

const types = (events: TutorStreamEvent[]) => events.map((event) => event.type);
const ofType = <T extends TutorStreamEvent["type"]>(events: TutorStreamEvent[], type: T) =>
  events.filter((event): event is Extract<TutorStreamEvent, { type: T }> => event.type === type);
const count = async (sql: string, ...values: unknown[]) => (await env.DB.prepare(sql).bind(...values).first<{ n: number }>())!.n;
const messagesOf = async (cookie: string, conversationId: string) =>
  tutorMessagePageSchema.parse(await (await call("GET", `/api/ai/conversations/${conversationId}/messages`, cookie)).json());

describe("access", () => {
  it("refuses anonymous requests and unfinished setup on every route", async () => {
    const id = crypto.randomUUID();
    const routes: Array<[string, string, unknown?]> = [
      ["GET", "/api/ai/conversations"], ["POST", "/api/ai/conversations"], ["GET", `/api/ai/conversations/${id}`],
      ["POST", `/api/ai/conversations/${id}/archive`], ["POST", `/api/ai/conversations/${id}/unarchive`],
      ["GET", `/api/ai/conversations/${id}/messages`], ["POST", `/api/ai/conversations/${id}/messages`, { text: "Hoi" }],
      ["POST", `/api/ai/conversations/${id}/tool-calls/${id}/respond`, { type: "confirmation", confirmed: true }],
      ["POST", `/api/ai/conversations/${id}/messages/${id}/speech`, { spanIndex: 0 }],
      ["GET", "/api/ai/profile"], ["PUT", "/api/ai/profile", { nativeLanguage: "en", replyLanguage: "native", goals: null }], ["DELETE", "/api/ai/profile/notes"],
    ];
    const newcomerId = await seedUser("newcomer");
    await env.DB.prepare("UPDATE users SET display_name = 'New learner' WHERE id = ?").bind(newcomerId).run();
    const newcomer = await signIn("newcomer");
    for (const [method, path, body] of routes) {
      const anonymous = await call(method, path, null, body);
      expect(anonymous.status, `${method} ${path}`).toBe(401);
      const unfinished = await call(method, path, newcomer, body);
      expect(unfinished.status, `${method} ${path}`).toBe(403);
      expect(await errorCode(unfinished)).toBe("ONBOARDING_REQUIRED");
    }
  });

  it("answers 404 for another account's conversation, message, and tool call", async () => {
    const { learner, rival } = await seedLibrary();
    const ai = scriptedAi([callTool("ask_choice", { question: "Wat is een huis?", options: ["house", "mouse", "horse"], correct: 0 })]);
    const conversationId = await newConversation(learner);
    const events = await readEvents(await call("POST", `/api/ai/conversations/${conversationId}/messages`, learner, { text: "Quiz me" }, { AI: ai.binding }));
    const toolCallId = ofType(events, "component")[0]!.part.toolCallId;
    const messageId = ofType(events, "done")[0]!.message.id;
    const base = `/api/ai/conversations/${conversationId}`;
    for (const [method, path, body] of [
      ["GET", base], ["GET", `${base}/messages`], ["POST", `${base}/archive`], ["POST", `${base}/unarchive`],
      ["POST", `${base}/messages`, { text: "Hi" }], ["POST", `${base}/tool-calls/${toolCallId}/respond`, { type: "component", answer: { kind: "choice", choice: 0 } }],
      ["POST", `${base}/messages/${messageId}/speech`, { spanIndex: 0 }],
    ] as Array<[string, string, unknown?]>) {
      const response = await call(method, path, rival, body, { AI: ai.binding });
      expect(response.status, `${method} ${path}`).toBe(404);
      expect(await errorCode(response)).toBe("CONVERSATION_NOT_FOUND");
    }
    // The rival's own conversation cannot reach the learner's tool call or message either.
    const own = await newConversation(rival);
    const respond = await call("POST", `/api/ai/conversations/${own}/tool-calls/${toolCallId}/respond`, rival, { type: "component", answer: { kind: "choice", choice: 0 } });
    expect(await errorCode(respond)).toBe("TOOL_CALL_NOT_FOUND");
    const speech = await call("POST", `/api/ai/conversations/${own}/messages/${messageId}/speech`, rival, { spanIndex: 0 });
    expect(await errorCode(speech)).toBe("MESSAGE_NOT_FOUND");
    expect((await call("GET", "/api/ai/conversations", rival)).status).toBe(200);
    expect(((await (await call("GET", "/api/ai/conversations", rival)).json()) as { items: Array<{ id: string }> }).items.map((item) => item.id)).toEqual([own]);
  });
});

describe("conversations", () => {
  it("lists, archives, and unarchives; an archived conversation is read but not continued", async () => {
    const { learner } = await seedLibrary();
    const first = await newConversation(learner);
    await env.DB.prepare("UPDATE ai_conversations SET created_at = created_at - 1000, updated_at = updated_at - 1000 WHERE id = ?").bind(first).run();
    const second = await newConversation(learner);
    const list = async (archived: boolean) => ((await (await call("GET", `/api/ai/conversations?archived=${archived}`, learner)).json()) as { items: Array<{ id: string; title: string }> }).items;
    expect((await list(false)).map((item) => item.id)).toEqual([second, first]);

    const ai = scriptedAi([say("Hallo!")]);
    await readEvents(await call("POST", `/api/ai/conversations/${first}/messages`, learner, { text: "  Teach me   the\nnext lesson please  " }, { AI: ai.binding }));
    const titled = await list(false);
    expect(titled.map((item) => item.id)).toEqual([first, second]);
    expect(titled[0]!.title).toBe("Teach me the next lesson please");

    const archived = await call("POST", `/api/ai/conversations/${first}/archive`, learner);
    expect(((await archived.json()) as { conversation: { archivedAt: number | null } }).conversation.archivedAt).toEqual(expect.any(Number));
    expect((await list(false)).map((item) => item.id)).toEqual([second]);
    expect((await list(true)).map((item) => item.id)).toEqual([first]);
    expect((await messagesOf(learner, first)).items).toHaveLength(2);
    const refused = await call("POST", `/api/ai/conversations/${first}/messages`, learner, { text: "More" }, { AI: ai.binding });
    expect(refused.status).toBe(409);
    expect(await errorCode(refused)).toBe("CONVERSATION_ARCHIVED");

    await call("POST", `/api/ai/conversations/${first}/unarchive`, learner);
    expect((await list(true))).toEqual([]);
    expect((await list(false)).map((item) => item.id)).toEqual([first, second]);
    expect(await count("SELECT COUNT(*) AS n FROM ai_conversations")).toBe(2);
  });

  it("pages messages newest first by cursor", async () => {
    const { learner } = await seedLibrary();
    const conversationId = await newConversation(learner);
    const ai = scriptedAi(Array.from({ length: 16 }, (_, index) => say(`Antwoord ${index}`)));
    for (let index = 0; index < 16; index += 1) {
      await readEvents(await call("POST", `/api/ai/conversations/${conversationId}/messages`, learner, { text: `Vraag ${index}` }, { AI: ai.binding }));
    }
    const page = await messagesOf(learner, conversationId);
    expect(page.items).toHaveLength(30);
    expect(page.items[0]!.parts[0]).toMatchObject({ type: "text", text: "Antwoord 15" });
    const older = tutorMessagePageSchema.parse(await (await call("GET", `/api/ai/conversations/${conversationId}/messages?cursor=${encodeURIComponent(page.nextCursor!)}`, learner)).json());
    expect(older.items.map((item) => item.parts[0])).toEqual([
      { type: "text", text: "Vraag 0", spans: [] }, expect.objectContaining({ text: "Antwoord 0" }),
    ].reverse());
    expect(older.nextCursor).toBeNull();
    expect((await call("GET", `/api/ai/conversations/${conversationId}/messages?cursor=nope`, learner)).status).toBe(400);
  });
});

describe("turns", () => {
  it("refuses at the daily cap before any model call", async () => {
    const { learner } = await seedLibrary();
    await writeAiSettings(env.DB, { ...DEFAULT_AI_SETTINGS, dailyTurnCap: 0 });
    const ai = scriptedAi([say("never")]);
    const conversationId = await newConversation(learner);
    const response = await call("POST", `/api/ai/conversations/${conversationId}/messages`, learner, { text: "Hoi" }, { AI: ai.binding });
    expect(response.status).toBe(429);
    expect(((await response.json()) as { error: { code: string; resetsAt: number } }).error).toMatchObject({ code: "AI_DAILY_LIMIT", resetsAt: expect.any(Number) });
    expect(ai.calls).toHaveLength(0);
    expect(await count("SELECT COUNT(*) AS n FROM ai_messages")).toBe(0);
  });

  it("streams text with marked spans and stores both messages", async () => {
    const { learner } = await seedLibrary();
    const ai = scriptedAi([say("Zeg [[Goedemorgen]]! Dat betekent good morning.")]);
    const conversationId = await newConversation(learner);
    const events = await readEvents(await call("POST", `/api/ai/conversations/${conversationId}/messages`, learner, { text: "Hoe zeg ik good morning?" }, { AI: ai.binding }));
    expect(types(events)).toEqual(["user_message", "start", "text", "done"]);
    expect(ofType(events, "text")[0]!.delta).toContain("[[Goedemorgen]]");
    const done = ofType(events, "done")[0]!.message;
    expect(done).toMatchObject({ role: "assistant", status: "complete", provider: "workers_ai", model: DEFAULT_AI_SETTINGS.providers[1]!.model });
    expect(done.parts).toEqual([{ type: "text", text: "Zeg Goedemorgen! Dat betekent good morning.", spans: [{ start: 4, end: 15 }] }]);
    expect(ofType(events, "start")[0]!.messageId).toBe(done.id);
    const page = await messagesOf(learner, conversationId);
    expect(page.items.map((item) => item.role)).toEqual(["assistant", "user"]);
    expect(page.items[0]).toEqual(done);
    // The system prompt carries the snapshot but never the account's email or username.
    const system = modelMessages(ai.calls[0])[0]!;
    expect(system.role).toBe("system");
    expect(system.content).toContain("Learner snapshot");
    expect(system.content).not.toContain("@example.test");
    expect(await count("SELECT COUNT(*) AS n FROM ai_usage WHERE turn_start = 1")).toBe(1);
  });

  it("runs a read tool as a visible step and gives the model its result as data", async () => {
    const { learner, lessons, words } = await seedLibrary();
    const ai = scriptedAi([callTool("get_lesson", { lessonId: "next" }), say("Let's study Greetings.")]);
    const conversationId = await newConversation(learner);
    const events = await readEvents(await call("POST", `/api/ai/conversations/${conversationId}/messages`, learner, { text: "What next?" }, { AI: ai.binding }));
    expect(types(events)).toEqual(["user_message", "start", "tool_call", "tool_result", "text", "done"]);
    const result = ofType(events, "tool_result")[0]!.part;
    expect(result).toMatchObject({ name: "get_lesson", ok: true, detail: { lessonId: lessons.first.id, lessonTitle: "Greetings", next: true } });
    expect(result).not.toHaveProperty("content");
    const [tool] = toolMessages(ai.calls[1]);
    const data = JSON.parse(tool!.content!) as { lesson: { lessonId: string; blocks: Array<{ type: string; words?: Array<{ wordId: string }> }> } };
    expect(data.lesson.lessonId).toBe(lessons.first.id);
    expect(data.lesson.blocks.find((block) => block.type === "vocabulary")!.words!.map((entry) => entry.wordId)).toEqual([words.huis.id, words.tafel.id]);
    const done = ofType(events, "done")[0]!.message;
    expect(done.parts.map((part) => part.type)).toEqual(["tool_call", "tool_result", "text"]);
    // Every tool is offered; none takes a user ID.
    const tools = ai.calls[0]!.tools as Array<{ type: string; function: { name: string; parameters: { properties?: Record<string, unknown> } } }>;
    expect(tools.map((entry) => entry.function.name)).toEqual(expect.arrayContaining(["search_words", "get_lesson", "ask_fill_in", "complete_lesson", "record_word_review"]));
    for (const entry of tools) expect(Object.keys(entry.function.parameters.properties ?? {})).not.toContain("userId");
    expect(await count("SELECT COUNT(*) AS n FROM ai_usage")).toBe(2);
    expect(await count("SELECT COUNT(*) AS n FROM ai_usage WHERE turn_start = 1")).toBe(1);
  });

  it("never reaches an unpublished lesson, an invisible course, or another library", async () => {
    const { learner, lessons, words } = await seedLibrary();
    const conversationId = await newConversation(learner);
    for (const lesson of [lessons.unpublished, lessons.hidden, lessons.foreign]) {
      const ai = scriptedAi([callTool("get_lesson", { lessonId: lesson.id }), say("Not there.")]);
      const events = await readEvents(await call("POST", `/api/ai/conversations/${conversationId}/messages`, learner, { text: "Read it" }, { AI: ai.binding }));
      expect(ofType(events, "tool_result")[0]!.part).toMatchObject({ ok: false, error: "LESSON_NOT_FOUND" });
      expect(toolMessages(ai.calls[1])[0]!.content).not.toContain(lesson.title);
    }
    // Searching words and completing lessons are scoped the same way.
    const ai = scriptedAi([callTool("search_words", { query: "fiets" }, [{ name: "complete_lesson", args: { lessonId: lessons.foreign.id } }]), say("Nothing.")]);
    const events = await readEvents(await call("POST", `/api/ai/conversations/${conversationId}/messages`, learner, { text: "Search" }, { AI: ai.binding }));
    const results = ofType(events, "tool_result").map((event) => event.part);
    expect(results[0]).toMatchObject({ ok: true, detail: { count: 0 } });
    expect(results[1]).toMatchObject({ ok: false, error: "LESSON_NOT_FOUND" });
    expect(ofType(events, "confirmation")).toHaveLength(0);
    const found = scriptedAi([callTool("search_words", { query: "huis" }), say("Found.")]);
    await readEvents(await call("POST", `/api/ai/conversations/${conversationId}/messages`, learner, { text: "Search" }, { AI: found.binding }));
    expect(toolMessages(found.calls[1]).at(-1)!.content).toContain(words.huis.id);
  });

  it("stores a component, waits, grades the answer once, and records an attempt and reviews", async () => {
    const { learner, learnerId, lessons, words } = await seedLibrary();
    const ai = scriptedAi([
      callTool("ask_fill_in", { prompt: "Ik woon in … .", answers: ["het huis"], lessonId: lessons.first.id, words: [{ lessonId: lessons.first.id, wordId: words.huis.id }] }),
      say("Goed zo!"),
    ]);
    const conversationId = await newConversation(learner);
    const events = await readEvents(await call("POST", `/api/ai/conversations/${conversationId}/messages`, learner, { text: "Quiz me" }, { AI: ai.binding }));
    expect(types(events), JSON.stringify(ofType(events, "tool_result"))).toEqual(["user_message", "start", "tool_call", "component", "done"]);
    const component = ofType(events, "component")[0]!.part;
    expect(component.view).toEqual({ kind: "fill_in", prompt: "Ik woon in … .", blanks: 1, translation: null });
    expect(JSON.stringify(events)).not.toContain("het huis");
    expect(ofType(events, "done")[0]!.message.status).toBe("awaiting_user");

    const blocked = await call("POST", `/api/ai/conversations/${conversationId}/messages`, learner, { text: "Skip" }, { AI: ai.binding });
    expect(blocked.status).toBe(409);
    expect(await errorCode(blocked)).toBe("TURN_IN_PROGRESS");
    const path = `/api/ai/conversations/${conversationId}/tool-calls/${component.toolCallId}/respond`;
    const wrongKind = await call("POST", path, learner, { type: "component", answer: { kind: "choice", choice: 0 } }, { AI: ai.binding });
    expect(await errorCode(wrongKind)).toBe("ANSWER_INVALID");
    expect(await count("SELECT COUNT(*) AS n FROM practice_attempts")).toBe(0);

    const answered = await readEvents(await call("POST", path, learner, { type: "component", answer: { kind: "fill_in", blanks: ["Het huis"] } }, { AI: ai.binding }));
    expect(types(answered)).toEqual(["answered", "start", "text", "done"]);
    expect(ofType(answered, "answered")[0]!.part).toMatchObject({ answer: { kind: "fill_in", blanks: ["Het huis"] }, grade: { correct: true, matched: true, reference: "het huis" } });
    const graded = JSON.parse(toolMessages(ai.calls[1]).at(-1)!.content!) as { status: string; grade: { correct: boolean } };
    expect(graded).toMatchObject({ status: "answered", grade: { correct: true } });

    const attempt = await env.DB.prepare("SELECT * FROM practice_attempts").first<Record<string, unknown>>();
    expect(attempt).toMatchObject({
      user_id: learnerId, lesson_id: lessons.first.id, practice_kind: "ai", practice_id: component.toolCallId, source: "ai_chat",
      conversation_id: conversationId, matched: 1, answer: "Het huis", reference: "het huis",
    });
    const review = await env.DB.prepare("SELECT * FROM word_reviews").first<Record<string, unknown>>();
    expect(review).toMatchObject({ user_id: learnerId, word_id: words.huis.id, source: "ai_chat", result: "got", direction: "produce", conversation_id: conversationId });
    expect(await count("SELECT COUNT(*) AS n FROM word_memory WHERE user_id = ?", learnerId)).toBe(1);

    const again = await call("POST", path, learner, { type: "component", answer: { kind: "fill_in", blanks: ["het huis"] } }, { AI: ai.binding });
    expect(again.status).toBe(409);
    expect(await errorCode(again)).toBe("TOOL_CALL_ANSWERED");
    expect(await count("SELECT COUNT(*) AS n FROM practice_attempts")).toBe(1);
    expect(await count("SELECT COUNT(*) AS n FROM ai_usage WHERE turn_start = 1")).toBe(2);
    const stored = (await messagesOf(learner, conversationId)).items.find((message) => message.parts.some((part) => part.type === "component"))!;
    expect(stored.status).toBe("complete");
  });

  it("takes the model's verdict for an open answer that does not match", async () => {
    const { learner, lessons } = await seedLibrary();
    const ai = scriptedAi([
      callTool("ask_translate", { source: "I live in Utrecht.", reference: "Ik woon in Utrecht.", lessonId: lessons.first.id }),
      say("{\"verdict\": \"acceptable\", \"note\": \"Natural, just different.\"}"),
      say("Great."),
    ]);
    const conversationId = await newConversation(learner);
    const events = await readEvents(await call("POST", `/api/ai/conversations/${conversationId}/messages`, learner, { text: "Translate" }, { AI: ai.binding }));
    const toolCallId = ofType(events, "component")[0]!.part.toolCallId;
    const answered = await readEvents(await call("POST", `/api/ai/conversations/${conversationId}/tool-calls/${toolCallId}/respond`, learner,
      { type: "component", answer: { kind: "translate", text: "Ik ben in Utrecht woonachtig." } }, { AI: ai.binding }));
    expect(ofType(answered, "answered")[0]!.part).toHaveProperty("grade");
    expect((ofType(answered, "answered")[0]!.part as { grade: unknown }).grade).toMatchObject({ correct: true, matched: false, verdict: "acceptable", note: "Natural, just different." });
    const judge = modelMessages(ai.calls[1]);
    expect(ai.calls[1]!.tools).toBeUndefined();
    expect(JSON.parse(judge[1]!.content!)).toMatchObject({ answer: "Ik ben in Utrecht woonachtig.", reference: "Ik woon in Utrecht." });
    expect(await env.DB.prepare("SELECT matched, ai_verdict AS verdict, ai_note AS note FROM practice_attempts").first()).toEqual({ matched: 0, verdict: "acceptable", note: "Natural, just different." });
    // The judge is metered but does not count as another turn.
    expect(await count("SELECT COUNT(*) AS n FROM ai_usage")).toBe(3);
    expect(await count("SELECT COUNT(*) AS n FROM ai_usage WHERE turn_start = 1")).toBe(2);
  });

  it("refuses record_word_review for words no question tested, and accepts tested ones", async () => {
    const { learner, learnerId, lessons, words } = await seedLibrary();
    const review = { lessonId: lessons.first.id, wordId: words.tafel.id, direction: "understand", result: "again" };
    const conversationId = await newConversation(learner);
    const first = scriptedAi([callTool("record_word_review", review), say("Hm.")]);
    const refused = await readEvents(await call("POST", `/api/ai/conversations/${conversationId}/messages`, learner, { text: "I forgot tafel" }, { AI: first.binding }));
    expect(ofType(refused, "tool_result")[0]!.part).toMatchObject({ ok: false, error: "WORD_NOT_TESTED" });
    expect(await count("SELECT COUNT(*) AS n FROM word_reviews")).toBe(0);

    const quiz = scriptedAi([
      callTool("ask_choice", { question: "Wat is de tafel?", options: ["table", "chair", "house"], correct: 0, words: [{ lessonId: lessons.first.id, wordId: words.tafel.id }] }),
      say("Right."), callTool("record_word_review", review), say("Recorded."),
    ]);
    const asked = await readEvents(await call("POST", `/api/ai/conversations/${conversationId}/messages`, learner, { text: "Quiz" }, { AI: quiz.binding }));
    // An unanswered component does not count as tested yet.
    expect(ofType(asked, "component")).toHaveLength(1);
    await readEvents(await call("POST", `/api/ai/conversations/${conversationId}/tool-calls/${ofType(asked, "component")[0]!.part.toolCallId}/respond`, learner,
      { type: "component", answer: { kind: "choice", choice: 0 } }, { AI: quiz.binding }));
    const accepted = await readEvents(await call("POST", `/api/ai/conversations/${conversationId}/messages`, learner, { text: "Actually I forgot it" }, { AI: quiz.binding }));
    expect(ofType(accepted, "tool_result")[0]!.part).toMatchObject({ ok: true, detail: { result: "again" } });
    const rows = await env.DB.prepare("SELECT direction, result, source FROM word_reviews WHERE user_id = ? ORDER BY result").bind(learnerId).all();
    expect(rows.results).toEqual([{ direction: "understand", result: "again", source: "ai_chat" }, { direction: "understand", result: "got", source: "ai_chat" }]);
    // Another conversation's tested words do not count.
    const other = await newConversation(learner);
    const elsewhere = scriptedAi([callTool("record_word_review", review), say("No.")]);
    const outside = await readEvents(await call("POST", `/api/ai/conversations/${other}/messages`, learner, { text: "Record it" }, { AI: elsewhere.binding }));
    expect(ofType(outside, "tool_result")[0]!.part).toMatchObject({ ok: false, error: "WORD_NOT_TESTED" });
  });

  it("writes progress only after the learner confirms, once, and cancels without changes", async () => {
    const { learner, learnerId, lessons } = await seedLibrary();
    const ai = scriptedAi([callTool("complete_lesson", { lessonId: lessons.first.id }), say("Well done.")]);
    const conversationId = await newConversation(learner);
    const events = await readEvents(await call("POST", `/api/ai/conversations/${conversationId}/messages`, learner, { text: "I'm done" }, { AI: ai.binding }));
    expect(types(events)).toEqual(["user_message", "start", "tool_call", "confirmation", "done"]);
    const card = ofType(events, "confirmation")[0]!.part;
    expect(card.summary).toEqual({ action: "complete_lesson", course: expect.objectContaining({ title: "Dutch foundations" }), lesson: { id: lessons.first.id, title: "Greetings" } });
    expect(await count("SELECT COUNT(*) AS n FROM course_lesson_completions")).toBe(0);
    const path = `/api/ai/conversations/${conversationId}/tool-calls/${card.toolCallId}/respond`;
    expect(await errorCode(await call("POST", path, learner, { type: "component", answer: { kind: "choice", choice: 0 } }))).toBe("ANSWER_INVALID");

    const confirmed = await readEvents(await call("POST", path, learner, { type: "confirmation", confirmed: true }, { AI: ai.binding }));
    expect(ofType(confirmed, "answered")[0]!.part).toMatchObject({ answer: "confirmed", outcome: { ok: true, error: null } });
    expect(await count("SELECT COUNT(*) AS n FROM course_lesson_completions WHERE user_id = ? AND lesson_id = ?", learnerId, lessons.first.id)).toBe(1);
    expect(await env.DB.prepare("SELECT actor, kind, conversation_id AS conversationId FROM progress_events").first()).toEqual({ actor: "agent", kind: "lesson_completed", conversationId });
    expect(JSON.parse(toolMessages(ai.calls[1]).at(-1)!.content!)).toMatchObject({ status: "confirmed", ok: true });
    expect(await errorCode(await call("POST", path, learner, { type: "confirmation", confirmed: true }))).toBe("TOOL_CALL_ANSWERED");

    const reset = scriptedAi([callTool("reset_lesson", { lessonId: lessons.first.id }), say("Kept.")]);
    const asked = await readEvents(await call("POST", `/api/ai/conversations/${conversationId}/messages`, learner, { text: "Reset it" }, { AI: reset.binding }));
    const resetCard = ofType(asked, "confirmation")[0]!.part;
    expect(resetCard.summary).toMatchObject({ action: "reset_lesson", deletes: { completion: true, position: false, attempts: 0, reviews: 0 } });
    const cancelled = await readEvents(await call("POST", `/api/ai/conversations/${conversationId}/tool-calls/${resetCard.toolCallId}/respond`, learner, { type: "confirmation", confirmed: false }, { AI: reset.binding }));
    expect(ofType(cancelled, "answered")[0]!.part).toMatchObject({ answer: "cancelled", outcome: null });
    expect(JSON.parse(toolMessages(reset.calls[1]).at(-1)!.content!)).toMatchObject({ status: "cancelled" });
    expect(await count("SELECT COUNT(*) AS n FROM course_lesson_completions")).toBe(1);
    expect(await count("SELECT COUNT(*) AS n FROM progress_events")).toBe(1);
  });

  it("saves an AI practice only after confirmation", async () => {
    const { learner, lessons, example } = await seedLibrary();
    const practice = { kind: "choice", payload: { question: "Wat is een huis?", options: ["house", "mouse", "horse"], correct: 0 } };
    const ai = scriptedAi([callTool("save_ai_practice", { practice, lessons: [{ lessonId: lessons.first.id, afterBlockId: example.id }] }), say("Saved.")]);
    const conversationId = await newConversation(learner);
    const events = await readEvents(await call("POST", `/api/ai/conversations/${conversationId}/messages`, learner, { text: "Save it" }, { AI: ai.binding }));
    const card = ofType(events, "confirmation")[0]!.part;
    expect(card.summary).toMatchObject({ action: "save_ai_practice", view: { kind: "choice", options: ["house", "mouse", "horse"] }, lessons: [{ lesson: { id: lessons.first.id }, afterBlockId: example.id }] });
    const confirmed = await readEvents(await call("POST", `/api/ai/conversations/${conversationId}/tool-calls/${card.toolCallId}/respond`, learner, { type: "confirmation", confirmed: true }, { AI: ai.binding }));
    expect(ofType(confirmed, "answered")[0]!.part).toMatchObject({ answer: "confirmed", outcome: { ok: true, error: null } });
    expect(await count("SELECT COUNT(*) AS n FROM ai_practice_lessons WHERE lesson_id = ? AND after_block_id = ?", lessons.first.id, example.id)).toBe(1);
  });

  it("ends a failed turn with an error part and keeps what was written", async () => {
    const { learner } = await seedLibrary();
    const conversationId = await newConversation(learner);
    const failing: WorkersAiBinding = { run: async () => { throw new Error("capacity"); } };
    const events = await readEvents(await call("POST", `/api/ai/conversations/${conversationId}/messages`, learner, { text: "Hoi" }, { AI: failing }));
    expect(types(events)).toEqual(["user_message", "start", "error", "done"]);
    expect(ofType(events, "error")[0]!.code).toBe("AI_UNAVAILABLE");
    expect(ofType(events, "done")[0]!.message).toMatchObject({ status: "error", parts: [{ type: "error", code: "AI_UNAVAILABLE" }] });
    expect((await messagesOf(learner, conversationId)).items).toHaveLength(2);
  });

  it("stops after the tool call limit and asks for a text answer", async () => {
    const { learner } = await seedLibrary();
    const conversationId = await newConversation(learner);
    const ai = scriptedAi([...Array.from({ length: 8 }, () => callTool("get_weak_words", {})), (inputs) => { expect(inputs.tools).toBeUndefined(); return say("Done looking."); }]);
    const events = await readEvents(await call("POST", `/api/ai/conversations/${conversationId}/messages`, learner, { text: "Look" }, { AI: ai.binding }));
    expect(ofType(events, "tool_result")).toHaveLength(8);
    expect(ofType(events, "done")[0]!.message.status).toBe("complete");
    expect(ai.remaining()).toBe(0);
  });
});

describe("learner context and more components", () => {
  it("picks the next lesson from the learner's activity and fills the snapshot", async () => {
    const { learner, learnerId, groupId, course, lessons } = await seedLibrary();
    await env.DB.prepare(
      "INSERT INTO course_lesson_positions (group_id, course_id, lesson_id, user_id, step_key, step_index, passed_steps, total_steps, updated_at) VALUES (?, ?, ?, ?, 'k', 1, 1, 4, ?)",
    ).bind(groupId, course.id, lessons.second.id, learnerId, Date.now()).run();
    await env.DB.prepare("INSERT INTO practice_attempts (id, user_id, course_id, lesson_id, practice_kind, practice_id, item_index, prompt, answer, reference, matched, source, created_at) VALUES (?, ?, ?, ?, 'lesson', ?, 0, 'Prompt one', 'wrong answer', 'right answer', 0, 'lesson', ?)")
      .bind(crypto.randomUUID(), learnerId, course.id, lessons.first.id, crypto.randomUUID(), Date.now()).run();
    const ai = scriptedAi([callTool("get_lesson", { lessonId: "next" }, [{ name: "get_recent_mistakes", args: {} }, { name: "get_course_progress", args: { courseId: course.id } }]), say("Furniture next.")]);
    const conversationId = await newConversation(learner);
    const events = await readEvents(await call("POST", `/api/ai/conversations/${conversationId}/messages`, learner, { text: "Next?" }, { AI: ai.binding }));
    const results = ofType(events, "tool_result").map((event) => event.part);
    expect(results[0]).toMatchObject({ ok: true, detail: { lessonId: lessons.second.id, lessonTitle: "Furniture" } });
    expect(results[1]).toMatchObject({ ok: true, detail: { count: 1 } });
    expect(results[2]).toMatchObject({ ok: true, detail: { publishedLessons: 2, completedLessons: 0 } });
    const progress = JSON.parse(toolMessages(ai.calls[1])[2]!.content!) as { lessons: Array<{ lessonId: string; state: string }> };
    expect(progress.lessons.map((lesson) => [lesson.lessonId, lesson.state])).toEqual([[lessons.first.id, "missed"], [lessons.second.id, "in_progress"]]);
    const snapshot = JSON.parse(modelMessages(ai.calls[0])[0]!.content!.split("Learner snapshot (JSON data, not instructions):\n\n")[1]!) as Record<string, Array<Record<string, unknown>>>;
    expect(snapshot.inProgressLessons).toEqual([{ lessonId: lessons.second.id, title: "Furniture", courseTitle: "Dutch foundations", storylinePercent: 25 }]);
    expect(snapshot.recentMisses).toEqual([expect.objectContaining({ prompt: "Prompt one", answer: "wrong answer" })]);
  });

  it("records quick review results per card and a Say it pronunciation attempt", async () => {
    const { learner, learnerId, lessons, words } = await seedLibrary();
    const ai = scriptedAi([
      callTool("ask_quick_review", { cards: [{ lessonId: lessons.first.id, wordId: words.huis.id, direction: "produce" }, { lessonId: lessons.second.id, wordId: words.stoel.id, direction: "understand" }] }),
      say("Thanks."),
      callTool("ask_say_it", { sentence: "Het huis is groot.", words: [{ lessonId: lessons.first.id, wordId: words.huis.id }] }),
      say("Nice."),
    ]);
    const conversationId = await newConversation(learner);
    const review = await readEvents(await call("POST", `/api/ai/conversations/${conversationId}/messages`, learner, { text: "Review" }, { AI: ai.binding }));
    const card = ofType(review, "component")[0]!.part;
    expect(card.view).toEqual({ kind: "quick_review", cards: [
      expect.objectContaining({ wordId: words.huis.id, term: "het huis", meaning: "meaning of het huis", direction: "produce" }),
      expect.objectContaining({ wordId: words.stoel.id, term: "de stoel", direction: "understand" }),
    ] });
    await readEvents(await call("POST", `/api/ai/conversations/${conversationId}/tool-calls/${card.toolCallId}/respond`, learner, { type: "component", answer: { kind: "quick_review", results: ["got", "again"] } }, { AI: ai.binding }));
    const reviews = await env.DB.prepare("SELECT word_id AS wordId, direction, result FROM word_reviews WHERE user_id = ? ORDER BY result DESC").bind(learnerId).all();
    expect(reviews.results).toEqual([{ wordId: words.huis.id, direction: "produce", result: "got" }, { wordId: words.stoel.id, direction: "understand", result: "again" }]);
    expect(await count("SELECT COUNT(*) AS n FROM practice_attempts")).toBe(0);

    const sayIt = await readEvents(await call("POST", `/api/ai/conversations/${conversationId}/messages`, learner, { text: "Speak" }, { AI: ai.binding }));
    const prompt = ofType(sayIt, "component")[0]!.part;
    const scores = { overall: 81, accuracy: 80, fluency: 90, completeness: 100, words: [{ word: "huis", accuracy: 75, error: "none" }] };
    const answered = await readEvents(await call("POST", `/api/ai/conversations/${conversationId}/tool-calls/${prompt.toolCallId}/respond`, learner, { type: "component", answer: { kind: "say_it", scores } }, { AI: ai.binding }));
    expect(ofType(answered, "answered")[0]!.part).toMatchObject({ grade: { correct: true, score: 81 } });
    expect(await env.DB.prepare("SELECT surface, reference_text AS referenceText, word_id AS wordId, overall FROM pronunciation_attempts WHERE user_id = ?").bind(learnerId).first())
      .toEqual({ surface: "ai_chat", referenceText: "Het huis is groot.", wordId: words.huis.id, overall: 81 });
    expect(await count("SELECT COUNT(*) AS n FROM word_reviews")).toBe(2);
  });

  it("resets a lesson after confirmation with actor agent", async () => {
    const { learner, learnerId, lessons, words } = await seedLibrary();
    const ai = scriptedAi([
      callTool("ask_choice", { question: "Huis?", options: ["house", "mouse", "horse"], correct: 1, lessonId: lessons.first.id, words: [{ lessonId: lessons.first.id, wordId: words.huis.id }] }),
      say("Not quite."), callTool("reset_lesson", { lessonId: lessons.first.id }), say("Reset."),
    ]);
    const conversationId = await newConversation(learner);
    const asked = await readEvents(await call("POST", `/api/ai/conversations/${conversationId}/messages`, learner, { text: "Quiz" }, { AI: ai.binding }));
    await readEvents(await call("POST", `/api/ai/conversations/${conversationId}/tool-calls/${ofType(asked, "component")[0]!.part.toolCallId}/respond`, learner, { type: "component", answer: { kind: "choice", choice: 0 } }, { AI: ai.binding }));
    expect(await count("SELECT COUNT(*) AS n FROM practice_attempts WHERE user_id = ?", learnerId)).toBe(1);
    const card = await readEvents(await call("POST", `/api/ai/conversations/${conversationId}/messages`, learner, { text: "Start over" }, { AI: ai.binding }));
    const confirmation = ofType(card, "confirmation")[0]!.part;
    expect(confirmation.summary).toMatchObject({ deletes: { attempts: 1, reviews: 1 } });
    await readEvents(await call("POST", `/api/ai/conversations/${conversationId}/tool-calls/${confirmation.toolCallId}/respond`, learner, { type: "confirmation", confirmed: true }, { AI: ai.binding }));
    expect(await count("SELECT COUNT(*) AS n FROM practice_attempts")).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM word_reviews")).toBe(0);
    expect(await env.DB.prepare("SELECT actor, kind, conversation_id AS conversationId FROM progress_events").first()).toEqual({ actor: "agent", kind: "lesson_reset", conversationId });
  });
});

describe("on-demand speech", () => {
  const speechEnv = { AZURE_SPEECH_KEY: "test-key", AZURE_SPEECH_REGION: "germanywestcentral" };
  async function spokenMessage(learner: string, text = "Zeg [[Goedemorgen]] en [[Tot ziens]].") {
    const ai = scriptedAi([say(text)]);
    const conversationId = await newConversation(learner);
    const events = await readEvents(await call("POST", `/api/ai/conversations/${conversationId}/messages`, learner, { text: "Speak" }, { AI: ai.binding }));
    return { conversationId, messageId: ofType(events, "done")[0]!.message.id };
  }
  const clipHash = async (text: string) => (await hashSpeechItems([{ key: "x", voice: speechNarrator("nl"), text: spokenText(text), ipa: null }]))[0]!.hash;

  it("serves a cached clip for a stored span and counts it", async () => {
    const { learner, learnerId } = await seedLibrary();
    const { conversationId, messageId } = await spokenMessage(learner);
    const hash = await clipHash("Tot ziens");
    await env.DB.prepare("INSERT INTO speech_clips (hash, voice, characters, status, attempts, created_at, updated_at) VALUES (?, ?, 9, 'ready', 1, 0, 0)").bind(hash, speechNarrator("nl")).run();
    const path = `/api/ai/conversations/${conversationId}/messages/${messageId}/speech`;
    const response = await call("POST", path, learner, { spanIndex: 1 }, speechEnv);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ url: `https://wordinator.test/api/media/speech/${hash}.mp3` });
    expect(await env.DB.prepare("SELECT user_id AS userId, surface, clip_hash AS clipHash, characters, cached FROM speech_usage").first())
      .toEqual({ userId: learnerId, surface: "ai_message", clipHash: hash, characters: 9, cached: 1 });
    // Only stored spans can be spoken: no text in the request, no index past the message's spans, no user message.
    expect((await call("POST", path, learner, { text: "Iets anders" }, speechEnv)).status).toBe(400);
    expect(await errorCode(await call("POST", path, learner, { spanIndex: 2 }, speechEnv))).toBe("SPAN_NOT_FOUND");
    const userMessage = (await messagesOf(learner, conversationId)).items.find((message) => message.role === "user")!;
    expect(await errorCode(await call("POST", `/api/ai/conversations/${conversationId}/messages/${userMessage.id}/speech`, learner, { spanIndex: 0 }, speechEnv))).toBe("MESSAGE_NOT_FOUND");
  });

  it("answers 202 while another request synthesizes, 503 without the key, and 429 past the character cap", async () => {
    const { learner } = await seedLibrary();
    const { conversationId, messageId } = await spokenMessage(learner);
    const path = `/api/ai/conversations/${conversationId}/messages/${messageId}/speech`;
    const unavailable = await call("POST", path, learner, { spanIndex: 0 });
    expect(unavailable.status).toBe(503);
    expect(await errorCode(unavailable)).toBe("SPEECH_UNAVAILABLE");
    await env.DB.prepare("INSERT INTO speech_clips (hash, voice, characters, status, attempts, claimed_at, created_at, updated_at) VALUES (?, ?, 11, 'pending', 0, ?, 0, 0)")
      .bind(await clipHash("Goedemorgen"), speechNarrator("nl"), Date.now()).run();
    const pending = await call("POST", path, learner, { spanIndex: 0 }, speechEnv);
    expect(pending.status).toBe(202);
    expect(await pending.json()).toEqual({ status: "pending" });
    expect(await count("SELECT COUNT(*) AS n FROM speech_usage")).toBe(0);

    await writeAiSettings(env.DB, { ...DEFAULT_AI_SETTINGS, dailySpeechCharCap: 12 });
    const hash = await clipHash("Tot ziens");
    await env.DB.prepare("INSERT INTO speech_clips (hash, voice, characters, status, attempts, created_at, updated_at) VALUES (?, ?, 9, 'ready', 1, 0, 0)").bind(hash, speechNarrator("nl")).run();
    expect((await call("POST", path, learner, { spanIndex: 1 }, speechEnv)).status).toBe(200);
    const limited = await call("POST", path, learner, { spanIndex: 1 }, speechEnv);
    expect(limited.status).toBe(429);
    expect(await errorCode(limited)).toBe("SPEECH_DAILY_LIMIT");
  });

  it("speaks a Dictation sentence by its tool call and refuses spans that are too long", async () => {
    const { learner } = await seedLibrary();
    const ai = scriptedAi([callTool("ask_dictation", { sentence: "Ik woon in Utrecht." })]);
    const conversationId = await newConversation(learner);
    const events = await readEvents(await call("POST", `/api/ai/conversations/${conversationId}/messages`, learner, { text: "Dictation" }, { AI: ai.binding }));
    const component = ofType(events, "component")[0]!.part;
    expect(component.view).toEqual({ kind: "dictation", translation: null });
    const hash = await clipHash("Ik woon in Utrecht.");
    await env.DB.prepare("INSERT INTO speech_clips (hash, voice, characters, status, attempts, created_at, updated_at) VALUES (?, ?, 19, 'ready', 1, 0, 0)").bind(hash, speechNarrator("nl")).run();
    const messageId = ofType(events, "done")[0]!.message.id;
    const response = await call("POST", `/api/ai/conversations/${conversationId}/messages/${messageId}/speech`, learner, { toolCallId: component.toolCallId }, speechEnv);
    expect(await response.json()).toEqual({ url: expect.stringContaining(hash) });

    const long = await spokenMessage(learner, `[[${"lang ".repeat(70)}]]`);
    const refused = await call("POST", `/api/ai/conversations/${long.conversationId}/messages/${long.messageId}/speech`, learner, { spanIndex: 0 }, speechEnv);
    expect(await errorCode(refused)).toBe("SPAN_TOO_LONG");
  });
});

describe("tutor profile", () => {
  it("reads defaults, updates the learner's fields, and clears the tutor's notes", async () => {
    const { learner, rival } = await seedLibrary();
    const read = async (cookie: string) => ((await (await call("GET", "/api/ai/profile", cookie)).json()) as { profile: Record<string, unknown> }).profile;
    expect(await read(learner)).toEqual({ nativeLanguage: "en", replyLanguage: "native", goals: null, notes: null, updatedAt: null });
    const updated = await call("PUT", "/api/ai/profile", learner, { nativeLanguage: "fa", replyLanguage: "mixed", goals: "  Order food in Dutch  " });
    expect(((await updated.json()) as { profile: unknown }).profile).toMatchObject({ nativeLanguage: "fa", replyLanguage: "mixed", goals: "Order food in Dutch" });
    expect((await call("PUT", "/api/ai/profile", learner, { nativeLanguage: "xx", replyLanguage: "native", goals: null })).status).toBe(400);
    expect((await call("PUT", "/api/ai/profile", learner, { nativeLanguage: "en", replyLanguage: "native", goals: null, notes: "mine" })).status).toBe(400);

    const ai = scriptedAi([callTool("update_tutor_notes", { notes: "Mixes up de and het." }), say("Noted.")]);
    const conversationId = await newConversation(learner);
    await readEvents(await call("POST", `/api/ai/conversations/${conversationId}/messages`, learner, { text: "Remember" }, { AI: ai.binding }));
    expect(await read(learner)).toMatchObject({ nativeLanguage: "fa", notes: "Mixes up de and het." });
    // The notes and profile reach the next turn's snapshot.
    const next = scriptedAi([say("Hoi")]);
    await readEvents(await call("POST", `/api/ai/conversations/${conversationId}/messages`, learner, { text: "Hi" }, { AI: next.binding }));
    expect(modelMessages(next.calls[0])[0]!.content).toContain("Mixes up de and het.");
    expect(modelMessages(next.calls[0])[0]!.content).toContain("Persian");

    const cleared = await call("DELETE", "/api/ai/profile/notes", learner);
    expect(((await cleared.json()) as { profile: unknown }).profile).toMatchObject({ notes: null, goals: "Order food in Dutch" });
    expect(await read(rival)).toMatchObject({ notes: null, goals: null });
  });
});
