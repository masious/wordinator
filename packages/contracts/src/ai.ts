import { z } from "zod";

// AI tutor provider settings and metering (C14f). docs/settings-and-administration.md#ai-settings owns the settings,
// docs/ai-tutor.md#usage-and-limits the caps, and docs/data-model.md the `ai_usage` and `speech_usage` rows.

export const AI_PROVIDERS = ["openrouter", "workers_ai", "azure"] as const;
export const aiProviderSchema = z.enum(AI_PROVIDERS);
export type AiProvider = z.infer<typeof aiProviderSchema>;

// The API checks a model ID's format, never the model's abilities: OpenRouter IDs (`vendor/model:free`), Workers AI IDs
// (`@cf/vendor/model`), and Azure deployment names all fit.
export const aiModelIdSchema = z.string().trim().min(1).max(200).regex(/^[A-Za-z0-9@][A-Za-z0-9@._:/-]*$/);

export const aiProviderSettingSchema = z.object({
  provider: aiProviderSchema,
  enabled: z.boolean(),
  model: aiModelIdSchema,
});
export type AiProviderSetting = z.infer<typeof aiProviderSettingSchema>;

export const AI_TURN_CAP_MAX = 500;
export const AI_SPEECH_CHAR_CAP_MAX = 100_000;

// The whole stored value of `platform_metadata.ai_settings`. `providers` is the fallback order: every provider exactly once,
// at least one enabled.
export const aiSettingsSchema = z.object({
  providers: z.array(aiProviderSettingSchema).length(AI_PROVIDERS.length)
    .refine((list) => new Set(list.map((item) => item.provider)).size === list.length, { message: "Each provider must appear once." })
    .refine((list) => list.some((item) => item.enabled), { message: "Turn on at least one provider." }),
  dailyTurnCap: z.number().int().min(0).max(AI_TURN_CAP_MAX),
  dailySpeechCharCap: z.number().int().min(0).max(AI_SPEECH_CHAR_CAP_MAX),
});
export type AiSettings = z.infer<typeof aiSettingsSchema>;

// Defaults used when the row is missing or invalid. The models are starting points the superuser replaces; each one
// supports tool calling at its provider. Azure leads because it calls tools most reliably; the free OpenRouter model is
// rate-limited, and Workers AI is the last fallback. Small models such as Llama 4 Scout tend to write tool calls as text.
export const DEFAULT_AI_SETTINGS: AiSettings = {
  providers: [
    { provider: "azure", enabled: true, model: "gpt-4.1-mini" },
    { provider: "openrouter", enabled: true, model: "openai/gpt-oss-120b:free" },
    { provider: "workers_ai", enabled: true, model: "@cf/openai/gpt-oss-120b" },
  ],
  dailyTurnCap: 40,
  dailySpeechCharCap: 5_000,
};

// Surfaces that request on-demand speech; `speech_usage.surface` holds one of them. `lesson_activity` is role-play dialogue audio.
export const SPEECH_USAGE_SURFACES = ["ai_message", "ai_practice", "lesson_activity"] as const;
export const speechUsageSurfaceSchema = z.enum(SPEECH_USAGE_SURFACES);
export type SpeechUsageSurface = z.infer<typeof speechUsageSurfaceSchema>;

// Error codes of the provider layer. A daily-limit refusal (`429`) carries `resetsAt`, the next UTC midnight in epoch ms.
export const AI_ERROR_CODES = ["AI_DAILY_LIMIT", "SPEECH_DAILY_LIMIT", "AI_UNAVAILABLE", "AI_REQUEST_FAILED"] as const;
export type AiErrorCode = (typeof AI_ERROR_CODES)[number];
export const aiLimitErrorSchema = z.object({
  error: z.object({
    code: z.enum(["AI_DAILY_LIMIT", "SPEECH_DAILY_LIMIT"]),
    message: z.string(),
    resetsAt: z.number().int(),
    requestId: z.string().optional(),
  }),
});
export type AiLimitErrorBody = z.infer<typeof aiLimitErrorSchema>;

// One `ai_usage` row as analytics reads it. Rows hold no prompt or answer text.
export const aiUsageRecordSchema = z.object({
  id: z.string(),
  userId: z.string(),
  conversationId: z.string().nullable(),
  provider: aiProviderSchema,
  model: z.string(),
  turnStart: z.boolean(),
  tokensIn: z.number().int().nonnegative(),
  tokensOut: z.number().int().nonnegative(),
  costMicroUsd: z.number().int().nonnegative(),
  ok: z.boolean(),
  createdAt: z.number().int(),
});
export type AiUsageRecord = z.infer<typeof aiUsageRecordSchema>;

export const speechUsageRecordSchema = z.object({
  id: z.string(),
  userId: z.string(),
  surface: speechUsageSurfaceSchema,
  clipHash: z.string(),
  characters: z.number().int().nonnegative(),
  cached: z.boolean(),
  createdAt: z.number().int(),
});
export type SpeechUsageRecord = z.infer<typeof speechUsageRecordSchema>;

// Superuser provider status and connection test (docs/settings-and-administration.md#ai-providers). Status reports only whether
// a provider's credentials are set and, for Azure, the endpoint's host; no secret, path, or query ever reaches the client.
export const aiProviderStatusSchema = z.object({
  provider: aiProviderSchema,
  credentialsPresent: z.boolean(),
  endpointHost: z.string().nullable(),
});
export type AiProviderStatus = z.infer<typeof aiProviderStatusSchema>;
export const aiProvidersResponseSchema = z.object({ providers: z.array(aiProviderStatusSchema).length(AI_PROVIDERS.length) });
export type AiProvidersResponse = z.infer<typeof aiProvidersResponseSchema>;

// One small request to one provider, with the model given. Its outcome is never metered and never counts toward a cap.
export const aiProviderTestRequestSchema = z.object({ provider: aiProviderSchema, model: aiModelIdSchema });
export type AiProviderTestRequest = z.infer<typeof aiProviderTestRequestSchema>;
export const AI_PROVIDER_TEST_MESSAGE_MAX = 300;
export const aiProviderTestResponseSchema = z.object({
  ok: z.boolean(),
  // The HTTP status the provider answered with, or null when no HTTP answer came (network, timeout, binding error).
  status: z.number().int().nullable(),
  latencyMs: z.number().int().nonnegative(),
  // On success the start of the reply (at most 40 characters); on failure the provider's error message, redacted and cut.
  message: z.string().max(AI_PROVIDER_TEST_MESSAGE_MAX),
});
export type AiProviderTestResponse = z.infer<typeof aiProviderTestResponseSchema>;
