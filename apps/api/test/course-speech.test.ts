import { env, SELF } from "cloudflare:test";
import { courseResponseSchema } from "@wordinator/contracts";
import { courseWordsResponseSchema, wordBookmarkPageSchema } from "@wordinator/contracts/lesson-document";
import { speechClipHash, speechClipKey } from "@wordinator/contracts/speech";
import { beforeEach, describe, expect, it } from "vitest";
import { azureSynthesizer, runSpeechJobs, SPEECH_CLAIM_LEASE_MS, SPEECH_DRAFT_DELAY_MS, type SynthesisResult, type Synthesize } from "../src/speech";
import {
  addLesson, blocks, coursePath, createCourse, documentOf, errorCode, join, lessonPath, publishLesson, readLesson, request, resetDatabase, saveDraft, seedGroup, seedUser, signIn, word,
} from "./courseApi";

// A synthesizer stand-in that records every request and answers with a few bytes of "audio".
function fakeAzure(answer: (ssml: string, call: number) => SynthesisResult = () => ({ ok: true, audio: new Uint8Array([0xff, 0xf3, 1, 2]).buffer })) {
  const calls: string[] = [];
  const synthesize: Synthesize = async (ssml) => { calls.push(ssml); return answer(ssml, calls.length); };
  return { calls, synthesize };
}
const failure = (kind: "throttled" | "unauthorized" | "failed", status: number): SynthesisResult => ({ ok: false, kind, status, retryAfterMs: null });
const job = (lessonId: string) => env.DB.prepare("SELECT due_at AS dueAt, updated_at AS updatedAt FROM speech_jobs WHERE lesson_id = ?").bind(lessonId).first<{ dueAt: number; updatedAt: number }>();
const clip = (hash: string) => env.DB.prepare("SELECT status, attempts, next_attempt_at AS nextAttemptAt, claimed_at AS claimedAt FROM speech_clips WHERE hash = ?").bind(hash).first<{ status: string; attempts: number; nextAttemptAt: number | null; claimedAt: number | null }>();
const narrator = (text: string, ipa: string | null = null) => speechClipHash({ voice: "nl-NL-FennaNeural", text, ipa });
const later = (ms: number) => () => Date.now() + ms;

async function setup(label: string) {
  const ownerId = await seedUser(`${label}-owner`); const learnerId = await seedUser(`${label}-learner`); const contributorId = await seedUser(`${label}-contributor`);
  const groupId = await seedGroup(label, ownerId);
  await join(groupId, learnerId); await join(groupId, contributorId);
  const owner = await signIn(`${label}-owner`); const learner = await signIn(`${label}-learner`); const contributor = await signIn(`${label}-contributor`);
  const course = await createCourse(groupId, owner);
  await request(`${coursePath(groupId, course.id)}/contributors`, contributor, {});
  await request(`${coursePath(groupId, course.id)}/contributors/${contributorId}`, owner, { decision: "accept" }, "PATCH");
  return { groupId, courseId: course.id, owner, learner, contributor, learnerId };
}

beforeEach(async () => { await resetDatabase(); });

describe("Speech jobs", () => {
  it("debounces draft saves, makes published lessons due at once, and removes the job with the lesson", async () => {
    const { groupId, courseId, owner } = await setup("jobs");
    const { lesson, path } = await addLesson(groupId, courseId, owner, "Draft", { published: false });
    const before = Date.now();
    const saved = await saveDraft(path, owner, documentOf(blocks.example("Ik woon hier.")), lesson.draft!.version);
    const due = (await job(lesson.id))!.dueAt;
    expect(due).toBeGreaterThanOrEqual(before + SPEECH_DRAFT_DELAY_MS);
    // Nothing runs before the debounce has passed.
    const azure = fakeAzure();
    expect(await runSpeechJobs(env, { synthesize: azure.synthesize })).toMatchObject({ synthesized: 0 });
    expect(azure.calls).toHaveLength(0);
    // Publishing makes the job due now.
    await publishLesson(path, owner, saved.draftVersion);
    expect((await job(lesson.id))!.dueAt).toBeLessThanOrEqual(Date.now());
    expect((await request(path, owner, undefined, "DELETE")).status).toBe(200);
    expect(await job(lesson.id)).toBeNull();
  });

  it("does nothing without Azure configuration", async () => {
    const { groupId, courseId, owner } = await setup("unconfigured");
    const { lesson } = await addLesson(groupId, courseId, owner, "Lesson", { document: documentOf(blocks.example("Hallo.")) });
    expect(await runSpeechJobs({ ...env, AZURE_SPEECH_KEY: undefined })).toBeNull();
    expect(await job(lesson.id)).not.toBeNull();
  });
});

