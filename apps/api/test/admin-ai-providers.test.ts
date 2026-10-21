import { env } from "cloudflare:test";
import { aiProviderTestResponseSchema, aiProvidersResponseSchema } from "@wordinator/contracts/ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errorCode, resetDatabase, seedUser, signIn } from "./courseApi";
import { fetchWorker } from "./worker";

// Superuser provider status and connection test (docs/settings-and-administration.md#ai-providers). Provider HTTP is stubbed
// with fetch or a Workers AI binding stub; no real provider is called.

const AZURE_KEY = "AZ-KEY-VALUE-0123456789abcdef";
const OPENROUTER_KEY = "sk-or-test-key-1234567890";
const ENDPOINT = "https://wordinator-foundry.services.ai.azure.com/openai/v1?api-version=preview";
const SECRET_BITS = [AZURE_KEY, OPENROUTER_KEY, "/openai/v1", "api-version", "wordinator-foundry.services.ai.azure.com/"];
const keys = { AZURE_AI_ENDPOINT: ENDPOINT, AZURE_AI_KEY: AZURE_KEY, OPENROUTER_API_KEY: OPENROUTER_KEY };

const call = (method: "GET" | "POST", path: string, options: { cookie?: string; body?: unknown; raw?: string; extraEnv?: Parameters<typeof fetchWorker>[2] } = {}) => fetchWorker(
  `https://wordinator.test${path}`,
  {
    method,
    headers: { ...(options.cookie ? { cookie: options.cookie } : {}), ...(options.body !== undefined || options.raw !== undefined ? { "content-type": "application/json" } : {}) },
    body: options.raw ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined),
  },
  options.extraEnv,
);

const sse = (blocks: unknown[]) => new Response(blocks.map((block) => `data: ${JSON.stringify(block)}\n\n`).join("") + "data: [DONE]\n\n", {
  headers: { "content-type": "text/event-stream" },
});
const replyOk = () => sse([{ choices: [{ index: 0, delta: { content: "OK" }, finish_reason: null }] }, { choices: [{ index: 0, delta: {}, finish_reason: "stop" }] }]);

let fetched: Array<{ url: string; body: string }> = [];
function stubFetch(answer: (url: string) => Response) {
  fetched = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    fetched.push({ url: String(input), body: String(init?.body ?? "") });
    return answer(String(input));
  }));
}

