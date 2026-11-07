# Conversation scenes

Status: approved for lesson dialogue scene pages on 2026-10-24; image production remains in progress. This document owns the image assets, decisions, and rollout plan. The learner behavior belongs to [courses](courses.md#dialogue-scene-pages). Image generation details belong to [illustrations](content/illustrations.md#gpt-image-2-trial).

## Where we want to get

A lesson's story dialogue becomes a scene instead of a list of turns:

- **Location background.** Each dialogue has an image of its location with no people in it. It sets the mood behind the paragraphs that open the lesson and stays behind the conversation.
- **Intro boxes.** The paragraphs before the first dialogue appear one at a time as boxes over the background. The learner brings the next one with a click, Space, or a Next button.
- **Cast portraits.** Each character has one portrait, shown like an icon beside their lines and later in an interactive component for reviewing the dialogue.
- **Lines that enter the scene.** The characters and their lines slide in from the sides, one line per click, Space, or Next.
- **Scene page.** Start lesson opens the first dialogue's scene for a new learner. Inline lesson dialogues stay in the reading page, each with an explicit link to its scene. Journal shares and the player keep their existing rendering.

All images keep the look of the scenes already published in production, so learners see one visual world.

## What we did

### Found where the production images come from (2026-10-23)

[illustrations](content/illustrations.md) documented only the FLUX.2 [pro] workflow. The images actually published from lesson 13-1 onwards are PNGs in `content/dutch-foundations/illustrations/candidates/picked/` (gitignored, 59 files) whose embedded provenance names ChatGPT and gpt-image; only the 11 JPGs for lessons 07–16 came from `illustrate.ts`. The published images live in R2, uploaded by hand through the lesson editor, so the picked folder is the only local copy and may differ by re-encoding.

### Decided the canon (2026-10-24)

- The production (gpt-image) look is canon. The FLUX reference sheets in `illustrations/refs/` are to be retired; `cast.json` and `refs/` still describe the FLUX look until a replacement is frozen.
- Sofia's curls are consistent across the picked scenes; her freckles are not (present in 23-a, faint in 21-b, absent in 26, 34, and 40), so they are not canon yet.

### Made gpt-image-2 available on Azure (2026-10-24)

Neither existing Foundry resource had an image model, and the model did not appear in the catalogue search: gpt-image models are offered only in some regions, and `wordinator-llm` is in East US, which is not one of them. A new resource, `woords2-resource`, in a supported region, now has the deployment `gpt-image-2`. Its endpoint and key are `AZURE_IMAGE_ENDPOINT`, `AZURE_IMAGE_API_KEY`, and `AZURE_IMAGE_DEPLOYMENT` in `apps/api/.dev.vars`. The regions, limits, and prices are in [illustrations](content/illustrations.md#gpt-image-2-trial).

### Generated the first location and portraits (2026-10-24)

From one picked scene, `part-iv-23-a-0.png` (Sofia and Karin at the office), the edit endpoint made:

- an empty office (1536×864): same room, Dom tower view in winter, fairy lights, mug and laptop, no people, no text, calendar blank;
- portraits of Sofia and Karin (1024×1024, plain cream background), true to the scene: Karin's silver streak and black glasses, Sofia's curls, hoops, and mustard cardigan.

Each call took 40–60 s at medium quality and cost roughly $0.04–0.06. The results are in `candidates/gpt-test/` (gitignored); compressed copies used by the prototype are in `apps/web/src/pages/TempConv/images/`.

### Generated a lesson without a picked scene (2026-10-24)

`11-b-de-rekening-alstublieft` (part II, Friday 2 October 2026, a restaurant dinner with Sofia, Noor, Daan, Lotte and a waiter) has no picked production scene, so its images were built from other lessons' picked scenes:

- the restaurant from a described place, with `part-iv-22-b-0.png` and `part-iv-21-a-0.png` for style only (autumn, no December decorations);
- each friend's portrait from one or two picked scenes where they appear (Sofia `20-b-1` + `22-b-1`, Noor `21-a-0` + `22-b-0`, Daan `20-b-1` + `22-b-0`, Lotte `22-b-1`), with a note that the story is in October;
- the waiter, who is not in `cast.json`, from a written description with `22-b-1` for style.

All six matched the production look on the first try. The resource allows about three concurrent requests; the rest fail with 429 and are retried. The originals are in `candidates/gpt-image/11-b-de-rekening-alstublieft/` (gitignored), compressed copies in `apps/web/src/pages/TempConv/images/11-b/`.

### Tried a scene with speaker masks (2026-10-24)

Instead of an empty location with portraits standing in front, 11-b's dialogue sits on a scene with all five speakers drawn in, and a grey mask per speaker dims everyone else while that person speaks.

- **Scene:** `scene` with the empty restaurant as the first reference and the portraits after it, with seats described per person (Daan and Sofia left, Noor and Lotte right, the waiter standing at the right edge). The result kept the room and every face; it took 45 s.
- **Masks:** `mask` on the scene, one per speaker, each with a note on where that person is. The model returned the same size, flat white over the person and #6E6E6E elsewhere, aligned closely enough that multiplying it over the scene dims everyone else cleanly, including hair and the menus they hold. About 30–40 s each, with a small input (about 1.4k tokens).
- **On the page:** the masks are stacked over the background with `mix-blend-mode: multiply` and cross-fade as the speaker changes; nothing is dimmed during the intro or at the end. The empty restaurant is shown through the title and the intro, zooming out the same way a step per intro box, and cross-fades into the scene, which starts zoomed in again, when the conversation begins. The background zooms out gently over the dialogue: it starts 36 px larger than the stage on each side and shrinks a step per line, each step easing over about 1.6 s, to its natural size on the last line. They are stored at half size (768 px wide), since the shapes are soft.

### Tried a scene per line (2026-10-24)

Each of 11-b's twelve lines got its own `variant` of the masked scene: one small change from what the speaker does or says, such as Sofia pointing at the window, the waiter handing out menus or holding a notepad, or a thought bubble with the white wine, beer and red wine, fish, or pasta being ordered. The model kept the room, framing and every face across all twelve, close enough to cross-fade between them, in about 40–50 s each. Each variant then got a `mask` of its speaker, with any thought bubble rising from them white too, so the bubble lights with the speaker. Running three at a time hit the deployment's rate limit after a few calls; one at a time with a 45 s pause on a 429 got through. The page stores them at 1280 px (scenes) and 768 px (masks) in [`TempConv/images/11-b/lines/`](../apps/web/src/pages/TempConv/images/11-b/lines/), and `TempConv.tsx` passes them to the conversation as `lineScenes`; the full-size originals and their prompts stay in `candidates/gpt-image/11-b-de-rekening-alstublieft/lines/` (gitignored).

| Line | Speaker | Change | Images |
|---|---|---|---|
| 1 | Ober | greets with a reservation book and a wave | [scene](../apps/web/src/pages/TempConv/images/11-b/lines/scene-0.jpg), [mask](../apps/web/src/pages/TempConv/images/11-b/lines/mask-0.jpg) |
| 2 | Daan | holds up four fingers | [scene](../apps/web/src/pages/TempConv/images/11-b/lines/scene-1.jpg), [mask](../apps/web/src/pages/TempConv/images/11-b/lines/mask-1.jpg) |
| 3 | Sofia | points at the window | [scene](../apps/web/src/pages/TempConv/images/11-b/lines/scene-2.jpg), [mask](../apps/web/src/pages/TempConv/images/11-b/lines/mask-2.jpg) |
| 4 | Ober | hands out open menus | [scene](../apps/web/src/pages/TempConv/images/11-b/lines/scene-3.jpg), [mask](../apps/web/src/pages/TempConv/images/11-b/lines/mask-3.jpg) |
| 5 | Noor | thought bubble: a glass of white wine | [scene](../apps/web/src/pages/TempConv/images/11-b/lines/scene-4.jpg), [mask](../apps/web/src/pages/TempConv/images/11-b/lines/mask-4.jpg) |
| 6 | Daan | thought bubble: a beer and a bottle of red wine | [scene](../apps/web/src/pages/TempConv/images/11-b/lines/scene-5.jpg), [mask](../apps/web/src/pages/TempConv/images/11-b/lines/mask-5.jpg) |
| 7 | Ober | holds a notepad and pen | [scene](../apps/web/src/pages/TempConv/images/11-b/lines/scene-6.jpg), [mask](../apps/web/src/pages/TempConv/images/11-b/lines/mask-6.jpg) |
| 8 | Sofia | thought bubble: grilled fish | [scene](../apps/web/src/pages/TempConv/images/11-b/lines/scene-7.jpg), [mask](../apps/web/src/pages/TempConv/images/11-b/lines/mask-7.jpg) |
| 9 | Lotte | thought bubble: steak and fish crossed out | [scene](../apps/web/src/pages/TempConv/images/11-b/lines/scene-8.jpg), [mask](../apps/web/src/pages/TempConv/images/11-b/lines/mask-8.jpg) |
| 10 | Ober | thought bubble: pasta with vegetables | [scene](../apps/web/src/pages/TempConv/images/11-b/lines/scene-9.jpg), [mask](../apps/web/src/pages/TempConv/images/11-b/lines/mask-9.jpg) |
| 11 | Lotte | hands back her menu, thought bubble: pasta | [scene](../apps/web/src/pages/TempConv/images/11-b/lines/scene-10.jpg), [mask](../apps/web/src/pages/TempConv/images/11-b/lines/mask-10.jpg) |
| 12 | Noor | thought bubble: chicken with fries | [scene](../apps/web/src/pages/TempConv/images/11-b/lines/scene-11.jpg), [mask](../apps/web/src/pages/TempConv/images/11-b/lines/mask-11.jpg) |

### Built the prototype page (2026-10-24)

`/temp-conv` (open in production too since 2026-10-24, unlinked from the app; production builds bundle only its two lesson files, `11-b` and `23-a`) stages the first dialogue of `23-a-mag-ik-vrij-nemen` over the office (since switched to 11-b; `TEMP_CONV_LESSON` and `STAGES` in `TempConv.tsx` pick the lesson), with the intro boxes, the portraits, line-by-line entry from alternating sides, speech per line from the production clips, and per-line or global translations. The owner is iterating on its design there. Code: `apps/web/src/pages/TempConv/` (`Conversation.tsx` is the component, `TempConv.tsx` feeds it a lesson file) and `apps/web/src/routes/temp-conv.tsx`.

### Started the phone player prototype (2026-11-07)

`/2-conv` (unlinked, open in production like `/temp-conv`) is a static design mock for the dialogue page on a phone, laid out like a music player's now-playing screen. No lesson data is fetched: 11-b's first dialogue, its vocabulary, and its per-line scenes and masks are copied into the page, and its audio is 11-b's production speech clips, addressed by their [clip hashes](speech.md#generation) on the media domain. The clips play one line at a time, moving on by themselves. The scrubber and clock use the clips' real lengths, and the speed button opens a small menu above it (0.75×, Normal, 1.25×) that sets the playback rate. The current line's scene, kept at 16:9, is the cover over the empty restaurant, which stays blurred and still. Under the cover the lines run like synced lyrics: every line is drawn the same (speaker, text with its new words, translation) and only fades with its distance from the current line, and the column slides slowly up as the dialogue advances, keeping the line before partly in view (previous and next lines were first tried as one-line peeks above and below the cover, then around the current line). A button in the top bar swaps the cover and the lines for the conversation box. That box otherwise sits under the player like a lyrics card. The browser animates the swap and the box's full-screen view as View Transitions (`document.startViewTransition`, skipped under reduced motion). In the box, each line is headed by the speaker's portrait, sized to the name plus two lines of translation, with the name and the translation beside it. Under the current line are a scrubber with one segment per line and transport controls (speed, previous line, play, next line, repeat line); translations, repeat, and share are also in the … menu. Once the last line has played out, the scrubber stays full and the lines slide on to an up-next suggestion (the lesson's next section, with Continue lesson and Play again). Below the conversation box is a new-words card. Swiping the cover moves between lines. The dialogue's new words are matched with the hovercard prototype's `findWords` and marked in strong yellow in the current line. A tap opens the prototype hovercard, with the word's clip, and pauses playback. The box underlines the new words in every line but opens cards only on the current line, and the new-word chips open cards too. Code: `apps/web/src/pages/TempPlayer/` and `apps/web/src/routes/2-conv.tsx`, to be deleted now that the real page has adopted it.

### Adopted the phone player on the dialogue page (2026-11-07)

The dialogue scene page now shows the player below 48em and keeps the staged conversation from 48em up; the behaviour is in [courses](courses.md#dialogue-scene-pages). Separate phone and desktop URLs were rejected because shared links, Start lesson, and resume positions all name one URL, and CSS alone was rejected because the two layouts have different markup, audio, and keys. `DialogueScenePage` mounts one view at a time with Mantine's `useMediaQuery` and passes the line reached to the other when the window crosses the breakpoint; the views share the page's data, speech, word cards, and position saving. The prototype's copied 11-b data became props: per-line scenes and masks, portraits, the backdrop (location, else background), the dialogue's new words, line clips from the lesson's speech, and the next section's heading as up next. The prototype's share item was left out. Code: `apps/web/src/pages/DialogueScene/DialoguePlayer.tsx` with its own CSS module; tests in `DialoguePlayer.test.tsx`, `e2e/lesson-dialogue-scene.spec.ts` (desktop, including a resize across the breakpoint), and `e2e/mobile-dialogue-player.spec.ts`.

## How

### Generating a location or a portrait

From the repository root, with the `.dev.vars` entries above:

```bash
T="node content/dutch-foundations/tools/gpt-image-trial.mjs"
P=content/dutch-foundations/illustrations/candidates/picked
$T location $P/part-iv-23-a-0.png --notes "The calendar board and the laptop screen are blank."
$T portrait $P/part-iv-23-a-0.png karin
```

Options: `--refs a.png,b.png` adds references after the first (the endpoint takes up to 16); `--describe "place"` draws a location that has no picked scene, taking only the style from the references; `--person "who"` draws a portrait of someone not in `cast.json` (the id then only names the file); `--out <dir>` writes into a subfolder. For example, the 11-b waiter:

```bash
$T portrait $P/part-iv-22-b-1.png ober --out 11-b-de-rekening-alstublieft --person "A friendly Dutch restaurant waiter in his late forties … a long black waiter's apron."
```

`scene <location.png> --refs <portraits> --describe "…"` places the portrayed people in the location, `variant <scene.png> --describe "…"` redraws a scene with one small change (a gesture, or a thought bubble holding a small picture), `--name` names the output file, and `mask <scene.png> <cast id>` (or `--person "who"`) makes that person's grey mask; see [Tried a scene with speaker masks](#tried-a-scene-with-speaker-masks-2026-10-24). Run one at a time; three at once hit the rate limit. The script sends the scene (plus any `--refs`) to `POST {origin}/openai/v1/images/edits` and writes the image and a `.json` sidecar (prompt, references, token usage) to `candidates/gpt-image/`. Prompts:

- Both start with a style sentence: keep the reference's painterly cartoon look, line quality, palette, and lighting. Both end by forbidding text, letters, numbers, and logos, because gpt-image readily draws signs and labels.
- **Location:** the same place as an empty establishing shot, same view, furniture, season, and light, no people, slightly wider, with a quieter centre for text on top. `--notes` adds scene-specific instructions, such as blanking a screen.
- **Portrait:** head and shoulders of the person, identified by `label`, `appearance`, and `outfit` from `cast.json`, facing the viewer at a slight angle, head filling about half the frame so it reads as a small circle, plain cream background, only that person.

Readability over the image (scrims, blur) is done in CSS with design tokens, not baked into the image. Portraits are cropped to circles in CSS, so transparent backgrounds (a gpt-image-2 preview) are not needed.

### Trying a design

Run the web app in development and open `/temp-conv`. The component takes its images as props, so a new lesson only needs its images in `TempConv/images/<lesson>/` and an entry in `STAGES` in `TempConv.tsx`; `TEMP_CONV_LESSON` picks the one shown.

### Importing staged assets

`content/dutch-foundations/tools/import-dialogue-scenes.mjs` imports the unified local staging manifest after the
dialogue scene migration is deployed. It is dry-run by default and performs local asset, size, block, and speaker
checks without contacting Cloudflare:

```bash
node content/dutch-foundations/tools/import-dialogue-scenes.mjs
```

`--remote-check` reads the live lesson documents and existing image slots without writing to D1 or R2. It can validate
the lesson documents before the image table exists and reports `imageTableReady: false` in that case:

```bash
node content/dutch-foundations/tools/import-dialogue-scenes.mjs --remote-check
```

Only an explicit `--apply` performs sequential R2 uploads and inserts into empty image slots. It first
reads the current remote `published_doc` and `draft_doc` cells and checks each dialogue block and speaker against them;
the repository content is not assumed to contain every edit. It never writes either lesson document cell or any other
`course_lessons` column. Remote lesson IDs are resolved by each part's `course.prod.json` course ID and the lesson
title/document. Existing `dialogue_scene_images` slots and their R2 objects are preserved, even when their contents
are different from the local art. The script never logs Wrangler output or credentials. Uploads retry with exponential
backoff, use deterministic slot keys, and write ownership metadata to `dialogue_scene_images`. The rows are inserted
only after every upload succeeds, so a rerun after a failure resumes: each key already served at `PUBLIC_MEDIA_BASE_URL`
(read from `apps/api/wrangler.jsonc`, or `--media-base=`) is skipped, since the key includes a digest of the file:

```bash
node content/dutch-foundations/tools/import-dialogue-scenes.mjs --apply
```

## Rollout status and remaining work

- The image slots are defined by migration `0047_dialogue_scene_images.sql`: assets live in a dedicated table and public R2 objects. `GET .../dialogue-scenes` returns each dialogue's `locationUrl`, optional `backgroundUrl`, speaker-keyed `portraits`, and ordered `lineScenes`; `POST .../dialogue-scenes/images` uploads and replaces a slot. The shared contracts own the response shape.
- Lesson scene routes, the first-start transition, inline dialogue links, reading-time claims, and turn-by-turn position saving are implemented. The existing inline reader, player, editor, lesson shares, and read-aloud activity retain their dialogue behavior.
- The [unified manifest](../content/dutch-foundations/dialogue-scenes.unified.json) identifies all 125 authored dialogue blocks across 62 lesson files, with an explicit location and cast for each. Prompt-only generation has staged 62 reusable location plates and all 26 speaker portraits under `content/dutch-foundations/illustrations/generated/`; every referenced file is WebP under the upload API's 1 MB limit. [Scene cast](../content/dutch-foundations/illustrations/scene-cast.json) records the identities. The private-reference generation path was blocked by automatic approval review. Wrangler is logged in, and a read-only remote check matched all 125 dialogues and 429 planned image slots to live lesson documents on 2026-11-04. Migration `0047` was applied in production on 2026-11-04, and the importer's `--apply` then uploaded all 429 staged assets to R2 and filled their slots (125 locations and 304 portraits; no line scenes or masks are staged). The scene page can show an existing lesson image and speaker initials until its art slots are filled; this fallback is not the finished visual design.
- Portrait slots are stored under the speaker as authored ("Sofia"), while the scene views looked speakers up by lowercase name, so until 2026-11-07 no uploaded portrait showed and every speaker fell back to an initial. `DialogueScenePage` now lowercases the slot names (`speakerPortraits`) before either view reads them.
- Verify the published scene pages with the uploaded location and portrait art, and review which lines benefit from a distinct scene image. Lines in the same setting may reuse the location and cast art. Delete `/temp-conv` only after the live pages have replaced its design-review role.
- Some authored translations mix Dutch and English (23-a: “Karin, mag ik take time off …”). Fix that content before considering those translations polished.
