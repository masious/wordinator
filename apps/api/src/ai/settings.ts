import { aiSettingsSchema, DEFAULT_AI_SETTINGS, type AiSettings } from "@wordinator/contracts/ai";

// The AI settings row (docs/settings-and-administration.md#ai-settings): `platform_metadata.ai_settings`, validated by the
// contracts on read and write. A missing or invalid row reads as the defaults.

export const AI_SETTINGS_KEY = "ai_settings";

export async function readAiSettings(db: D1Database): Promise<AiSettings> {
  const row = await db.prepare("SELECT value FROM platform_metadata WHERE key = ?").bind(AI_SETTINGS_KEY).first<{ value: string }>();
  if (!row) return DEFAULT_AI_SETTINGS;
  try {
    return aiSettingsSchema.safeParse(JSON.parse(row.value)).data ?? DEFAULT_AI_SETTINGS;
  } catch {
    return DEFAULT_AI_SETTINGS;
  }
}

// Replaces the whole value. Callers validate input with `aiSettingsSchema` first; this parses again so nothing invalid is stored.
export async function writeAiSettings(db: D1Database, settings: AiSettings, now = Date.now()): Promise<AiSettings> {
  const value = aiSettingsSchema.parse(settings);
  await db.prepare(
    "INSERT INTO platform_metadata (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
  ).bind(AI_SETTINGS_KEY, JSON.stringify(value), now).run();
  return value;
}
