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

- [ ] Spike: call the Azure REST endpoint (`https://{region}.tts.speech.microsoft.com/cognitiveservices/v1`) with `fetch` from a local Worker, confirm the key and region work there (the resource lists the multi-service endpoint `germanywestcentral.api.cognitive.microsoft.com`), `audio-24khz-96kbitrate-mono-mp3` output, `mstts:silence` leading/trailing trimming, and an IPA `phoneme` for a Dutch and a German word. Record findings here.
- [ ] Contracts: voice lists and narrators per language; `ipa` on `vocabularyWordSchema` with its character allowlist and limit; course cast schema; `spokenText`, `speechItems(document, cast, language)` returning item keys with voice and markup, the SSML builder with XML escaping, and `speechClipHash` (Web Crypto, usable by API and tests); `speech` maps on lesson, course words, and bookmark responses.
- [ ] Migration `0019_speech.sql` with `packages/db/src/schema.ts`: `speech_clips`, `speech_jobs`, `courses.speech_cast`, and `course_lesson_words.ipa`, as in the data model. `collectLessonWords` carries `ipa`.
- [ ] Azure client in `apps/api`: REST call, timeout, `429` and `5xx` classification; never logs text or the key.
- [ ] Jobs: upsert on draft save (due in 2 minutes), on publish (due now, plus one background run through `waitUntil`), and on cast change (every lesson of the course, due now); jobs cascade from lessons.
- [ ] Worker: per-minute cron next to the daily media sweep (`scheduled` dispatches by `event.cron`); claim by insert, lease expiry, per-run clip cap, retries with backoff, failed after 5 attempts, R2 `put` with `audio/mpeg` and an immutable cache header.
- [ ] Reads: `speech` for published items on lesson and course reads, `draftSpeech` with statuses for editors, `speech` on course words and bookmark pages; a ready clip is a single indexed lookup by hash.
- [ ] Course details update accepts the cast (owner only), validated against the group language.
- [ ] Workers tests: tenant isolation (another group's lesson job never surfaces clips in this group's reads beyond its own items; nested IDs), learners never get `draftSpeech`, non-member and former-member denial, contributor refused on the cast, jobs debounced on draft save, one Azure call for the same text in two lessons and two groups, concurrent claims, lease expiry, retries, failed state, `429` backoff, lesson deletion removing the job, IPA validation refusing markup. Contract tests for `spokenText`, SSML escaping, and hashes.
- [ ] Docs: `docs/architecture.md` (cron, Azure binding, reads), `docs/data-model.md` status, `docs/courses.md` vocabulary `ipa` field and course cast, `docs/operations.md` secret, variable, cron, and backfill, `docs/testing.md`.

## C10b — Playback

- [ ] `SpeechButton` molecule with one shared audio element (starting a clip stops the current one), loading and error states, icon and sizes from design tokens, i18next labels.
- [ ] Words: New words lists (`NewWords`, `LessonWords`, the reader's word list) and both sides of word cards in `WordRecap` (lesson recap, course recap, Words tab).
- [ ] Examples: example blocks in `LessonDocument` and `LessonPlayer`; word examples on card backs and opened New words rows.
- [ ] Dialogues: a button per turn and Play dialogue with the current turn marked, in the reader and the player.
- [ ] Tests: RTL for hidden buttons while not ready, one clip at a time, Play dialogue order and stop; Playwright playing a word, an example, and a dialogue on desktop and mobile, with `mobile-layout.spec.ts` unchanged.
- [ ] Docs: `docs/design-system.md` speaker button, `docs/user-flows.md`, `docs/testing.md`.

## C10c — Authoring

- [ ] Vocabulary form: Pronunciation (IPA) field with validation message, and the word's audio status (ready with a play button, pending, failed) from `draftSpeech`.
- [ ] Course details: cast editor listing the course's speakers (from its lessons' dialogues) with a voice select per speaker and a sample button per voice.
- [ ] Tests: RTL for the IPA field, status display, and cast editor; Playwright for setting an IPA and seeing the status change after the job runs (with the worker stubbed).
- [ ] Docs: `docs/courses.md` vocabulary form and course details, `docs/user-flows.md`, `docs/testing.md`, `docs/speech.md` and `docs/roadmap.md` status.

## Release

- [ ] Type-check, Vitest, RTL, Playwright, and production builds for web and API on the release commit.
- [ ] Rotate the Azure key shared during evaluation, then `wrangler secret put AZURE_SPEECH_KEY` and set `AZURE_SPEECH_REGION`.
- [ ] Back up production D1, apply `0019` with an explicit `--remote`, deploy the API, then the web app.
- [ ] Backfill: queue a due job for every published lesson (lessons seeded directly into the database included), and watch the cron drain them.
- [ ] Smoke test: a Dutch word that is also English (*water*), an example, and a dialogue play with the expected voices; an IPA override changes a word's stress.
- [ ] Delete this file once C10 ships.