beforeEach(async () => {
  await resetDatabase();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

// A superuser with a username, so setup is complete and only the flag decides access.
async function superuser() {
  const userId = await seedUser("admin");
  await env.DB.prepare("UPDATE users SET is_superuser = 1, username = 'admin_user' WHERE id = ?").bind(userId).run();
  return { userId, cookie: await signIn("admin") };
}

describe("superuser access to provider routes", () => {
  it("refuses anonymous requests with 401 on both routes", async () => {
    for (const [method, path] of [["GET", "/api/admin/ai-providers"], ["POST", "/api/admin/ai-providers/test"]] as const) {
      const response = await call(method, path, method === "POST" ? { body: { provider: "azure", model: "gpt-4.1-mini" } } : {});
      expect(response.status, path).toBe(401);
      expect(await errorCode(response)).toBe("AUTH_REQUIRED");
    }
  });

  it("refuses ordinary accounts with 403 SUPERUSER_REQUIRED on both routes", async () => {
    const learnerId = await seedUser("learner");
    await env.DB.prepare("UPDATE users SET username = 'learner_user' WHERE id = ?").bind(learnerId).run();
    const learner = await signIn("learner");
    stubFetch(replyOk);
    const get = await call("GET", "/api/admin/ai-providers", { cookie: learner, extraEnv: keys });
    expect(get.status).toBe(403);
    expect(await errorCode(get)).toBe("SUPERUSER_REQUIRED");
    const test = await call("POST", "/api/admin/ai-providers/test", { cookie: learner, body: { provider: "openrouter", model: "openai/gpt-oss-120b:free" }, extraEnv: keys });
    expect(test.status).toBe(403);
    expect(await errorCode(test)).toBe("SUPERUSER_REQUIRED");
    expect(fetched).toHaveLength(0);
  });
});

describe("GET /api/admin/ai-providers", () => {
  it("reports presence per provider and the Azure host only, never a secret", async () => {
    const { cookie } = await superuser();
    const response = await call("GET", "/api/admin/ai-providers", { cookie, extraEnv: keys });
    expect(response.status).toBe(200);
    const text = await response.text();
    for (const secret of SECRET_BITS) expect(text).not.toContain(secret);
    const body = aiProvidersResponseSchema.parse(JSON.parse(text));
    expect(body.providers).toEqual([
      { provider: "openrouter", credentialsPresent: true, endpointHost: null },
      { provider: "workers_ai", credentialsPresent: false, endpointHost: null },
      { provider: "azure", credentialsPresent: true, endpointHost: "wordinator-foundry.services.ai.azure.com" },
    ]);
  });

  it("reports missing credentials, and Azure without its key as absent", async () => {
    const { cookie } = await superuser();
    const response = await call("GET", "/api/admin/ai-providers", { cookie, extraEnv: { AZURE_AI_ENDPOINT: ENDPOINT, AI: { run: async () => null } } });
    const body = aiProvidersResponseSchema.parse(await response.json());
    expect(body.providers).toEqual([
      { provider: "openrouter", credentialsPresent: false, endpointHost: null },
      { provider: "workers_ai", credentialsPresent: true, endpointHost: null },
      { provider: "azure", credentialsPresent: false, endpointHost: "wordinator-foundry.services.ai.azure.com" },
    ]);
  });
});

describe("POST /api/admin/ai-providers/test", () => {
  it("sends one small request to the chosen provider only and reports a reply", async () => {
    const { userId, cookie } = await superuser();
    stubFetch(replyOk);
    const response = await call("POST", "/api/admin/ai-providers/test", { cookie, body: { provider: "openrouter", model: "openai/gpt-oss-120b:free" }, extraEnv: keys });
    expect(response.status).toBe(200);
    const result = aiProviderTestResponseSchema.parse(await response.json());
    expect(result).toMatchObject({ ok: true, status: 200, message: "OK" });
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    // One request, to OpenRouter only, with the fixed prompt and a five-token cap.
    expect(fetched).toHaveLength(1);
    expect(fetched[0]!.url).toBe("https://openrouter.ai/api/v1/chat/completions");
    const sent = JSON.parse(fetched[0]!.body) as { model: string; max_tokens: number; messages: Array<{ content: string }> };
    expect(sent).toMatchObject({ model: "openai/gpt-oss-120b:free", max_tokens: 5 });
    expect(sent.messages.map((message) => message.content)).toEqual(["Reply with OK."]);
    // Tests are not metered: no ai_usage row, so no cap moves.
    const usage = await env.DB.prepare("SELECT COUNT(*) AS count FROM ai_usage WHERE user_id = ?").bind(userId).first<{ count: number }>();
    expect(usage?.count).toBe(0);
  });

  it("surfaces an OpenRouter 404 message and redacts keys in it", async () => {
    const { cookie } = await superuser();
    stubFetch(() => new Response(JSON.stringify({
      error: { message: `This model is unavailable for this key ${OPENROUTER_KEY} and Bearer abcdef.ghijkl`, code: 404 },
    }), { status: 404, headers: { "content-type": "application/json" } }));
    const response = await call("POST", "/api/admin/ai-providers/test", { cookie, body: { provider: "openrouter", model: "vendor/gone:free" }, extraEnv: keys });
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).not.toContain(OPENROUTER_KEY);
    expect(text).not.toContain("abcdef.ghijkl");
    const result = aiProviderTestResponseSchema.parse(JSON.parse(text));
    expect(result.ok).toBe(false);
    expect(result.status).toBe(404);
    // The Bearer token and the key are both replaced; the provider's words around them stay.
    expect(result.message).toBe("This model is unavailable for this key [redacted] and [redacted]");
  });

  it("truncates a long provider message to 300 characters and falls back to the status when the body is not JSON", async () => {
    const { cookie } = await superuser();
    stubFetch(() => new Response(JSON.stringify({ error: { message: "unavailable model. ".repeat(60) } }), { status: 400 }));
    const long = aiProviderTestResponseSchema.parse(await (await call("POST", "/api/admin/ai-providers/test", { cookie, body: { provider: "openrouter", model: "a/b" }, extraEnv: keys })).json());
    expect(long.ok).toBe(false);
    expect(long.message).toHaveLength(300);

    stubFetch(() => new Response("<html>gateway</html>", { status: 502 }));
    const html = aiProviderTestResponseSchema.parse(await (await call("POST", "/api/admin/ai-providers/test", { cookie, body: { provider: "openrouter", model: "a/b" }, extraEnv: keys })).json());
    expect(html).toMatchObject({ ok: false, status: 502, message: "The provider answered with HTTP 502." });
  });

  it("reports a network failure with no HTTP status", async () => {
    const { cookie } = await superuser();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("connection reset"); }));
    const result = aiProviderTestResponseSchema.parse(await (await call("POST", "/api/admin/ai-providers/test", { cookie, body: { provider: "openrouter", model: "a/b" }, extraEnv: keys })).json());
    expect(result).toMatchObject({ ok: false, status: null, message: "The request did not reach the provider." });
  });

  it("reports a missing credential without calling anything", async () => {
    const { cookie } = await superuser();
    stubFetch(replyOk);
    const result = aiProviderTestResponseSchema.parse(await (await call("POST", "/api/admin/ai-providers/test", { cookie, body: { provider: "azure", model: "gpt-4.1-mini" }, extraEnv: {} })).json());
    expect(result).toMatchObject({ ok: false, status: null, message: "No credentials are set for this provider." });
    expect(fetched).toHaveLength(0);
  });

  it("shows the Workers AI binding's own error message", async () => {
    const { cookie } = await superuser();
    const AI = { run: async () => { throw new Error("Model not found in this account"); } };
    const result = aiProviderTestResponseSchema.parse(await (await call("POST", "/api/admin/ai-providers/test", { cookie, body: { provider: "workers_ai", model: "@cf/nope/nope" }, extraEnv: { AI } })).json());
    expect(result).toMatchObject({ ok: false, status: null, message: "Model not found in this account" });
  });

  it("refuses a model ID that is not in the ID format with 400 and calls nothing", async () => {
    const { cookie } = await superuser();
    stubFetch(replyOk);
    for (const model of ["has space", "bad\"model", "", "x".repeat(201)]) {
      const response = await call("POST", "/api/admin/ai-providers/test", { cookie, body: { provider: "openrouter", model }, extraEnv: keys });
      expect(response.status, model).toBe(400);
      expect(await errorCode(response)).toBe("VALIDATION_ERROR");
    }
    const unknown = await call("POST", "/api/admin/ai-providers/test", { cookie, body: { provider: "anthropic", model: "claude" }, extraEnv: keys });
    expect(unknown.status).toBe(400);
    expect(await errorCode(unknown)).toBe("VALIDATION_ERROR");
    const notJson = await call("POST", "/api/admin/ai-providers/test", { cookie, raw: "{nope", extraEnv: keys });
    expect(notJson.status).toBe(400);
    expect(await errorCode(notJson)).toBe("INVALID_JSON");
    expect(fetched).toHaveLength(0);
  });
});