describe("Speech worker and reads", () => {
  it("synthesizes published and draft items, stores MP3s in R2, and serves ready clips to readers by role", async () => {
    const { groupId, courseId, owner, learner, contributor } = await setup("reads");
    const hond = word("de hond (m.)", { example: "De hond blaft." });
    const sentence = blocks.example("Er is een <balkon> & tuin.");
    const dialogue = { id: crypto.randomUUID(), type: "dialogue" as const, props: { turns: JSON.stringify([{ speaker: "Anna", text: "Hoi!" }, { speaker: "Ben", text: "Dag." }]) }, children: [] };
    const { lesson, path } = await addLesson(groupId, courseId, owner, "Lesson", { document: documentOf(blocks.vocabulary(hond), sentence, dialogue) });
    // A newer draft adds an example that only editors hear.
    const draftOnly = blocks.example("Alleen in het concept.");
    await saveDraft(path, owner, documentOf(blocks.vocabulary(hond), sentence, dialogue, draftOnly), (await readLesson(path, owner)).draft!.version);

    // Before the worker runs, nothing is ready and the draft's items are pending.
    expect((await readLesson(path, learner)).speech).toEqual({});
    expect((await readLesson(path, owner)).draftSpeech![`example:${draftOnly.id}`]).toEqual({ status: "pending", url: null });

    const azure = fakeAzure();
    expect(await runSpeechJobs(env, { synthesize: azure.synthesize, now: later(SPEECH_DRAFT_DELAY_MS) })).toMatchObject({ synthesized: 6, finishedJobs: 1 });
    expect(await job(lesson.id)).toBeNull();
    // Markup is escaped, the term is spoken without its parenthesis, and dialogue turns get distinct voices.
    expect(azure.calls.some((ssml) => ssml.includes("Er is een &#60;balkon&#62; &#38; tuin."))).toBe(true);
    expect(azure.calls.some((ssml) => ssml.includes(">de hond</voice>"))).toBe(true);
    expect(azure.calls.filter((ssml) => ssml.includes('<voice name="nl-NL-ColetteNeural">'))).toHaveLength(1);

    const learnerView = await readLesson(path, learner);
    expect(Object.keys(learnerView.speech).sort()).toEqual([
      `example:${sentence.id}`, `turn:${dialogue.id}:0`, `turn:${dialogue.id}:1`, `word:${hond.id}`, `wordExample:${hond.id}`,
    ].sort());
    expect(learnerView.draftSpeech).toBeNull();
    const hash = await narrator("de hond");
    expect(learnerView.speech[`word:${hond.id}`]).toBe(`https://wordinator.test/api/media/${speechClipKey(hash)}`);
    const stored = await env.MEDIA.get(speechClipKey(hash));
    expect(stored?.httpMetadata?.contentType).toBe("audio/mpeg");
    expect(stored?.httpMetadata?.cacheControl).toBe("public, max-age=31536000, immutable");
    await stored?.arrayBuffer();
    const served = await SELF.fetch(learnerView.speech[`word:${hond.id}`]!);
    expect(served.status).toBe(200);
    await served.arrayBuffer();

    // Editors also get every draft item with its status; learners never do, including through the course read.
    for (const editor of [owner, contributor]) expect((await readLesson(path, editor)).draftSpeech![`example:${draftOnly.id}`]?.status).toBe("ready");
    const detail = await request(coursePath(groupId, courseId), learner);
    const preloaded = ((await detail.json()) as { lessons: Array<{ speech: Record<string, string>; draftSpeech: unknown }> }).lessons[0]!;
    expect(preloaded.draftSpeech).toBeNull();
    expect(preloaded.speech[`example:${draftOnly.id}`]).toBeUndefined();
    expect(Object.keys(preloaded.speech)).toHaveLength(5);
  });

  it("calls Azure once for the same text in two lessons and two groups, and keeps each group's reads to its own items", async () => {
    const first = await setup("share-a"); const second = await setup("share-b");
    const shared = "Het water is koud.";
    const a1 = await addLesson(first.groupId, first.courseId, first.owner, "A1", { document: documentOf(blocks.example(shared), blocks.example("Alleen in groep A.")) });
    const a2 = await addLesson(first.groupId, first.courseId, first.owner, "A2", { document: documentOf(blocks.example(shared)) });
    const sharedBlock = blocks.example(shared);
    const b1 = await addLesson(second.groupId, second.courseId, second.owner, "B1", { document: documentOf(sharedBlock) });
    const azure = fakeAzure();
    await runSpeechJobs(env, { synthesize: azure.synthesize });
    expect(azure.calls.filter((ssml) => ssml.includes(shared))).toHaveLength(1);
    expect(azure.calls).toHaveLength(2);
    // Group B hears the shared clip, but only under its own item keys.
    const bView = await readLesson(b1.path, second.learner);
    expect(bView.speech).toEqual({ [`example:${sharedBlock.id}`]: `https://wordinator.test/api/media/${speechClipKey(await narrator(shared))}` });
    expect(Object.keys((await readLesson(a1.path, first.learner)).speech)).toHaveLength(2);
    expect(Object.keys((await readLesson(a2.path, first.learner)).speech)).toHaveLength(1);
    // Another group's lesson is never reachable, neither directly nor nested under this group's course.
    expect((await request(a1.path, second.learner)).status).toBe(404);
    expect((await request(lessonPath(second.groupId, second.courseId, a1.lesson.id), second.learner)).status).toBe(404);
  });

  it("denies speech reads to non-members and former members", async () => {
    const { groupId, courseId, owner, learnerId } = await setup("denied");
    const { path } = await addLesson(groupId, courseId, owner, "Lesson", { document: documentOf(blocks.example("Hallo.")) });
    await runSpeechJobs(env, { synthesize: fakeAzure().synthesize });
    await seedUser("denied-outsider");
    expect((await request(path, await signIn("denied-outsider"))).status).toBe(404);
    const learner = await signIn("denied-learner");
    await env.DB.prepare("UPDATE memberships SET state = 'left' WHERE group_id = ? AND user_id = ?").bind(groupId, learnerId).run();
    expect((await request(path, learner)).status).toBe(404);
    expect((await request(`${coursePath(groupId, courseId)}/words`, learner)).status).toBe(404);
  });

  it("lets only one of two concurrent runs synthesize each clip", async () => {
    const { groupId, courseId, owner } = await setup("concurrent");
    await addLesson(groupId, courseId, owner, "Lesson", { document: documentOf(blocks.example("Een."), blocks.example("Twee."), blocks.example("Drie.")) });
    const azure = fakeAzure();
    await Promise.all([runSpeechJobs(env, { synthesize: azure.synthesize }), runSpeechJobs(env, { synthesize: azure.synthesize })]);
    expect(azure.calls).toHaveLength(3);
    expect(new Set(azure.calls).size).toBe(3);
  });

  it("retakes a claim only after its lease expires", async () => {
    const { groupId, courseId, owner } = await setup("lease");
    const { lesson, path } = await addLesson(groupId, courseId, owner, "Lesson", { document: documentOf(blocks.example("Vastgelopen.")) });
    const hash = await narrator("Vastgelopen.");
    const now = Date.now();
    await env.DB.prepare("INSERT INTO speech_clips (hash, voice, characters, status, attempts, claimed_at, created_at, updated_at) VALUES (?, 'nl-NL-FennaNeural', 12, 'pending', 0, ?, ?, ?)")
      .bind(hash, now, now, now).run();
    const azure = fakeAzure();
    await runSpeechJobs(env, { synthesize: azure.synthesize });
    expect(azure.calls).toHaveLength(0);
    // The job waits for the lease instead of staying due.
    expect((await job(lesson.id))!.dueAt).toBe(now + SPEECH_CLAIM_LEASE_MS);
    await runSpeechJobs(env, { synthesize: azure.synthesize, now: () => now + SPEECH_CLAIM_LEASE_MS });
    expect(azure.calls).toHaveLength(1);
    expect((await clip(hash))!.status).toBe("ready");
    expect(Object.keys((await readLesson(path, owner)).speech)).toHaveLength(1);
  });

  it("retries failed clips with growing delays and marks them failed after 5 attempts", async () => {
    const { groupId, courseId, owner } = await setup("retries");
    const { lesson, path } = await addLesson(groupId, courseId, owner, "Lesson", { document: documentOf(blocks.example("Mislukt.")) });
    const hash = await narrator("Mislukt.");
    const azure = fakeAzure(() => failure("failed", 500));
    let now = Date.now();
    const delays: number[] = [];
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await runSpeechJobs(env, { synthesize: azure.synthesize, now: () => now });
      const row = (await clip(hash))!;
      expect(row.attempts).toBe(attempt);
      if (attempt < 5) {
        delays.push(row.nextAttemptAt! - now);
        // Not retried before its delay.
        await runSpeechJobs(env, { synthesize: azure.synthesize, now: () => now + 1 });
        expect(azure.calls).toHaveLength(attempt);
        now = row.nextAttemptAt!;
      } else {
        expect(row.status).toBe("failed");
      }
    }
    expect(delays).toEqual([60_000, 120_000, 240_000, 480_000]);
    expect(await job(lesson.id)).toBeNull();
    const view = await readLesson(path, owner);
    expect(view.speech).toEqual({});
    expect(Object.values(view.draftSpeech!)).toEqual([{ status: "failed", url: null }]);
  });

  it("stops the whole run on 429 without counting an attempt", async () => {
    const { groupId, courseId, owner } = await setup("throttle");
    const { lesson } = await addLesson(groupId, courseId, owner, "Lesson", { document: documentOf(blocks.example("Een."), blocks.example("Twee.")) });
    const azure = fakeAzure(() => failure("throttled", 429));
    const result = await runSpeechJobs(env, { synthesize: azure.synthesize });
    expect(result).toMatchObject({ stopped: "throttled", synthesized: 0 });
    expect(azure.calls).toHaveLength(1);
    expect(await clip(await narrator("Een."))).toMatchObject({ status: "pending", attempts: 0, claimedAt: null });
    expect((await job(lesson.id))!.dueAt).toBeGreaterThan(Date.now());
  });
});

