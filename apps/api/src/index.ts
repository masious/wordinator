import { app, sweepLessonMedia, type Bindings } from "./app";
import { runSpeechJobs } from "./speech";

// The cron triggers in wrangler.jsonc: every minute the speech worker synthesizes due lesson speech; once a day the media
// sweep removes lesson images no document references any more.
const SPEECH_CRON = "* * * * *";

export default {
  fetch: app.fetch,
  scheduled: (controller, env, context) => {
    context.waitUntil((controller.cron === SPEECH_CRON ? runSpeechJobs(env) : sweepLessonMedia(env)).then(() => undefined));
  },
} satisfies ExportedHandler<Bindings>;
