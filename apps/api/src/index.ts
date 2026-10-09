import { app, sweepLessonMedia, type Bindings } from "./app";
import { runSpeechJobs, runSpeechSamples } from "./speech";

// The cron triggers in wrangler.jsonc: every minute the speech worker synthesizes due lesson speech; once a day the media
// sweep removes lesson images no document references any more. Voice samples follow the jobs unless Azure stopped the run.
const SPEECH_CRON = "* * * * *";

export default {
  fetch: app.fetch,
  scheduled: (controller, env, context) => {
    const speech = async () => { const jobs = await runSpeechJobs(env); if (jobs && !jobs.stopped) await runSpeechSamples(env); };
    context.waitUntil(controller.cron === SPEECH_CRON ? speech() : sweepLessonMedia(env));
  },
} satisfies ExportedHandler<Bindings>;