describe("Azure client", () => {
  it("classifies throttling, refused keys, server errors, and network failures without exposing text", async () => {
    const respond = (status: number, headers: Record<string, string> = {}) => azureSynthesizer("key", "germanywestcentral", (async () => new Response(status === 200 ? new Uint8Array([1]) : "nope", { status, headers })) as typeof fetch);
    expect(await respond(200)("<speak/>")).toMatchObject({ ok: true });
    expect(await respond(429, { "retry-after": "5" })("<speak/>")).toEqual({ ok: false, kind: "throttled", status: 429, retryAfterMs: 5_000 });
    expect(await respond(401)("<speak/>")).toMatchObject({ ok: false, kind: "unauthorized" });
    expect(await respond(503)("<speak/>")).toMatchObject({ ok: false, kind: "failed", status: 503 });
    const offline = azureSynthesizer("key", "germanywestcentral", (async () => { throw new TypeError("network"); }) as typeof fetch);
    expect(await offline("<speak/>")).toEqual({ ok: false, kind: "failed", status: null, retryAfterMs: null });
    let seen: Request | null = null;
    await azureSynthesizer("secret", "germanywestcentral", (async (input: RequestInfo | URL, init?: RequestInit) => { seen = new Request(input, init); return new Response(new Uint8Array([1])); }) as typeof fetch)("<speak/>");
    expect(seen!.url).toBe("https://germanywestcentral.tts.speech.microsoft.com/cognitiveservices/v1");
    expect(seen!.headers.get("x-microsoft-outputformat")).toBe("audio-24khz-96kbitrate-mono-mp3");
    expect(seen!.headers.get("ocp-apim-subscription-key")).toBe("secret");
  });
});

