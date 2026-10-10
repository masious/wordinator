# Dutch Foundations — story illustrations

Owner: content coordinator. Part of the [content docs](index.md). Covers how a lesson's `imageIdeas` become consistent cartoon illustrations. Story facts stay in [storyline.md](storyline.md); this file owns only how people and places **look**.

## Why references

Workers AI's FLUX.2 models (`flux-2-klein-9b` for drafts, `flux-2-dev` for finals) accept up to a few reference images per request (`input_image_0…`, each under 512×512). Every scene is generated from frozen reference images, not from text alone, so faces, outfits and rooms stay the same across lessons. Workers AI has no LoRA or fine-tuning for these models, and a fixed seed does not hold identity across scenes.

## Visual canon

All under [`content/dutch-foundations/illustrations/`](../../content/dutch-foundations/illustrations/):

| File | Owns |
| --- | --- |
| `style.json` | Style sentence added to every prompt (flat 2D cartoon, clean outlines, muted palette, no text), models, sizes (scenes 1024×768) |
| `cast.json` | Per character: `label` (short identifying phrase), `appearance`, signature `outfit`. Canon: Sofia's mustard cardigan, wavy dark-brown hair and no glasses; Noor's blonde ponytail, round tortoiseshell glasses, freckles and green-and-white striped top |
| `locations.json` | Per place: a fixed description (layout, furniture, colours, view) |
| `refs/<id>.png` | The frozen reference sheet; `refs/<id>.ref.png` is the downscaled copy sent to the model; `refs/<id>.json` records the prompt and seed |
| `candidates/` | Generated candidates awaiting a choice; not committed |

Frozen so far: `sofia`, `noor` and `noor-kitchen`. The other cast members have specs but no sheets yet.

Changing a character's or place's look means generating and freezing a new sheet. Every later scene changes with it, so treat this as canon: record the change here and don't edit `cast.json` for a single scene.

## Scene ideas

An `imageIdeas` entry that should be generated adds three fields to the authoring fields in [style-guide.md](style-guide.md):

```json
{ "afterHeading": "…", "description": "…", "alt": "…",
  "location": "noor-kitchen", "characters": ["sofia", "noor"],
  "action": "What happens: poses, objects in hand, what is on the table." }
```

The `location` is image 0 and the characters are images 1…n in order. Keep scenes to at most three characters so that every request fits within the reference limit. Bigger groups need a combined group sheet.

## Commands

Run from the repository root, logged in with `wrangler login`. The workspace's wrangler 4.38 cannot open the remote session that the AI binding needs (the token exchange returns `400`). Until it is upgraded, point `ILLUSTRATE_WRANGLER_DIR` at a directory containing a current wrangler (`npm install wrangler@latest`).

```bash
T="apps/api/node_modules/.bin/tsx content/dutch-foundations/tools/illustrate.ts"
$T sheet sofia --count 3                         # sheet candidates
$T freeze sofia content/dutch-foundations/illustrations/candidates/sheets/sofia-2.jpg
$T scene content/dutch-foundations/part-ii/07-a-mijn-dag.json 0 --count 3          # drafts, klein-9b
$T scene content/dutch-foundations/part-ii/07-a-mijn-dag.json 0 --count 3 --final  # flux-2-dev
```

Candidates are numbered after existing ones and never overwritten. Each one has a `.json` sidecar with its prompt, references and seed. A person chooses the image and uploads it through the lesson editor, because agents never put images into lesson blocks.

## Costs and limits

The AI binding always runs remotely and counts against the account's Workers AI usage. On the free plan the daily allowance is 10,000 neurons, which ran out after about 15 klein-9b images (sheets and scenes) on 2026-10-10.

## Known issues

- Accessories can move between characters (Noor's glasses appeared on Sofia) unless the scene prompt includes each character's full `appearance`, and an explicit "no glasses" in Sofia's canon.
- Furniture drifts (a round table instead of a square one) unless the location's description is in the scene prompt.
- The model may add an extra chair for each person. The scene prompt forbids added furniture, but this fix is untested so far.
