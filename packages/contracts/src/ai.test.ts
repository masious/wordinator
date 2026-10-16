import { describe, expect, it } from "vitest";
import { aiModelIdSchema, aiSettingsSchema, DEFAULT_AI_SETTINGS } from "./ai";

// The default setting of one provider, by name: the default order may change.
const preset = (provider: string) => DEFAULT_AI_SETTINGS.providers.find((item) => item.provider === provider)!;

describe("aiSettingsSchema", () => {
  it("accepts the defaults", () => {
    expect(aiSettingsSchema.parse(DEFAULT_AI_SETTINGS)).toEqual(DEFAULT_AI_SETTINGS);
    expect(DEFAULT_AI_SETTINGS.dailyTurnCap).toBe(40);
    expect(DEFAULT_AI_SETTINGS.dailySpeechCharCap).toBe(5_000);
    expect(DEFAULT_AI_SETTINGS.providers.map((item) => item.provider)).toEqual(["azure", "openrouter", "workers_ai"]);
  });

  it("accepts a reordered list with providers turned off", () => {
    const providers = [preset("azure"), { ...preset("openrouter"), enabled: false }, preset("workers_ai")];
    expect(aiSettingsSchema.safeParse({ ...DEFAULT_AI_SETTINGS, providers }).success).toBe(true);
  });

  it("refuses duplicate, missing, or all-off providers", () => {
    const [first, second] = DEFAULT_AI_SETTINGS.providers;
    expect(aiSettingsSchema.safeParse({ ...DEFAULT_AI_SETTINGS, providers: [first, first, second] }).success).toBe(false);
    expect(aiSettingsSchema.safeParse({ ...DEFAULT_AI_SETTINGS, providers: [first, second] }).success).toBe(false);
    const allOff = DEFAULT_AI_SETTINGS.providers.map((item) => ({ ...item, enabled: false }));
    expect(aiSettingsSchema.safeParse({ ...DEFAULT_AI_SETTINGS, providers: allOff }).success).toBe(false);
    expect(aiSettingsSchema.safeParse({ ...DEFAULT_AI_SETTINGS, providers: [...DEFAULT_AI_SETTINGS.providers.slice(0, 2), { provider: "anthropic", enabled: true, model: "x" }] }).success).toBe(false);
  });

  it("bounds the caps", () => {
    for (const [dailyTurnCap, ok] of [[0, true], [500, true], [501, false], [-1, false], [1.5, false]] as const) {
      expect(aiSettingsSchema.safeParse({ ...DEFAULT_AI_SETTINGS, dailyTurnCap }).success).toBe(ok);
    }
    for (const [dailySpeechCharCap, ok] of [[0, true], [100_000, true], [100_001, false]] as const) {
      expect(aiSettingsSchema.safeParse({ ...DEFAULT_AI_SETTINGS, dailySpeechCharCap }).success).toBe(ok);
    }
  });

  it("checks the model ID's format", () => {
    for (const id of ["openai/gpt-oss-120b:free", "@cf/meta/llama-4-scout-17b-16e-instruct", "gpt-4.1-mini", "my_deployment"]) {
      expect(aiModelIdSchema.safeParse(id).success).toBe(true);
    }
    for (const id of ["", " ", "has space", "x".repeat(201), "<script>", "/leading-slash"]) {
      expect(aiModelIdSchema.safeParse(id).success).toBe(false);
    }
  });
});
