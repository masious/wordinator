# Speech

Status: approved product change (C10, 2026-10-09), in progress: the generation pipeline (C10a) is implemented; playback (C10b) and authoring (C10c) are planned. Phases are tracked in the [roadmap](roadmap.md#course-phases); [SPEECH_PLAN.md](../SPEECH_PLAN.md) holds the delivery checklist.

Speech lets a learner hear a lesson's new words, example sentences, and dialogues read aloud in the group's target language. Audio is synthesized by Azure AI Speech neural voices, generated once per distinct text in the background, stored in R2, and played from there. It builds on [lesson documents](courses.md#lesson-documents) and [new words](courses.md#new-words-and-recap).

## What is spoken

| Item | Text spoken | Voice |
| --- | --- | --- |
| Word term | the word's `term`, as [spoken text](#spoken-text), or its [IPA](#pronunciation-override) when set | narrator |
| Word example | the word's `example` | narrator |
| Example block | the sentence's plain text (inline styles and links dropped); not the translation or note | narrator |
| Dialogue turn | the turn's `text`; never the speaker label | the speaker's [cast](#dialogue-cast) voice |

Nothing else is spoken: not forms, meanings, notes, callouts, paragraphs, practice prompts, posts, or comments.

## Voices

Voices are a fixed list per target language in the shared contracts, with one narrator voice per language:

| Language | Narrator | Other voices |
| --- | --- | --- |
| Dutch (`nl`) | `nl-NL-FennaNeural` | `nl-NL-ColetteNeural`, `nl-NL-MaartenNeural` |
| German (`de`) | `de-DE-KatjaNeural` | `de-DE-AmalaNeural`, `de-DE-ConradNeural`, `de-DE-KillianNeural` |

Only Netherlands and Germany voices are listed; Belgian, Austrian, and Swiss voices are left out for accent consistency. Changing the list is a product change.

## Dialogue cast

Characters recur across a course's lessons, so a course has a cast: a map from speaker label to voice, edited by the course owner with the course details. Speaker labels match trimmed and case-insensitively, so a cast may not hold two labels that differ only in case or surrounding space; labels are stored trimmed. A speaker without a cast entry takes the voice at their position among the dialogue's speakers in order of first appearance (cast speakers included), counted from the voice after the narrator and wrapping round the whole list, narrator included: in Dutch the first speaker is Colette, the second Maarten, the third Fenna. A cast voice of another language is ignored. Changing the cast regenerates the affected turns in the background; the old clips stay valid for any other course that uses them.

## Spoken text

A term is written for reading, not for speaking. A shared contracts helper turns it into the text that is spoken, and every caller uses that helper:

- Text in parentheses is dropped: `iets (inf.)` → `iets`.
- `/` and `·` between alternatives become a pause: `jij / je` → `jij, je`.
- `…` is dropped and whitespace collapses.
- Articles stay: `de keuken` is spoken with its article.
- Example sentences and dialogue turns are spoken as written.

Speech is generated without context: the same text and voice always produce the same clip, whichever lesson or group it comes from. Sentences carry their own intonation. A bare word is read in isolation, which is right except for words whose stress depends on meaning; those take a pronunciation override.

## Pronunciation override

A vocabulary word has an optional `ipa` field: an IPA transcription of the term, for words the voice would stress or pronounce wrongly, such as *voorkomen* ("to occur", `ˈvoːrkoːmə`) against *voorkomen* ("to prevent", `voːrˈkoːmə`). Wiktionary gives a transcription for most words.

- At most 100 characters, limited by the contracts to IPA letters and diacritics, stress and length marks, `.`, and spaces. Anything else is refused, so the field can never inject markup into the synthesis request.
- It applies to the word's term clip only. Example sentences and dialogue turns are never overridden.
- Authors edit it in the word's form, collapsed under "Pronunciation" like forms, example, and note. Learners never see it; they only hear its effect.
- An empty field means none.

## Generation

Generation is strictly background work. Opening or playing a lesson never calls Azure.

- **Clip identity.** A clip is identified by the SHA-256 hash of its schema version, voice, and the exact synthesis markup (spoken text or IPA). Its R2 key is `speech/{hash}.mp3`. Identical text with the same voice shares one clip across lessons, courses, and groups, so Azure is called once per distinct clip.
- **Jobs.** Each lesson has at most one pending speech job. Publishing a lesson makes its job due at once; saving a draft makes it due 2 minutes after the last save, so text typed in between is never synthesized; changing a course's cast makes the job of every lesson in the course due at once.
- **Worker.** A Cron Trigger runs every minute. It takes due jobs, collects the lesson's spoken items from its published document and its draft, and claims every clip that is not ready by inserting its row; a row that already exists is never synthesized again. It then synthesizes each claimed clip, writes the MP3 to R2, and marks the row ready. Each run synthesizes a bounded number of clips and leaves the rest of the job due for the next run. Publishing also starts one run in the background after its response.
- **Failures.** A failed clip is retried after 1, 2, 4, and 8 minutes and marked failed after 5 attempts. An Azure `429` response stops the whole run and pushes the job back by its `Retry-After`, or a minute. A claim that never finishes expires after 10 minutes and can be claimed again.
- **Retention.** Clips are content-addressed and shared, so editing, unpublishing, or deleting a lesson never deletes them. A deleted lesson's job is deleted with it.
- Leading and trailing silence is removed in the synthesis request (`mstts:silence` `Leading-exact` and `Tailing-exact`), so a word clip is about as long as the word. Azure still pads some short clips to about 1.9 seconds with trailing silence; playback is unaffected, since nothing follows a clip automatically except within Play dialogue.
- **Limits.** A run takes at most 10 due jobs and synthesizes at most 40 clips. A job waiting only on a retry or on another run's claim is pushed to that time instead of staying due. An Azure `401` or `403` (a refused key) stops the run like a `429`, without counting an attempt. Without `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION`, the worker does nothing and jobs stay due.

## Playback

- A speaker button follows each spoken item whose clip is ready; while a clip is pending or failed, its item shows no button. Read responses carry each ready item's clip URL, so the web never probes R2.
- **Where:** word terms in every New words list (the player's panel, the words step, the reader's word list, and the lesson page's New words panel) and on both sides of [word cards](words.md#word-cards) (lesson recap, course recap, and the Words tab); word examples on the card's back and in an opened New words row; example blocks in the reader and player; and each dialogue turn.
- A dialogue also has Play dialogue, which plays its ready turns in order and marks the turn being spoken; any other speaker button, or pressing it again, stops it.
- One clip plays at a time across the page; starting another stops the current one. Playback never autoplays.
- Learners hear published content. The owner and active contributors also hear their draft and preview, once its job has run, and the word form shows whether a word's audio is ready, pending, or failed.
- Every label is an i18next key, such as "Play pronunciation of {{term}}".

## Privacy

Spoken lesson text is sent to Microsoft Azure AI Speech, and clips are public-by-URL like lesson images; see [security and privacy](security-and-privacy.md#lesson-speech). Post, comment, practice answer, and profile text is never sent.

## API and data

- Lesson reads (`GET .../lessons/:lessonId`, and the lessons a course read includes) add `speech`, a map from item key to clip URL for ready clips only. Item keys are `word:{wordId}`, `wordExample:{wordId}`, `example:{blockId}`, and `turn:{blockId}:{index}`. Editors also receive `draftSpeech` for the draft, with each item's status (`pending`, `ready`, or `failed`) and its URL once ready; an item whose clip has never been claimed is pending. Learners receive `draftSpeech: null`. The course read returns `speechCast` with the course.
- Course words and word bookmark responses add each word's `speech: { term, example }` URLs, `null` while not ready.
- The course details update (`PATCH .../courses/:courseId`) accepts an optional `speechCast`; leaving it out keeps the cast, and an empty map clears it. It is owner only like the rest of the details, and a voice outside the group language's list is refused with `400 SPEECH_VOICE_INVALID`.
- No route accepts text to synthesize, and no route triggers synthesis directly.
- Data lives in [`speech_clips`](data-model.md#speech_clips) and [`speech_jobs`](data-model.md#speech_jobs); the cast is a column of [`courses`](data-model.md#courses), and the IPA is part of the word payload and of [`course_lesson_words`](data-model.md#course_lesson_words).
- Azure is called through its REST endpoint from the Worker, with the key as the `AZURE_SPEECH_KEY` secret and the region as the `AZURE_SPEECH_REGION` variable; see [operations](operations.md).
