// The AI provider layer and metering (C14f). Routes import from here.
export { AI_FIRST_EVENT_TIMEOUT_MS, AI_REQUEST_TIMEOUT_MS, completeChat, streamChat, type AiStreamEvent, type StreamChatOptions } from "./client";
export { AiLimitError, AiRequestError, AiUnavailableError, aiErrorResponse } from "./errors";
export { availableProviders, azureChatUrl, configuredTargets, preferProvider, OPENROUTER_URL, type AiChatMessage, type AiChatRequest, type AiEnv, type AiToolDefinition } from "./providers";
export { AI_SETTINGS_KEY, readAiSettings, writeAiSettings } from "./settings";
export type { AiTokenUsage, AiToolCall } from "./stream";
export {
  AI_MODEL_PRICES, assertDailySpeechCap, assertDailyTurnCap, countDailySpeechCharacters, countDailyTurns, estimateCostMicroUsd,
  nextUtcMidnight, readTutorUsage, recordAiUsage, recordSpeechUsage, utcDayStart, type DailyAllowance, type SpeechUsageInput,
} from "./usage";
