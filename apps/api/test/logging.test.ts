import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { app, type Bindings } from "../src/app";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("API logging", () => {
  it("logs actionable details for an internal error without logging the raw URL", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const bindings: Bindings = {
      DB: env.DB,
      MEDIA: env.MEDIA,
      PUBLIC_MEDIA_BASE_URL: "https://media.test",
      COOKIE_SIGNING_SECRET: "",
    };

    const response = await app.request("https://wordinator.test/api/session?secret=do-not-log", undefined, bindings);

    expect(response.status).toBe(500);
    expect(log).toHaveBeenCalledOnce();
    const entry = JSON.parse(String(log.mock.calls[0]?.[0])) as Record<string, unknown>;
    expect(entry).toMatchObject({
      level: "error",
      event: "request.failed",
      method: "GET",
      route: "/api/session",
      status: 500,
      errorCode: "INTERNAL_ERROR",
      errorName: "Error",
      errorMessage: "COOKIE_SIGNING_SECRET is not configured",
    });
    expect(entry.errorStack).toEqual(expect.stringContaining("COOKIE_SIGNING_SECRET is not configured"));
    expect(JSON.stringify(entry)).not.toContain("do-not-log");
  });
});
