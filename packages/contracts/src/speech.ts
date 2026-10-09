import { SPEECH_VOICES, speechCastKey, speechNarrator, type SpeechCast, type SpeechVoice } from "./index";
import { inlineText, readDialogueTurns, readVocabularyBlock, walkLessonBlocks, type LessonDocument } from "./lessonDocument";

// Lesson speech (docs/speech.md). These helpers are the single definition of what is spoken, in which voice, with which
// synthesis markup, and under which clip identity; the API's reads and its worker both use them.

// Part of every clip hash. Raise it when the markup or the synthesis request changes, so every clip is generated again.
export const SPEECH_SCHEMA_VERSION = 1;
export type SpeechLanguage = keyof typeof SPEECH_VOICES;

// A spoken item: its key in read responses, its voice, the text to speak, and the term's IPA override when it has one.
export type SpeechItem = { key: string; voice: SpeechVoice; text: string; ipa: string | null };

// A term is written for reading: parentheses are dropped, `/` and `·` between alternatives become a pause, `…` is dropped,
// and whitespace collapses. Articles stay.
export function spokenText(term: string) {
  return term
    .replace(/\([^)]*\)/g, " ")
    .replace(/…/g, " ")
    .replace(/\s*[/·]\s*/g, ", ")
    .replace(/\s+/g, " ")
    .replace(/(^[\s,]+|[\s,]+$)/g, "")
    .replace(/(,\s*)+,/g, ",");
}

type SpeechWord = { id: string; term: string; example?: string | null | undefined; ipa?: string | null | undefined };

// The term and example items of one word, read by the narrator. Empty text is not spoken.
export function wordSpeechItems(word: SpeechWord, language: SpeechLanguage): SpeechItem[] {
  const voice = speechNarrator(language);
  const term = spokenText(word.term);
  const example = word.example?.trim() ?? "";
  return [
    ...(term ? [{ key: `word:${word.id}`, voice, text: term, ipa: word.ipa?.trim() || null }] : []),
    ...(example ? [{ key: `wordExample:${word.id}`, voice, text: example, ipa: null }] : []),
  ];
}

// A dialogue speaker takes their cast voice. Speakers without one take the language's voices in the order speakers first
// appear in the dialogue, starting after the narrator and wrapping round the list.
export function dialogueVoices(speakers: readonly string[], cast: SpeechCast | null, language: SpeechLanguage) {
  const voices = SPEECH_VOICES[language] as readonly SpeechVoice[];
  const castVoices = new Map(Object.entries(cast ?? {}).map(([speaker, voice]) => [speechCastKey(speaker), voice]));
  const order = [...new Set(speakers.map(speechCastKey))];
  return (speaker: string): SpeechVoice => {
    const key = speechCastKey(speaker);
    const cast = castVoices.get(key);
    return cast && voices.includes(cast) ? cast : voices[(order.indexOf(key) + 1) % voices.length]!;
  };
}

// Every spoken item of a document in reading order: word terms and examples, example blocks, and dialogue turns.
export function speechItems(document: LessonDocument, cast: SpeechCast | null, language: SpeechLanguage): SpeechItem[] {
  const narrator = speechNarrator(language);
  return [...walkLessonBlocks(document.blocks)].flatMap(({ block }): SpeechItem[] => {
    switch (block.type) {
      case "vocabulary":
        return readVocabularyBlock(block).words.flatMap((word) => wordSpeechItems(word, language));
      case "example": {
        const text = inlineText(block.content).trim();
        return text ? [{ key: `example:${block.id}`, voice: narrator, text, ipa: null }] : [];
      }
      case "dialogue": {
        const turns = readDialogueTurns(block);
        const voiceOf = dialogueVoices(turns.map((turn) => turn.speaker), cast, language);
        return turns.flatMap((turn, index) => turn.text.trim()
          ? [{ key: `turn:${block.id}:${index}`, voice: voiceOf(turn.speaker), text: turn.text.trim(), ipa: null }]
          : []);
      }
      default:
        return [];
    }
  });
}

// Voice samples for the cast editor: one fixed sentence per language, read by each of its voices. The cron keeps them ready.
export const SPEECH_SAMPLE_TEXT: Record<SpeechLanguage, string> = { nl: "Hallo! Zo klinkt mijn stem.", de: "Hallo! So klingt meine Stimme." };
export function voiceSampleItems(language: SpeechLanguage): SpeechItem[] {
  return (SPEECH_VOICES[language] as readonly SpeechVoice[]).map((voice) => ({ key: `sample:${voice}`, voice, text: SPEECH_SAMPLE_TEXT[language], ipa: null }));
}

// The dialogue speakers of some documents in order of first appearance, trimmed, and once per cast key.
export function dialogueSpeakers(documents: readonly LessonDocument[]) {
  const speakers = new Map<string, string>();
  for (const document of documents) {
    for (const { block } of walkLessonBlocks(document.blocks)) {
      if (block.type !== "dialogue") continue;
      for (const turn of readDialogueTurns(block)) {
        const label = turn.speaker.trim();
        if (label && !speakers.has(speechCastKey(label))) speakers.set(speechCastKey(label), label);
      }
    }
  }
  return [...speakers.values()];
}

const escapeXml = (value: string) => value.replace(/[<>&"']/g, (character) => `&#${character.charCodeAt(0)};`);

// The synthesis markup of an item: its escaped text, or a phoneme element carrying the escaped IPA.
export function speechMarkup(item: Pick<SpeechItem, "text" | "ipa">) {
  return item.ipa ? `<phoneme alphabet="ipa" ph="${escapeXml(item.ipa)}">${escapeXml(item.text)}</phoneme>` : escapeXml(item.text);
}

// The full SSML request body. Leading and trailing silence is removed so a word clip is about as long as the word.
export function speechSsml(item: Pick<SpeechItem, "voice" | "text" | "ipa">) {
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="${item.voice.slice(0, 5)}">`
    + `<voice name="${item.voice}"><mstts:silence type="Leading-exact" value="0ms"/><mstts:silence type="Tailing-exact" value="0ms"/>`
    + `${speechMarkup(item)}</voice></speak>`;
}

// The clip identity: SHA-256 of the schema version, the voice, and the exact markup. Neither the lesson nor the group is part
// of it, so identical text in the same voice shares one clip everywhere.
export async function speechClipHash(item: Pick<SpeechItem, "voice" | "text" | "ipa">) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${SPEECH_SCHEMA_VERSION}\n${item.voice}\n${speechMarkup(item)}`));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
export const speechClipKey = (hash: string) => `speech/${hash}.mp3`;
