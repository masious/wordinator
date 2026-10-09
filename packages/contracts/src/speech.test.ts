import { describe, expect, it } from "vitest";
import { speechCastSchema, updateCourseRequestSchema, WORD_IPA_MAX, wordIpaSchema } from ".";
import { lessonDocumentSchema, LESSON_DOCUMENT_SCHEMA_VERSION, type LessonDocument } from "./lessonDocument";
import { dialogueSpeakers, dialogueVoices, SPEECH_SAMPLE_TEXT, speechClipHash, speechItems, speechMarkup, speechSsml, spokenText, voiceSampleItems, wordSpeechItems } from "./speech";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const textProps = { textColor: "default", backgroundColor: "default", textAlignment: "left" } as const;
const documentOf = (...blocks: unknown[]) => lessonDocumentSchema.parse({ schemaVersion: LESSON_DOCUMENT_SCHEMA_VERSION, blocks }) as LessonDocument;
const example = (n: number, text: string) => ({ id: id(n), type: "example", props: { translation: "A translation", note: "A note" }, content: [{ type: "text", text, styles: { bold: true } }], children: [] });
const dialogue = (n: number, turns: Array<[string, string]>) => ({ id: id(n), type: "dialogue", props: { turns: JSON.stringify(turns.map(([speaker, text]) => ({ speaker, text }))) }, children: [] });
const vocabulary = (n: number, words: unknown[]) => ({ id: id(n), type: "vocabulary", props: { data: JSON.stringify({ words }) }, children: [] });

describe("spoken text", () => {
  it("turns a written term into the text that is spoken", () => {
    expect(spokenText("iets (inf.)")).toBe("iets");
    expect(spokenText("jij / je")).toBe("jij, je");
    expect(spokenText("lopen · liep · gelopen")).toBe("lopen, liep, gelopen");
    expect(spokenText("  de   keuken … ")).toBe("de keuken");
    expect(spokenText("(alleen)")).toBe("");
  });
});

describe("pronunciation override", () => {
  it("accepts IPA and refuses markup, other characters, and long values", () => {
    expect(wordIpaSchema.parse("ˈvoːrkoːmə")).toBe("ˈvoːrkoːmə");
    expect(wordIpaSchema.parse("ʊmˈfaːʁən")).toBe("ʊmˈfaːʁən");
    expect(wordIpaSchema.parse("ɣ.ʏ̃ ʃ")).toBe("ɣ.ʏ̃ ʃ");
    for (const value of ['ˈvoː"/><break time="9s"/>', "<b>", "a&b", "voːr'kom", "VOOR", "a1", "a-b"]) expect(wordIpaSchema.safeParse(value).success).toBe(false);
    expect(wordIpaSchema.safeParse("a".repeat(WORD_IPA_MAX + 1)).success).toBe(false);
  });

  it("is part of a vocabulary word and refused in a document when invalid", () => {
    const word = { id: id(2), term: "voorkomen", meaning: "to occur" };
    expect(lessonDocumentSchema.safeParse({ schemaVersion: 2, blocks: [vocabulary(1, [{ ...word, ipa: "ˈvoːrkoːmə" }])] }).success).toBe(true);
    expect(lessonDocumentSchema.safeParse({ schemaVersion: 2, blocks: [vocabulary(1, [{ ...word, ipa: "<phoneme/>" }])] }).success).toBe(false);
  });
});

describe("speech items", () => {
  const document = documentOf(
    { id: id(90), type: "paragraph", props: textProps, content: [{ type: "text", text: "Not spoken.", styles: {} }], children: [] },
    vocabulary(1, [
      { id: id(2), term: "de keuken", meaning: "the kitchen", example: " Ik kook in de keuken. ", note: "Not spoken" },
      { id: id(3), term: "voorkomen", meaning: "to occur", ipa: "ˈvoːrkoːmə" },
      { id: id(4), term: "", meaning: "draft word" },
    ]),
    example(5, "Er is een balkon."),
    example(6, ""),
    dialogue(7, [["Anna", "Hoi!"], ["Ben", "Dag Anna."], ["anna ", "Hoe gaat het?"], ["Cees", "Goed."]]),
  );

  it("lists word terms, word examples, example blocks, and dialogue turns with their voices", () => {
    expect(speechItems(document, null, "nl")).toEqual([
      { key: `word:${id(2)}`, voice: "nl-NL-FennaNeural", text: "de keuken", ipa: null },
      { key: `wordExample:${id(2)}`, voice: "nl-NL-FennaNeural", text: "Ik kook in de keuken.", ipa: null },
      { key: `word:${id(3)}`, voice: "nl-NL-FennaNeural", text: "voorkomen", ipa: "ˈvoːrkoːmə" },
      { key: `example:${id(5)}`, voice: "nl-NL-FennaNeural", text: "Er is een balkon.", ipa: null },
      { key: `turn:${id(7)}:0`, voice: "nl-NL-ColetteNeural", text: "Hoi!", ipa: null },
      { key: `turn:${id(7)}:1`, voice: "nl-NL-MaartenNeural", text: "Dag Anna.", ipa: null },
      { key: `turn:${id(7)}:2`, voice: "nl-NL-ColetteNeural", text: "Hoe gaat het?", ipa: null },
      // The third speaker wraps round the list to the narrator's voice.
      { key: `turn:${id(7)}:3`, voice: "nl-NL-FennaNeural", text: "Goed.", ipa: null },
    ]);
  });

  it("gives cast speakers their voice, matching labels trimmed and case-insensitively", () => {
    const turns = speechItems(document, { " ANNA": "nl-NL-MaartenNeural" }, "nl").filter((item) => item.key.startsWith("turn:"));
    expect(turns.map((item) => item.voice)).toEqual(["nl-NL-MaartenNeural", "nl-NL-MaartenNeural", "nl-NL-MaartenNeural", "nl-NL-FennaNeural"]);
    // A cast voice of another language is ignored.
    expect(dialogueVoices(["Anna"], { Anna: "nl-NL-MaartenNeural" }, "de")("Anna")).toBe("de-DE-AmalaNeural");
  });

  it("speaks German with the German narrator", () => {
    expect(wordSpeechItems({ id: id(2), term: "der Hund", example: null }, "de")).toEqual([{ key: `word:${id(2)}`, voice: "de-DE-KatjaNeural", text: "der Hund", ipa: null }]);
  });
});

