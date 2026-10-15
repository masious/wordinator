import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDatabase } from "./courseApi";
import { call, newConversation, readEvents, say, scriptedAi, seedLibrary } from "./tutorApi";

// On-demand synthesis of a tutor span (docs/speech.md#on-demand-audio) writes to R2, so it runs in the R2 configuration.
// Azure is a stubbed fetch; the first request synthesizes and stores the clip, the next one is a counted cache hit.

beforeEach(resetDatabase);
afterEach(() => vi.restoreAllMocks());

describe("on-demand synthesis", () => {
  it("synthesizes a span once, stores it, and serves it from the cache afterwards", async () => {
    const { learner } = await seedLibrary();
    const ai = scriptedAi([say("Zeg [[Fijne dag nog!]]")]);
    const conversationId = await newConversation(learner);
    const events = await readEvents(await call("POST", `/api/ai/conversations/${conversationId}/messages`, learner, { text: "Speak" }, { AI: ai.binding }));
    const done = events.find((event) => event.type === "done");
    const messageId = done?.type === "done" ? done.message.id : "";
    const azure = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      expect(String(input)).toBe("https://germanywestcentral.tts.speech.microsoft.com/cognitiveservices/v1");
      expect(String(init?.body)).toContain("Fijne dag nog!");
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    });
    const speechEnv = { AZURE_SPEECH_KEY: "test-key", AZURE_SPEECH_REGION: "germanywestcentral" };
    const path = `/api/ai/conversations/${conversationId}/messages/${messageId}/speech`;
    const first = await call("POST", path, learner, { spanIndex: 0 }, speechEnv);
    expect(first.status).toBe(200);
    const { url } = (await first.json()) as { url: string };
    const hash = url.match(/speech\/([0-9a-f]{64})\.mp3$/)![1]!;
    expect(azure).toHaveBeenCalledTimes(1);
    expect(await env.DB.prepare("SELECT status FROM speech_clips WHERE hash = ?").bind(hash).first()).toEqual({ status: "ready" });
    expect(await env.MEDIA.get(`speech/${hash}.mp3`)).not.toBeNull();

    const second = await call("POST", path, learner, { spanIndex: 0 }, speechEnv);
    expect(await second.json()).toEqual({ url });
    expect(azure).toHaveBeenCalledTimes(1);
    const usage = await env.DB.prepare("SELECT cached, characters FROM speech_usage ORDER BY created_at, rowid").all();
    expect(usage.results).toEqual([{ cached: 0, characters: 14 }, { cached: 1, characters: 14 }]);
  });
});
