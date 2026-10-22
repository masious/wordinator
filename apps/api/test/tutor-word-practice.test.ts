import { env } from "cloudflare:test";
import { tutorConversationResponseSchema, wordPracticeResponseSchema, type TutorStreamEvent } from "@wordinator/contracts/tutor";
import { beforeEach, describe, expect, it } from "vitest";
import { errorCode, resetDatabase, seedUser, signIn } from "./courseApi";
import { call, callTool, modelMessages, newConversation, readEvents, say, scriptedAi, seedLibrary, toolMessages } from "./tutorApi";

// Word practice (experimental): the picker's candidates, a conversation started with chosen words, the compact prompt section,
// `get_words`, and the Spot the words component.

beforeEach(resetDatabase);

const ofType = <T extends TutorStreamEvent["type"]>(events: TutorStreamEvent[], type: T) =>
  events.filter((event): event is Extract<TutorStreamEvent, { type: T }> => event.type === type);

describe("access", () => {
  it("refuses anonymous requests and unfinished setup", async () => {
    const newcomerId = await seedUser("newcomer");
    await env.DB.prepare("UPDATE users SET display_name = 'New learner' WHERE id = ?").bind(newcomerId).run();
    const newcomer = await signIn("newcomer");
    const id = crypto.randomUUID();
    for (const [method, path, body] of [["GET", "/api/ai/word-practice"], ["POST", "/api/ai/conversations", { wordPractice: [{ lessonId: id, wordId: id, source: "drill" }] }]] as const) {
      expect((await call(method, path, null, body)).status).toBe(401);
      const unfinished = await call(method, path, newcomer, body);
      expect(unfinished.status).toBe(403);
      expect(await errorCode(unfinished)).toBe("ONBOARDING_REQUIRED");
    }
  });
});

describe("picker", () => {
  it("lists readable lessons and the chosen lessons' new words, ignoring lessons the learner cannot read", async () => {
    const { learner, lessons, words } = await seedLibrary();
    const ids = [lessons.first.id, lessons.hidden.id, lessons.unpublished.id, lessons.foreign.id].join(",");
    const response = await call("GET", `/api/ai/word-practice?lessons=${ids}`, learner);
    expect(response.status).toBe(200);
    const body = wordPracticeResponseSchema.parse(await response.json());
    expect(body.lessons.map((lesson) => lesson.title)).toEqual(["Greetings", "Furniture"]);
    expect(body.items.map((item) => [item.wordId, item.source])).toEqual([[words.huis.id, "new"], [words.tafel.id, "new"]]);
  });

  it("refuses invalid lesson lists", async () => {
    const { learner } = await seedLibrary();
    expect((await call("GET", "/api/ai/word-practice?lessons=not%20an%20id", learner)).status).toBe(400);
    const many = Array.from({ length: 11 }, () => crypto.randomUUID()).join(",");
    expect((await call("GET", `/api/ai/word-practice?lessons=${many}`, learner)).status).toBe(400);
  });
});

