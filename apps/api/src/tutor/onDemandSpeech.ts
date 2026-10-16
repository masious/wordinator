import { speechNarrator } from "@wordinator/contracts";
import type { SpeechUsageSurface } from "@wordinator/contracts/ai";
import { spokenText } from "@wordinator/contracts/speech";
import { TUTOR_SPAN_MAX } from "@wordinator/contracts/tutor";
import type { Context } from "hono";
import { aiErrorResponse, assertDailySpeechCap, readAiSettings, recordSpeechUsage } from "../ai";
import { apiError } from "../http";
import { azureSynthesizer, clipUrl, hashSpeechItems, onDemandClip } from "../speech";

// On-demand audio of stored text (docs/speech.md#on-demand-audio), shared by the tutor's message speech route and the AI
// practice dictation route. Callers read `text` from storage by ID and authorize first; nothing here accepts client text. The
// daily character cap is checked before the clip is looked up, and every served request (cache hits too) writes `speech_usage`.

export type StoredSpeechInput = { userId: string; text: string; language: "nl" | "de" | null; surface: SpeechUsageSurface };

export async function speakStoredText(context: Context, env: Env, input: StoredSpeechInput): Promise<Response> {
  const { userId, text, language } = input;
  const db = env.DB;
  if (text.length > TUTOR_SPAN_MAX) return apiError(context, 400, "SPAN_TOO_LONG", "This text is too long to play.");
  const { AZURE_SPEECH_KEY: key, AZURE_SPEECH_REGION: region } = env;
  if (!key || !region || !language) return apiError(context, 503, "SPEECH_UNAVAILABLE", "Audio is not available.");
  const spoken = spokenText(text);
  if (!spoken) return apiError(context, 404, "SPAN_NOT_FOUND", "There is nothing to play here.");
  const [item] = await hashSpeechItems([{ key: "tutor", voice: speechNarrator(language), text: spoken, ipa: null }]);
  const settings = await readAiSettings(db);
  try {
    await assertDailySpeechCap(db, userId, settings, spoken.length);
  } catch (error) {
    const response = aiErrorResponse(context, error); if (response) return response;
    throw error;
  }
  const clip = await onDemandClip(env, item!, azureSynthesizer(key, region));
  if (clip === "pending") return context.json({ status: "pending" as const }, 202);
  if (clip === "failed") return apiError(context, 503, "SPEECH_FAILED", "The audio could not be made. Try again later.");
  await recordSpeechUsage(db, { userId, surface: input.surface, clipHash: item!.hash, characters: spoken.length, cached: clip === "cached" });
  const base = env.PUBLIC_MEDIA_BASE_URL.replace(/\/$/, "");
  return context.json({ url: clipUrl((key) => `${base}/${key.split("/").map(encodeURIComponent).join("/")}`, item!.hash) });
}