describe("synthesis markup and clip identity", () => {
  it("escapes XML in text and IPA", () => {
    expect(speechMarkup({ text: `Tom & "Jerry" <zeggen> 't`, ipa: null })).toBe("Tom &#38; &#34;Jerry&#34; &#60;zeggen&#62; &#39;t");
    expect(speechMarkup({ text: "voorkomen", ipa: "ˈvoːrkoːmə" })).toBe('<phoneme alphabet="ipa" ph="ˈvoːrkoːmə">voorkomen</phoneme>');
    const ssml = speechSsml({ voice: "de-DE-KatjaNeural", text: "<speak>", ipa: null });
    expect(ssml).toContain('xml:lang="de-DE"');
    expect(ssml).toContain('<voice name="de-DE-KatjaNeural">');
    expect(ssml).toContain('<mstts:silence type="Leading-exact" value="0ms"/>');
    expect(ssml).toContain("&#60;speak&#62;</voice></speak>");
  });

  it("hashes voice and markup only, so identical text shares a clip", async () => {
    const hash = await speechClipHash({ voice: "nl-NL-FennaNeural", text: "water", ipa: null });
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await speechClipHash({ voice: "nl-NL-FennaNeural", text: "water", ipa: null })).toBe(hash);
    expect(await speechClipHash({ voice: "nl-NL-ColetteNeural", text: "water", ipa: null })).not.toBe(hash);
    expect(await speechClipHash({ voice: "nl-NL-FennaNeural", text: "water", ipa: "ˈʋaːtər" })).not.toBe(hash);
  });
});

describe("dialogue cast", () => {
  it("accepts known voices and refuses duplicates, unknown voices, and empty labels", () => {
    expect(speechCastSchema.parse({ Anna: "nl-NL-ColetteNeural" })).toEqual({ Anna: "nl-NL-ColetteNeural" });
    expect(speechCastSchema.safeParse({ Anna: "nl-NL-ColetteNeural", " anna": "nl-NL-MaartenNeural" }).success).toBe(false);
    expect(speechCastSchema.safeParse({ Anna: "en-US-JennyNeural" }).success).toBe(false);
    expect(speechCastSchema.safeParse({ " ": "nl-NL-ColetteNeural" }).success).toBe(false);
    expect(updateCourseRequestSchema.parse({ title: "T", summary: "S" }).speechCast).toBeUndefined();
  });
});

describe("cast editor helpers", () => {
  it("lists dialogue speakers across documents once, trimmed, in order of first appearance", () => {
    const first = documentOf(dialogue(1, [["Anna", "Hoi!"], ["Ben", "Dag."]]), example(2, "Geen spreker."));
    const second = documentOf(dialogue(3, [[" anna ", "Ja."], ["Cor", "Nee."], ["BEN", "Oké."]]));
    expect(dialogueSpeakers([first, second])).toEqual(["Anna", "Ben", "Cor"]);
    expect(dialogueSpeakers([])).toEqual([]);
  });

  it("reads one sample sentence per voice of a language, narrator first", () => {
    expect(voiceSampleItems("de").map((item) => item.voice)).toEqual(["de-DE-KatjaNeural", "de-DE-AmalaNeural", "de-DE-ConradNeural", "de-DE-KillianNeural"]);
    expect(voiceSampleItems("nl")[1]).toEqual({ key: "sample:nl-NL-ColetteNeural", voice: "nl-NL-ColetteNeural", text: SPEECH_SAMPLE_TEXT.nl, ipa: null });
  });
});
