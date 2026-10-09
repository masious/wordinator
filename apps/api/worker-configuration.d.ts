interface Env {
  DB: D1Database;
  COOKIE_SIGNING_SECRET: string;
  MEDIA: R2Bucket;
  PUBLIC_MEDIA_BASE_URL: string;
  // Lesson speech; without both, the speech worker does nothing and jobs stay due.
  AZURE_SPEECH_KEY?: string;
  AZURE_SPEECH_REGION?: string;
}