describe("word practice conversations", () => {
  it("refuses words the learner cannot read and repeated words", async () => {
    const { learner, lessons, words } = await seedLibrary();
    const foreign = await call("POST", "/api/ai/conversations", learner, { wordPractice: [{ lessonId: lessons.foreign.id, wordId: words.huis.id, source: "weak" }] });
    expect(foreign.status).toBe(404);
    expect(await errorCode(foreign)).toBe("WORD_NOT_FOUND");
    const twice = await call("POST", "/api/ai/conversations", learner, { wordPractice: [
      { lessonId: lessons.first.id, wordId: words.huis.id, source: "drill" }, { lessonId: lessons.first.id, wordId: words.huis.id, source: "weak" },
    ] });
    expect(twice.status).toBe(400);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM ai_conversations").first<{ n: number }>()).toEqual({ n: 0 });
  });

  it("starts with the chosen words, prompts with references only, reads details with get_words, and records the checklist", async () => {
    const { learner, learnerId, rival, lessons, words } = await seedLibrary();
    const chosen = [
      { lessonId: lessons.first.id, wordId: words.huis.id, source: "drill" }, { lessonId: lessons.first.id, wordId: words.tafel.id, source: "new" },
      { lessonId: lessons.second.id, wordId: words.stoel.id, source: "weak" },
    ];
    const created = await call("POST", "/api/ai/conversations", learner, { wordPractice: chosen });
    expect(created.status).toBe(201);
    const { conversation } = tutorConversationResponseSchema.parse(await created.json());
    expect(conversation.wordPractice).toEqual([
      { ...chosen[0], term: "het huis", meaning: "meaning of het huis", forms: null, example: null, note: null },
      expect.objectContaining({ ...chosen[1], term: "de tafel", meaning: "meaning of de tafel" }), expect.objectContaining({ ...chosen[2], term: "de stoel" }),
    ]);
    // Another account cannot open it; an ordinary conversation has no word practice.
    expect((await call("GET", `/api/ai/conversations/${conversation.id}`, rival)).status).toBe(404);
    const plain = tutorConversationResponseSchema.parse(await (await call("GET", `/api/ai/conversations/${await newConversation(learner)}`, learner)).json());
    expect(plain.conversation.wordPractice).toBeUndefined();

    const refs = chosen.map(({ lessonId, wordId }) => ({ lessonId, wordId }));
    const ai = scriptedAi([
      callTool("get_words", { words: refs }),
      callTool("ask_spot_words", { passage: "Het [[{{huis|1}}]] heeft een {{tafel|2}} en een {{stoel|7}}.", translation: "The house has a table and a chair.", words: refs }),
      say("Let's practise [[{{tafels|2}}]] again."),
    ]);
    const base = `/api/ai/conversations/${conversation.id}`;
    const events = await readEvents(await call("POST", `${base}/messages`, learner, { text: "Let's practise my words." }, { AI: ai.binding }));
    const system = modelMessages(ai.calls[0])[0]!.content!;
    expect(system).toContain("short word practice");
    expect(system).toContain(`"wordId":"${words.huis.id}","term":"het huis","source":"drill"`);
    expect(system).toContain(`"n":2,"lessonId":"${lessons.first.id}","wordId":"${words.tafel.id}","term":"de tafel","source":"new"`);
    expect(system).toContain("{{form|n}}");
    expect(system).not.toContain("meaning of het huis");
    const read = JSON.parse(toolMessages(ai.calls[1])[0]!.content!) as { words: Array<{ term: string; meaning: string }> };
    expect(read.words.map((word) => [word.term, word.meaning])).toEqual([["het huis", "meaning of het huis"], ["de tafel", "meaning of de tafel"], ["de stoel", "meaning of de stoel"]]);

    // Passage marks leave the passage for the view; a number outside the list keeps only its text.
    const part = ofType(events, "component")[0]!.part;
    expect(part.view).toEqual({
      kind: "spot_words", passage: "Het huis heeft een tafel en een stoel.", translation: "The house has a table and a chair.",
      marks: [{ start: 4, end: 8, index: 0 }, { start: 19, end: 24, index: 1 }],
      words: [
        expect.objectContaining({ wordId: words.huis.id, term: "het huis", meaning: "meaning of het huis" }),
        expect.objectContaining({ wordId: words.tafel.id, term: "de tafel" }), expect.objectContaining({ wordId: words.stoel.id, term: "de stoel" }),
      ],
    });
    const wrongLength = await call("POST", `${base}/tool-calls/${part.toolCallId}/respond`, learner, { type: "component", answer: { kind: "spot_words", known: [true] } }, { AI: ai.binding });
    expect(wrongLength.status).toBe(400);
    const answered = await readEvents(await call("POST", `${base}/tool-calls/${part.toolCallId}/respond`, learner, { type: "component", answer: { kind: "spot_words", known: [true, false, true] } }, { AI: ai.binding }));
    const reply = ofType(answered, "done")[0]!.message.parts.find((entry) => entry.type === "text");
    expect(reply).toEqual({ type: "text", text: "Let's practise tafels again.", spans: [{ start: 15, end: 21 }], words: [{ start: 15, end: 21, index: 1 }] });
    expect(ofType(answered, "answered")[0]!.part).toMatchObject({ grade: { correct: false, items: [{ ok: true }, { ok: false, given: "not recognised" }, { ok: true }] } });
    const reviews = await env.DB.prepare("SELECT word_id AS wordId, direction, result FROM word_reviews WHERE user_id = ? ORDER BY word_id").bind(learnerId).all();
    expect(reviews.results).toEqual(expect.arrayContaining([
      { wordId: words.huis.id, direction: "understand", result: "got" }, { wordId: words.tafel.id, direction: "understand", result: "again" },
      { wordId: words.stoel.id, direction: "understand", result: "got" },
    ]));
    expect(reviews.results).toHaveLength(3);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM practice_attempts").first<{ n: number }>()).toEqual({ n: 0 });

    // The missed word is now weak in the picker; the recognised one is still listed while its memory is short.
    const picker = wordPracticeResponseSchema.parse(await (await call("GET", `/api/ai/word-practice?lessons=${lessons.first.id}`, learner)).json());
    expect(picker.items.find((item) => item.wordId === words.tafel.id)?.source).toBe("weak");
    expect(picker.items[0]!.wordId).toBe(words.tafel.id);
  });
});
