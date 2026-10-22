// Noto's animated emoji, saved in `./noto` (see its README) and served from Wordinator's own origin, by codepoint. The lesson
// index in the app rail, the overview prototype, and the home streak chip use them. Both are loaded lazily, and the stills as text; a still becomes a
// data URL.
const stillSources = import.meta.glob<string>("./noto/*.svg", { query: "?raw", import: "default" });
const stills = Object.fromEntries(Object.entries(stillSources).map(([path, load]) =>
  [path, () => load().then((svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`)])) as Record<string, () => Promise<string>>;
const animations: Record<string, () => Promise<unknown>> = import.meta.glob("./noto/*.json", { import: "default" });

export const notoEmoji = (codepoint: string) => ({ still: stills[`./noto/${codepoint}.svg`], animation: animations[`./noto/${codepoint}.json`] });
