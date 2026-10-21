import { adminAnalyticsQuerySchema } from "@wordinator/contracts/admin";
import { aiProviderTestRequestSchema, aiSettingsSchema } from "@wordinator/contracts/ai";
import { Hono, type Context } from "hono";
import { createMiddleware } from "hono/factory";
import { readAiSettings, writeAiSettings } from "../ai";
import type { AuthUser } from "../auth";
import { apiError } from "../http";
import { aiProviderStatuses, testAiProvider } from "./aiProviders";
import { aiAnalytics, learningAnalytics, speechAnalytics, timeAnalytics } from "./analytics";

// Superuser routes (C14e, docs/settings-and-administration.md#superuser), mounted at `/api/admin` after the session
// middleware. Every route needs a signed-in, set-up account whose `users.is_superuser` is set; the flag is read with the
// session on each request, never trusted from the client.

type AdminEnvironment = { Bindings: Env; Variables: { user: AuthUser | null } };
const AI_SETTINGS_BODY_MAX = 16_384;
const AI_PROVIDER_TEST_BODY_MAX = 1_024;

const requireSuperuser = createMiddleware<AdminEnvironment>(async (context, next) => {
  const user = context.get("user");
  if (!user) return apiError(context, 401, "AUTH_REQUIRED", "Sign in to continue.");
  if (user.mustChangePassword) return apiError(context, 403, "PASSWORD_CHANGE_REQUIRED", "Change your password to continue.");
  if (!user.onboardingComplete) return apiError(context, 403, "ONBOARDING_REQUIRED", "Finish setting up your account to continue.");
  if (!user.isSuperuser) return apiError(context, 403, "SUPERUSER_REQUIRED", "This page is only available to the superuser.");
  await next();
});

function rangeOf(context: Context<AdminEnvironment>) {
  const parsed = adminAnalyticsQuerySchema.safeParse({ days: context.req.query("days") });
  return parsed.success ? parsed.data.days : null;
}
const invalidRange = (context: Context<AdminEnvironment>) => apiError(context, 400, "VALIDATION_ERROR", "Choose a range of 7, 30, or 90 days.");

export const adminRoutes = new Hono<AdminEnvironment>();
adminRoutes.use("*", requireSuperuser);

adminRoutes.get("/analytics/learning", async (context) => {
  const days = rangeOf(context); if (!days) return invalidRange(context);
  return context.json(await learningAnalytics(context.env.DB, days));
});

adminRoutes.get("/analytics/ai", async (context) => {
  const days = rangeOf(context); if (!days) return invalidRange(context);
  return context.json(await aiAnalytics(context.env.DB, days));
});

adminRoutes.get("/analytics/speech", async (context) => {
  const days = rangeOf(context); if (!days) return invalidRange(context);
  return context.json(await speechAnalytics(context.env.DB, days));
});

adminRoutes.get("/analytics/time", async (context) => {
  const days = rangeOf(context); if (!days) return invalidRange(context);
  return context.json(await timeAnalytics(context.env.DB, days));
});

adminRoutes.get("/ai-settings", async (context) => context.json(await readAiSettings(context.env.DB)));

// Replaces the whole value. Changes apply to the next tutor turn.
adminRoutes.put("/ai-settings", async (context) => {
  const raw = await context.req.text();
  if (new TextEncoder().encode(raw).byteLength > AI_SETTINGS_BODY_MAX) return apiError(context, 413, "REQUEST_TOO_LARGE", "The request is too large.");
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return apiError(context, 400, "INVALID_JSON", "The request body must be valid JSON."); }
  const parsed = aiSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return context.json({
      error: {
        code: "AI_SETTINGS_INVALID", message: "Check the AI settings and try again.",
        issues: parsed.error.issues.map((issue) => ({ path: issue.path.map(String), message: issue.message })),
        requestId: context.get("requestId"),
      },
    }, 400);
  }
  return context.json(await writeAiSettings(context.env.DB, parsed.data));
});

// Provider credentials as presence only (docs/settings-and-administration.md#ai-providers); no secret or endpoint path is returned.
adminRoutes.get("/ai-providers", (context) => context.json({ providers: aiProviderStatuses(context.env) }));

// One request through one provider, with the model given. Nothing is metered and nothing is stored (see admin/aiProviders.ts).
adminRoutes.post("/ai-providers/test", async (context) => {
  const raw = await context.req.text();
  if (new TextEncoder().encode(raw).byteLength > AI_PROVIDER_TEST_BODY_MAX) return apiError(context, 413, "REQUEST_TOO_LARGE", "The request is too large.");
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return apiError(context, 400, "INVALID_JSON", "The request body must be valid JSON."); }
  const parsed = aiProviderTestRequestSchema.safeParse(body);
  if (!parsed.success) return apiError(context, 400, "VALIDATION_ERROR", "Choose a provider and enter a valid model ID.");
  return context.json(await testAiProvider(context.env, parsed.data.provider, parsed.data.model));
});
