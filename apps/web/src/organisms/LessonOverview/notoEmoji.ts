// Prototype only: Noto's animated emoji for the overview trail, saved in `./noto` (see its README) and served from Wordinator's
// own origin, by codepoint. Production builds replace the globs with empty objects, so no emoji artwork is bundled.
// Both are loaded lazily, and the stills as text: an eager glob or a `?url` asset is emitted even when the production branch drops
// it. A still becomes a data URL.
const stillSources: Record<string, () => Promise<string>> = import.meta.env.DEV ? import.meta.glob<string>("./noto/*.svg", { query: "?raw", import: "default" }) : {};
const stills = Object.fromEntries(Object.entries(stillSources).map(([path, load]) =>
  [path, () => load().then((svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`)])) as Record<string, () => Promise<string>>;
const animations: Record<string, () => Promise<unknown>> = import.meta.env.DEV ? import.meta.glob("./noto/*.json", { import: "default" }) : {};

export const notoEmoji = (codepoint: string) => ({ still: stills[`./noto/${codepoint}.svg`], animation: animations[`./noto/${codepoint}.json`] });
