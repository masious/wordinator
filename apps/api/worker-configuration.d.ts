interface Env {
  DB: D1Database;
  COOKIE_SIGNING_SECRET: string;
  MEDIA: R2Bucket;
  PUBLIC_MEDIA_BASE_URL: string;
  // Lesson speech; without both, the speech worker does nothing and jobs stay due.
  AZURE_SPEECH_KEY?: string;
  AZURE_SPEECH_REGION?: string;
  // AI tutor providers (C14f, docs/ai-tutor.md#providers-and-fallback); a missing key or binding skips that provider.
  AI?: WorkersAiBinding;
  OPENROUTER_API_KEY?: string;
  AZURE_AI_ENDPOINT?: string;
  AZURE_AI_KEY?: string;
}

// The part of the Workers AI binding the provider layer uses. Kept structural so tests can stub it; with `stream: true`
// the binding resolves to a server-sent-event byte stream.
interface WorkersAiBinding {
  run(model: string, inputs: Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown>;
}