describe("Dialogue cast and pronunciation overrides", () => {
  it("lets only the owner set a cast with the group's voices, and regenerates every lesson's turns", async () => {
    const { groupId, courseId, owner, contributor } = await setup("cast");
    const turns = { id: crypto.randomUUID(), type: "dialogue" as const, props: { turns: JSON.stringify([{ speaker: "Anna", text: "Hoi!" }]) }, children: [] };
    const first = await addLesson(groupId, courseId, owner, "One", { document: documentOf(turns) });
    const second = await addLesson(groupId, courseId, owner, "Two", { published: false });
    const azure = fakeAzure();
    await runSpeechJobs(env, { synthesize: azure.synthesize });
    expect(azure.calls[0]).toContain("nl-NL-ColetteNeural");
    const details = { title: "Dutch foundations", summary: "Built together." };
    expect(await errorCode(await request(coursePath(groupId, courseId), contributor, { ...details, speechCast: { Anna: "nl-NL-MaartenNeural" } }, "PATCH"))).toBe("COURSE_EDIT_FORBIDDEN");
    expect(await errorCode(await request(coursePath(groupId, courseId), owner, { ...details, speechCast: { Anna: "de-DE-ConradNeural" } }, "PATCH"))).toBe("SPEECH_VOICE_INVALID");
    expect((await request(coursePath(groupId, courseId), owner, { ...details, speechCast: { Anna: "<voice/>" } }, "PATCH")).status).toBe(400);

    // Saving details without a cast keeps the cast and queues nothing.
    expect((await request(coursePath(groupId, courseId), owner, details, "PATCH")).status).toBe(200);
    expect(await job(first.lesson.id)).toBeNull();
    const updated = await request(coursePath(groupId, courseId), owner, { ...details, speechCast: { " Anna ": "nl-NL-MaartenNeural" } }, "PATCH");
    expect(courseResponseSchema.parse(await updated.json()).course.speechCast).toEqual({ Anna: "nl-NL-MaartenNeural" });
    expect((await job(first.lesson.id))!.dueAt).toBeLessThanOrEqual(Date.now());
    expect(await job(second.lesson.id)).not.toBeNull();
    // Until the job runs, the turn's new clip is not ready, so it has no URL.
    expect((await readLesson(first.path, owner)).speech).toEqual({});
    await runSpeechJobs(env, { synthesize: azure.synthesize });
    expect(azure.calls.at(-1)).toContain("nl-NL-MaartenNeural");
    expect(Object.keys((await readLesson(first.path, owner)).speech)).toEqual([`turn:${turns.id}:0`]);
    // The same cast again changes nothing.
    await runSpeechJobs(env, { synthesize: azure.synthesize });
    await request(coursePath(groupId, courseId), owner, { ...details, speechCast: { Anna: "nl-NL-MaartenNeural" } }, "PATCH");
    expect(await job(first.lesson.id)).toBeNull();
  });

  it("refuses IPA markup, applies a valid IPA to the term clip only, and serves word speech on recaps and bookmarks", async () => {
    const { groupId, courseId, owner, learner } = await setup("ipa");
    const { lesson, path } = await addLesson(groupId, courseId, owner, "Draft", { published: false });
    const injected = word("voorkomen", { ipa: 'voː"/><break time="10s"/>' });
    const refused = await request(`${path}/draft`, owner, { document: documentOf(blocks.vocabulary(injected)), draftVersion: lesson.draft!.version }, "PUT");
    expect(refused.status).toBe(400);

    const occur = word("voorkomen", { ipa: "ˈvoːrkoːmə", example: "Dat kan voorkomen." });
    const saved = await saveDraft(path, owner, documentOf(blocks.vocabulary(occur)), lesson.draft!.version);
    await publishLesson(path, owner, saved.draftVersion);
    const azure = fakeAzure();
    await runSpeechJobs(env, { synthesize: azure.synthesize });
    expect(azure.calls.filter((ssml) => ssml.includes('<phoneme alphabet="ipa" ph="ˈvoːrkoːmə">voorkomen</phoneme>'))).toHaveLength(1);
    expect(azure.calls.filter((ssml) => ssml.includes("phoneme"))).toHaveLength(1);
    const termUrl = `https://wordinator.test/api/media/${speechClipKey(await narrator("voorkomen", "ˈvoːrkoːmə"))}`;
    const exampleUrl = `https://wordinator.test/api/media/${speechClipKey(await narrator("Dat kan voorkomen."))}`;

    await request(`${path}/completion`, learner, {}, "PUT");
    const recap = courseWordsResponseSchema.parse(await (await request(`${coursePath(groupId, courseId)}/words`, learner)).json()).words;
    expect(recap).toEqual([expect.objectContaining({ id: occur.id, speech: { term: termUrl, example: exampleUrl } })]);
    expect(recap[0]).not.toHaveProperty("ipa");
    expect((await request(`${path}/words/${occur.id}/bookmark`, learner, {}, "PUT")).status).toBe(200);
    const bookmarks = wordBookmarkPageSchema.parse(await (await request(`/api/groups/${groupId}/word-bookmarks`, learner)).json());
    expect(bookmarks.items[0]!.word.speech).toEqual({ term: termUrl, example: exampleUrl });
  });

  it("speaks German lessons with German voices", async () => {
    const { groupId, courseId, owner } = await setup("german");
    await env.DB.prepare("UPDATE groups SET language = 'de' WHERE id = ?").bind(groupId).run();
    await addLesson(groupId, courseId, owner, "Lektion", { document: documentOf(blocks.example("Der Hund bellt.")) });
    const azure = fakeAzure();
    await runSpeechJobs(env, { synthesize: azure.synthesize });
    expect(azure.calls[0]).toContain('<voice name="de-DE-KatjaNeural">');
    expect(azure.calls[0]).toContain('xml:lang="de-DE"');
  });
});
