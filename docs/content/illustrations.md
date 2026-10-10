# Dutch Foundations — story illustrations

Owner: content coordinator. Part of the [content docs](index.md). Covers how a lesson's `imageIdeas` become consistent cartoon illustrations. Story facts stay in [storyline.md](storyline.md); this file owns only how people and places **look**.

## Why references

Images come from FLUX.2 [pro] in Microsoft Foundry (Azure), through Black Forest Labs' provider API. It accepts up to eight base64 reference images per request (`input_image`, `input_image_2` … `input_image_8`). Every scene is generated from frozen reference images, not from text alone, so faces, outfits and rooms stay the same across lessons. A fixed seed does not hold identity across scenes.

Workers AI was tried first (`flux-2-klein-9b`, `flux-2-dev`) and dropped on 2026-10-10. Its references had to be under 512×512, and the free daily allowance ran out after about 15 images. Its sheets for Sofia, Noor and Noor's kitchen were discarded. Every reference is regenerated with FLUX.2 [pro].

## Visual canon

All under [`content/dutch-foundations/illustrations/`](../../content/dutch-foundations/illustrations/):

| File | Owns |
| --- | --- |
| `style.json` | Style sentence added to every prompt (flat 2D cartoon, clean outlines, muted palette, no text), Foundry endpoint path and model, sizes (scenes 1024×768, sheets 768×1024) |
| `cast.json` | Per character: `label` (short identifying phrase), `appearance`, signature `outfit`. Canon: Sofia's mustard cardigan, wavy dark-brown hair and no glasses; Noor's blonde ponytail, round tortoiseshell glasses, freckles and green-and-white striped top |
| `locations.json` | Per place: a fixed description (layout, furniture, colours, view) |
| `refs/<id>.png` | The frozen reference sheet, sent to the model as is; `refs/<id>.json` records the prompt and seed |
| `candidates/` | Generated candidates awaiting a choice; not committed |

Frozen so far: none. Every cast member and location has a spec, but no FLUX.2 [pro] sheet yet.

Changing a character's or place's look means generating and freezing a new sheet. Every later scene changes with it, so treat this as canon: record the change here and don't edit `cast.json` for a single scene.

## Scene ideas

An `imageIdeas` entry that should be generated adds three fields to the authoring fields in [style-guide.md](style-guide.md):

```json
{ "afterHeading": "…", "description": "…", "alt": "…",
  "location": "noor-kitchen", "characters": ["sofia", "noor"],
  "action": "What happens: poses, objects in hand, what is on the table." }
```

The `location` is image 1 and the characters are images 2…n in order. The eight-reference limit allows up to seven characters, but scenes with more than three people drift more. Prefer small scenes.

## Commands

Setup, once:

1. In the Foundry portal, deploy `FLUX.2-pro` as a global standard deployment.
2. Copy the resource endpoint (`https://<resource>.api.cognitive.microsoft.com`) and an API key.
3. Put them in `content/dutch-foundations/illustrations/.dev.vars`, which is gitignored and never committed:

```bash
AZURE_FLUX_ENDPOINT=https://<resource>.api.cognitive.microsoft.com
AZURE_FLUX_API_KEY=<key>
```

Environment variables of the same names override the file. Run every command from the repository root.

```bash
T="apps/api/node_modules/.bin/tsx content/dutch-foundations/tools/illustrate.ts"
$T sheet sofia --count 3                         # sheet candidates
$T freeze sofia content/dutch-foundations/illustrations/candidates/sheets/sofia-2.jpg
$T scene content/dutch-foundations/part-ii/07-a-mijn-dag.json 0 --count 3          # → candidates/07-a-mijn-dag/0-pro-N.jpg
```

Candidates are numbered after existing ones and never overwritten. Each one has a `.json` sidecar with its prompt, references and seed. A person chooses the image and uploads it through the lesson editor, because agents never put images into lesson blocks.

## Costs and limits

FLUX.2 [pro] in Foundry costs about $0.04 per image, with references included, so 150 images cost about $6. It is "Direct from Azure", so a new account's trial credit covers it. The low rate tier allows 15 requests per minute. The tool sends one request at a time.

## Known issues

These were seen with Workers AI. The scene prompts keep the fixes, but they have not yet been rechecked with FLUX.2 [pro].

- Accessories can move between characters (Noor's glasses appeared on Sofia) unless the scene prompt includes each character's full `appearance`, and an explicit "no glasses" in Sofia's canon.
- Furniture drifts (a round table instead of a square one) unless the location's description is in the scene prompt.
- The model may add an extra chair for each person. The scene prompt forbids added furniture, but this fix is untested so far.
