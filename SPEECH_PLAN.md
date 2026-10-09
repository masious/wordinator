# Speech plan (C10)

Working plan for lesson speech: background-generated audio for new words, examples, and dialogues. The rules live in [docs/speech.md](docs/speech.md); this file holds the delivery steps only and links to the owners instead of restating rules. Phase status is mirrored in [docs/roadmap.md](docs/roadmap.md#course-phases).

Decisions agreed (2026-10-09):

- Azure AI Speech neural voices (`nl-NL-FennaNeural` and the other voices listed in [voices](docs/speech.md#voices)), chosen after listening tests; the earlier Kokoro-based API had no Dutch voice.
- The "no analytics, third-party tracking, or AI features" rule was removed from `AGENTS.md` and `CLAUDE.md`; sending lesson text to Microsoft is accepted.
- Clips are content-addressed (voice + synthesis markup), so the lesson or context never changes a clip and Azure is called once per distinct clip. Meaning-dependent stress is fixed by an optional per-word IPA override.
- Generation is strictly background: publish, draft save (debounced), and cast changes queue a lesson job; a per-minute cron synthesizes. Playing never calls Azure.
- The owner and active contributors hear draft audio. Dialogue voices come from a course-level cast.

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done

## C10.0 — Docs and decisions

- [x] `docs/speech.md` created and indexed; `docs/what_is_it.md` non-goals updated; `docs/courses.md` text-to-speech moved out of Deferred; `docs/data-model.md` planned tables; `docs/security-and-privacy.md` lesson speech; `docs/roadmap.md` C10 phase and backlog; `plan.md` later-work line.

## C10a — Generation pipeline (contracts, data, worker)

- [x] Spike (2026-10-09): the regional TTS endpoint `https://germanywestcentral.tts.speech.microsoft.com/cognitiveservices/v1` works with the resource key (the multi-service `germanywestcentral.api.cognitive.microsoft.com` endpoint is not needed), from Node and from a local Worker (`wrangler dev --test-scheduled`, 40 clips in one cron run, served back as `audio/mpeg`). `audio-24khz-96kbitrate-mono-mp3` returns MP3 at 12 KB/s. A bad request is `400` with an empty body, a wrong key `401`. `mstts:silence` `Leading-exact`/`Tailing-exact` at `0ms` cut *water* from 1.87 s to 0.62 s, but Azure still pads some short words (plain *voorkomen*) to 1.87 s with about 1 s of trailing silence, and `Tailing` or `10ms` change nothing; accepted, noted in [speech](docs/speech.md#generation). IPA `phoneme` works for Dutch (*voorkomen* `ˈvoːrkoːmə` against `voːrˈkoːmə` differ audibly in stress) and German (*umfahren* `ʊmˈfaːʁən`). Calls take 250–1,500 ms.
- [x] Contracts: `SPEECH_VOICES` with the narrator first, `speechVoiceSchema`, `wordIpaSchema` (allowlist, 100 characters) as `ipa` on `vocabularyWordSchema`, `speechCastSchema` and `speechCast` on courses and the course update; `@wordinator/contracts/speech` with `spokenText`, `wordSpeechItems`, `dialogueVoices`, `speechItems`, `speechMarkup`, `speechSsml` (XML escaping), `speechClipHash` (Web Crypto), and `speechClipKey`; `speech` and `draftSpeech` on lessons, `speech` on course words and bookmarks.
- [x] Migration `0019_speech.sql` with `packages/db/src/schema.ts`: `speech_clips`, `speech_jobs`, `courses.speech_cast`, and `course_lesson_words.ipa`. `collectLessonWords` carries `ipa`. Applied locally only.
- [x] Azure client in `apps/api/src/speech.ts`: REST call, 15-second timeout, `429` (throttled), `401`/`403` (unauthorized), and other failures classified; logs statuses only.
- [x] Jobs: upsert on draft save (due in 2 minutes), on publish (due now, plus one background run through `waitUntil`), and on cast change (every lesson of the course, due now); lesson deletion removes the job, which also cascades.
- [x] Worker: per-minute cron next to the daily media sweep (`scheduled` dispatches by `controller.cron`); claim by insert, 10-minute lease expiry, 10 jobs and 40 clips per run, retries after 1, 2, 4, and 8 minutes, failed after 5 attempts, R2 `put` with `audio/mpeg` and an immutable cache header. `/api/media/*` serves `speech/` keys for local development.
- [x] Reads: `speech` for published items on lesson and course reads, `draftSpeech` with statuses for editors, `speech` on course words and bookmark pages; ready clips are one indexed lookup by hash per response.
- [x] Course details update accepts the cast (owner only), validated against the group language (`400 SPEECH_VOICE_INVALID`).
- [x] Workers tests (`course-speech.test.ts`, in the R2 config) and contract tests (`speech.test.ts`); see [testing](docs/testing.md).
- [x] Docs: `docs/speech.md`, `docs/architecture.md`, `docs/data-model.md`, `docs/courses.md`, `docs/operations.md` (secret, variable, cron, local runs, and backfill), `docs/testing.md`, `docs/security-and-privacy.md`, `docs/roadmap.md`.

## C10b — Playback

- [x] `SpeechButton` molecule with one shared audio element (starting a clip stops the current one), loading and error states, icon and sizes from design tokens, i18next labels.
- [x] Words: New words lists (`NewWords`, `LessonWords`, the reader's word list) and both sides of word cards in `WordRecap` (lesson recap, course recap, Words tab).
- [x] Examples: example blocks in `LessonDocument` and `LessonPlayer`; word examples on card backs and opened New words rows.
- [x] Dialogues: a button per turn and Play dialogue with the current turn marked, in the reader and the player.
- [x] Tests: RTL for hidden buttons while not ready, one clip at a time, Play dialogue order and stop; Playwright playing a word, an example, and a dialogue on desktop and mobile, with `mobile-layout.spec.ts` unchanged.
- [x] Docs: `docs/design-system.md` speaker button, `docs/user-flows.md`, `docs/testing.md`.

## C10c — Authoring

- [ ] Vocabulary form: Pronunciation (IPA) field with validation message, and the word's audio status (ready with a play button, pending, failed) from `draftSpeech`.
- [ ] Course details: cast editor listing the course's speakers (from its lessons' dialogues) with a voice select per speaker and a sample button per voice.
- [ ] Tests: RTL for the IPA field, status display, and cast editor; Playwright for setting an IPA and seeing the status change after the job runs (with the worker stubbed).
- [ ] Docs: `docs/courses.md` vocabulary form and course details, `docs/user-flows.md`, `docs/testing.md`, `docs/speech.md` and `docs/roadmap.md` status.

## Release

- [ ] Type-check, Vitest, RTL, Playwright, and production builds for web and API on the release commit.
- [ ] Rotate the Azure key shared during evaluation, then `wrangler secret put AZURE_SPEECH_KEY` (`AZURE_SPEECH_REGION` is already a variable in `apps/api/wrangler.jsonc`).
- [ ] Back up production D1, apply `0019` with an explicit `--remote`, deploy the API, then the web app.
- [ ] Backfill: queue a due job for every published lesson (lessons seeded directly into the database included), and watch the cron drain them.
- [ ] Smoke test: a Dutch word that is also English (*water*), an example, and a dialogue play with the expected voices; an IPA override changes a word's stress.
- [ ] Delete this file once C10 ships.
