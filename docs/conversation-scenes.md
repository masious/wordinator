# Conversation scenes

Status: exploration, started 2026-10-24. Not an approved product change. This document owns the goal, the decisions so far, and the plan for staging lesson dialogues as illustrated scenes. Image generation details belong to [illustrations](content/illustrations.md#gpt-image-2-trial); the prototype's behaviour is summarised in [courses](courses.md#conversation-prototype).

## Where we want to get

A lesson's story dialogue becomes a scene instead of a list of turns:

- **Location background.** Each dialogue has an image of its location with no people in it. It sets the mood behind the paragraphs that open the lesson and stays behind the conversation.
- **Intro boxes.** The paragraphs before the first dialogue appear one at a time as boxes over the background. The learner brings the next one with a click, Space, or a Next button.
- **Cast portraits.** Each character has one portrait, shown like an icon beside their lines and later in an interactive component for reviewing the dialogue.
- **Lines that enter the scene.** The characters and their lines slide in from the sides, one line per click, Space, or Next.
- **One component.** The new component replaces the current dialogue block everywhere a dialogue renders, after its design is settled on a temporary page.

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

### Built the prototype page (2026-10-24)

`/temp-conv` (open in production too since 2026-10-24, unlinked from the app; production builds bundle only its two lesson files, `11-b` and `23-a`) stages the first dialogue of `23-a-mag-ik-vrij-nemen` over the office (since switched to 11-b; `TEMP_CONV_LESSON` and `STAGES` in `TempConv.tsx` pick the lesson), with the intro boxes, the portraits, line-by-line entry from alternating sides, speech per line from the production clips, and per-line or global translations. The owner is iterating on its design there. Code: `apps/web/src/pages/TempConv/` (`Conversation.tsx` is the component, `TempConv.tsx` feeds it a lesson file) and `apps/web/src/routes/temp-conv.tsx`.

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

`scene <location.png> --refs <portraits> --describe "…"` places the portrayed people in the location, and `mask <scene.png> <cast id>` (or `--person "who"`) makes that person's grey mask; see [Tried a scene with speaker masks](#tried-a-scene-with-speaker-masks-2026-10-24). Run at most three at a time. The script sends the scene (plus any `--refs`) to `POST {origin}/openai/v1/images/edits` and writes the image and a `.json` sidecar (prompt, references, token usage) to `candidates/gpt-image/`. Prompts:

- Both start with a style sentence: keep the reference's painterly cartoon look, line quality, palette, and lighting. Both end by forbidding text, letters, numbers, and logos, because gpt-image readily draws signs and labels.
- **Location:** the same place as an empty establishing shot, same view, furniture, season, and light, no people, slightly wider, with a quieter centre for text on top. `--notes` adds scene-specific instructions, such as blanking a screen.
- **Portrait:** head and shoulders of the person, identified by `label`, `appearance`, and `outfit` from `cast.json`, facing the viewer at a slight angle, head filling about half the frame so it reads as a small circle, plain cream background, only that person.

Readability over the image (scrims, blur) is done in CSS with design tokens, not baked into the image. Portraits are cropped to circles in CSS, so transparent backgrounds (a gpt-image-2 preview) are not needed.

### Trying a design

Run the web app in development and open `/temp-conv`. The component takes its images as props, so a new lesson only needs its images in `TempConv/images/<lesson>/` and an entry in `STAGES` in `TempConv.tsx`; `TEMP_CONV_LESSON` picks the one shown.

## Next steps

1. **Settle the design** on `/temp-conv`. The owner reviews and changes it until it meets their standard.
2. **Freeze the cast.** Make one portrait per character from two or three picked scenes where they look right, choose canon details (Sofia's freckles), update `cast.json`, and retire the FLUX sheets and their workflow in [illustrations](content/illustrations.md).
3. **Produce the images.** Add a gpt-image backend with `location` and `portrait` commands to `illustrate.ts`, replacing the trial script, and make one background per dialogue location.
4. **Give the images a home in the data.** Decide where a dialogue's location image and the cast's portraits live (likely the lesson document for the location and the course's [dialogue cast](speech.md#dialogue-cast) for portraits) and how they are uploaded to R2, then update [data model](data-model.md) and [courses](courses.md).
5. **Replace the dialogue block.** Keep, or explicitly drop, everything the block does today:
   - turn speech and the play-all transport ([speech](speech.md#playback));
   - each line as a [player step](courses.md#lesson-player), with saved positions and the reading share;
   - the [start gate](courses.md#lesson-pages), which cuts the lesson after its first dialogue;
   - new words attached to turns, and the vocabulary panel's highlighting;
   - [lesson shares](lesson-shares.md) of a dialogue, also rendered in journal posts;
   - reading one speaker's original lines aloud while the app voices the others ([read aloud](lesson-activities.md#read-aloud));
   - dialogues inside columns, and later dialogues in a lesson that have no intro;
   - editing in the lesson editor.
6. **Clean up.** Delete `/temp-conv`, its page, and its images, and move the final rules into their owner documents.

## Open questions

- Is one background per dialogue enough, or does a lesson with several dialogues in one place reuse it?
- Do characters change portrait with their outfit (Henk's apron at the market), or is one portrait per character enough?
- How does the review component use the portraits, and does it belong in the lesson, an activity, or both?
- Some authored translations mix Dutch and English (23-a: “Karin, mag ik take time off …”). Revealed translations make this visible; the content needs fixing before the new component shows them.
