import { app, sweepLessonMedia, type Bindings } from "./app";

export default {
  fetch: app.fetch,
  // The daily cron trigger in wrangler.jsonc removes lesson images no document references any more.
  scheduled: (_controller, env, context) => { context.waitUntil(sweepLessonMedia(env).then(() => undefined)); },
} satisfies ExportedHandler<Bindings>;
