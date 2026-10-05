interface Env {
  DB: D1Database;
  COOKIE_SIGNING_SECRET: string;
  MEDIA: R2Bucket;
  PUBLIC_MEDIA_BASE_URL: string;
}
