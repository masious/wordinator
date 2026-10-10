# Dutch Foundations — story illustrations

Owner: content coordinator. Part of the [content docs](index.md). Covers how a lesson's `imageIdeas` become consistent cartoon illustrations. Story facts stay in [storyline.md](storyline.md); this file owns only how people and places **look**.

## Why references

Images come from FLUX.2 [pro] in Microsoft Foundry (Azure), through Black Forest Labs' provider API. It accepts up to eight base64 reference images per request (`input_image`, `input_image_2` … `input_image_8`). Every scene is generated from frozen reference images, not from text alone, so faces, outfits and rooms stay the same across lessons. A fixed seed does not hold identity across scenes.

Workers AI was tried first (`flux-2-klein-9b`, `flux-2-dev`) and dropped on 2026-10-10. Its references had to be under 512×512, and the free daily allowance ran out after about 15 images. Its sheets for Sofia, Noor and Noor's kitchen were discarded. Every reference is regenerated with FLUX.2 [pro].

## Visual canon

All under [`content/dutch-foundations/illustrations/`](../../content/dutch-foundations/illustrations/):

| File | Owns |
| --- | --- |
| `style.json` | Style sentence added to every prompt (flat 2D cartoon, clean outlines, muted palette), the text rule (`noText` by default, `quotedText` for scenes with `text: true`), Foundry endpoint path and model, sizes (scenes 1024×768, sheets 768×1024) |
| `cast.json` | Per character: `label` (short identifying phrase), `appearance`, signature `outfit`. Canon: Sofia's mustard cardigan, wavy dark-brown hair and no glasses; Noor's blonde ponytail, round tortoiseshell glasses, freckles and green-and-white striped top |
| `locations.json` | Per place: a fixed description (layout, furniture, colours, view) |
| `scenes.json` | Scene fields per lesson and `imageIdeas` index, kept outside the lesson files (see [Scene ideas](#scene-ideas)) |
| `refs/<id>.png` | The frozen reference sheet, sent to the model as is; `refs/<id>.json` records the prompt and seed |
| `candidates/` | Generated candidates awaiting a choice; not committed |

Frozen on 2026-10-11 (FLUX.2 [pro]): characters `sofia`, `noor`, `daan`, `henk`, `ingrid` and `ahmed`; places `noor-kitchen`, `sofia-office`, `sofia-living-room` and `kanaalstraat`. Each `refs/<id>.json` records the candidate's prompt and seed.

Rules for writing specs, learned while generating the sheets:

- A base `outfit` holds only what the person always wears. Situational items go in the scene's `action`; Henk's dark-blue apron at his market stall is one example. Otherwise every sheet draws them.
- Location descriptions name the most important furniture first. Avoid items that invite writing, such as labelled jars or a shopping list, because the model renders them as text. Noor's kitchen lost its table and chairs and gained text until its description was reordered.

Changing a character's or place's look means generating and freezing a new sheet. Every later scene changes with it, so treat this as canon: record the change here and don't edit `cast.json` for a single scene.

## Scene ideas

The tool reads a lesson's `imageIdeas[index]` and merges the scene fields over it. The fields come from `illustrations/scenes.json` (`{ "<lesson file stem>": { "<index>": { … } } }`) or from the idea itself. Lesson files don't need to change, and `scenes.json` wins when both have a field.

```json
{ "location": "noor-kitchen", "characters": ["sofia", "noor"],
  "extras": ["a train conductor: a woman in her forties with a dark-blue uniform jacket"],
  "text": false,
  "action": "What happens: poses, objects in hand, what is on the table." }
```

| Field | Meaning |
| --- | --- |
| `action` | Required. What happens. For a one-off place (a train, a library), describe the place here as well. |
| `location` | Optional frozen place. It becomes image 1. |
| `characters` | Optional frozen cast, in order: images 2…n, or 1…n without a location. |
| `extras` | Optional unnamed minor people (from the allowed speakers in [storyline.md](storyline.md)). Give each one a distinct look so the model doesn't copy a named character. Extras count toward "exactly N people". |
| `text` | `true` allows only the text quoted in the action: diagrams, agenda pages, station boards. Otherwise no text at all. |

At most eight reference images per request. Scenes with more than three named people drift more, so prefer small scenes.

## Commands

Setup, once:

1. In the Foundry portal, deploy `FLUX.2-pro` as a global standard deployment.
2. Add the endpoint and an API key to `apps/api/.dev.vars`, next to the API's other Azure keys. Or put them in `content/dutch-foundations/illustrations/.dev.vars`, which takes precedence. Both files are gitignored. Only the endpoint's origin is used, because the BFL route sits at the resource root (`/providers/blackforestlabs/v1/flux-2-pro`). Pasting a project URL (`…/api/projects/<name>`) or an `/openai/v1` URL therefore works too. Set `AZURE_FLUX_DEPLOYMENT` when the deployment isn't named `FLUX.2-pro`, because the request's `model` field must be the deployment name.

```bash
AZURE_FLUX_ENDPOINT=https://<resource>.services.ai.azure.com
AZURE_FLUX_API_KEY=<key>
AZURE_FLUX_DEPLOYMENT=<deployment name, if not FLUX.2-pro>
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

- **Attribute bleed between people.** With two characters, the first scene test (07-a, 2026-10-11) put Sofia's mustard cardigan on Noor. The scene prompt now says that clothes, colours and accessories are never shared or swapped. That fixed the garments, but small accessories still drift: glasses on Sofia, swapped sneakers, Noor with hoops. Generate 3–4 candidates and pick one.
- **Refusals.** The safety filter sometimes refuses a harmless prompt (`stop_reason: refusal`). The tool skips that candidate and carries on.
- **Scene speed.** A scene with references takes about 40–55 s; a sheet without references takes about 6–10 s.
