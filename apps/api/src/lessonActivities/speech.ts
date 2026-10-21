import { TUTOR_SPAN_MAX } from "@wordinator/contracts/tutor";

// Role-play speech (docs/speech.md#lesson-activity-role-play): one original turn is spoken as one or more clips.

// The longest clip the synthesis pipeline is asked for. It is the largest on-demand clip the product serves (TUTOR_SPAN_MAX), so
// a longer original line is split into parts the learner requests one by one; nothing is silently cut off.
export const ACTIVITY_SPEECH_CHUNK_MAX = TUTOR_SPAN_MAX;

// Splits text into chunks of at most `max` UTF-16 units. Chunks end at sentence ends where possible, then at spaces. A word longer
// than `max` is cut into parts, and those parts are never joined to each other. Every character is kept, in order. Text within the
// limit is returned trimmed and otherwise unchanged, so its clip is the same clip the lesson's dialogue uses.
export function speechChunks(text: string, max: number = ACTIVITY_SPEECH_CHUNK_MAX): string[] {
  if (!Number.isInteger(max) || max < 2) throw new RangeError("speechChunks needs an integer limit of at least 2.");
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= max) return [trimmed];
  const chunks: string[] = [];
  // Units are packed greedily: the last chunk takes the next unit while both fit with a space, otherwise a new chunk starts. A
  // sentence too long for one chunk always starts a new chunk, so it is never begun in the middle of the previous one. A cut part
  // is never shorter than max - 1, so the space that joins units never falls inside a word.
  let startChunk = false;
  const add = (unit: string) => {
    const last = chunks[chunks.length - 1];
    if (!startChunk && last !== undefined && last.length + 1 + unit.length <= max) chunks[chunks.length - 1] = `${last} ${unit}`;
    else chunks.push(unit);
    startChunk = false;
  };
  for (const sentence of trimmed.split(/(?<=[.!?…])\s+/)) {
    if (sentence.length <= max) { add(sentence); continue; }
    startChunk = true;
    for (const word of sentence.split(/\s+/)) {
      if (word.length <= max) add(word);
      else cutWord(word, max).forEach(add);
    }
  }
  return chunks;
}

// Cuts a word at code-point boundaries, so no surrogate pair is split. Every part but the last is at least max - 1 units long.
function cutWord(word: string, max: number): string[] {
  const parts: string[] = [];
  let current = "";
  for (const symbol of word) {
    if (current.length + symbol.length > max) { parts.push(current); current = ""; }
    current += symbol;
  }
  if (current) parts.push(current);
  return parts;
}
