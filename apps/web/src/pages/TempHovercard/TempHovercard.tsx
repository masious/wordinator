import { useComputedColorScheme, useMantineColorScheme } from "@mantine/core";
import { readDialogueTurns, walkLessonBlocks, type LessonBlockOf, type LessonDocument } from "@wordinator/contracts/lesson-document";
import { speechClipHash, speechItems } from "@wordinator/contracts/speech";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { SpeechScope } from "../../molecules/Speech";
import { DialogueWalkthrough } from "./DialogueWalkthrough";
import { markLesson } from "./lessonWords";
import { LessonText } from "./LessonText";
import { HovercardDemoContext, type HovercardDemo } from "./WordHovercard";
import styles from "./TempHovercard.module.css";

// Temporary page: new-word hovercards on an authored lesson file, in the lesson's text and in a dialogue walkthrough, in each vivid
// tone and both colour schemes. Development only and not translated; delete with its route (docs/courses.md#new-word-hovercards-prototype).
export const HOVERCARD_TONES = ["yellow", "orange", "red", "pink", "violet", "blue", "teal", "green", "slate"] as const;
type Tone = (typeof HOVERCARD_TONES)[number];

// Lesson files are not in the API, so the page finds their clips as the API does: each spoken item's clip identity
// (docs/speech.md#generation) under the media base. Locally that base is the production bucket's public domain (wrangler.jsonc),
// where the course's clips were generated; the local speech_clips table holds the same rows.
const MEDIA_BASE = "https://taalk-images.masious.ir/";

function useLessonSpeech(document: LessonDocument) {
  const [speech, setSpeech] = useState<Record<string, string>>({});
  useEffect(() => {
    let live = true;
    void Promise.all(speechItems(document, null, "nl").map(async (item) => [item.key, `${MEDIA_BASE}speech/${await speechClipHash(item)}.mp3`] as const))
      .then((entries) => { if (live) setSpeech(Object.fromEntries(entries)); });
    return () => { live = false; };
  }, [document]);
  return speech;
}

// A row of pill buttons, one pressed.
function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: ReadonlyArray<{ value: T; label: string }>; onChange: (value: T) => void }) {
  return (
    <div className={styles.choice} role="group" aria-label={label}>
      {options.map((option) => (
        <button key={option.value} type="button" aria-pressed={option.value === value} onClick={() => onChange(option.value)}>{option.label}</button>
      ))}
    </div>
  );
}

const toneStyle = (tone: Tone) => ({
  "--hc-tone": `var(--color-vivid-${tone})`,
  "--hc-on-tone": tone === "yellow" ? "var(--color-vivid-text-on-yellow)" : "var(--color-vivid-text)",
}) as CSSProperties;

export function TempHovercard({ title, document }: { title: string; document: LessonDocument }) {
  const [tone, setTone] = useState<Tone>("violet");
  const [sayWords, setSayWords] = useState(false);
  const [view, setView] = useState<"text" | "dialogue">("dialogue");
  const { setColorScheme } = useMantineColorScheme();
  const scheme = useComputedColorScheme("light");
  const speech = useLessonSpeech(document);
  const marks = useMemo(() => markLesson(document, "nl"), [document]);
  const dialogues = useMemo(() => [...walkLessonBlocks(document.blocks)].flatMap(({ block }) => block.type === "dialogue" ? [block] : []), [document]);
  const [dialogueId, setDialogueId] = useState(() => dialogues[0]?.id ?? null);
  const dialogue = dialogues.find((block) => block.id === dialogueId) as LessonBlockOf<"dialogue"> | undefined;
  const demo = useMemo<HovercardDemo>(() => ({ toneStyle: toneStyle(tone), sayWords, words: marks.words }), [tone, sayWords, marks]);

  return (
    <HovercardDemoContext.Provider value={demo}>
      <SpeechScope resolve={(key) => speech[key] ?? null}>
        <div className={styles.page} style={demo.toneStyle}>
          <header className={styles.toolbar}>
            <div className={styles.titles}>
              <p className={styles.eyebrow}>Prototype · new-word hovercards</p>
              <h1 className={styles.title}>{title}</h1>
            </div>
            <div className={styles.controls}>
              <div className={styles.swatches} role="radiogroup" aria-label="Tone">
                {HOVERCARD_TONES.map((name) => (
                  <button key={name} type="button" role="radio" aria-checked={tone === name} aria-label={name} title={name}
                    className={styles.swatch} style={toneStyle(name)} onClick={() => setTone(name)} />
                ))}
              </div>
              <Choice label="Colour scheme" value={scheme} onChange={setColorScheme}
                options={[{ label: "Light", value: "light" }, { label: "Dark", value: "dark" }]} />
              <label className={styles.toggle}>
                <input type="checkbox" checked={sayWords} onChange={(event) => setSayWords(event.currentTarget.checked)} />
                Say words as they open
              </label>
            </div>
            <Choice label="View" value={view} onChange={setView}
              options={[{ label: "Dialogue walkthrough", value: "dialogue" }, { label: "Lesson text", value: "text" }]} />
          </header>

          {view === "dialogue" ? (
            dialogue ? (
              <section className={styles.section}>
                {dialogues.length > 1 && (
                  <Choice label="Dialogue" value={dialogue.id} onChange={setDialogueId}
                    options={dialogues.map((block, index) => ({ value: block.id, label: `Dialogue ${index + 1}: ${readDialogueTurns(block).map((turn) => turn.speaker).filter((speaker, at, all) => all.indexOf(speaker) === at).join(", ")}` }))} />
                )}
                <DialogueWalkthrough key={dialogue.id} block={dialogue} spans={marks.spans.get(dialogue.id) ?? []} />
              </section>
            ) : <p className={styles.placeholder}>This lesson has no dialogue.</p>
          ) : (
            <section className={styles.section}>
              <LessonText document={document} marks={marks} onWalkThrough={(id) => { setDialogueId(id); setView("dialogue"); }} />
            </section>
          )}
        </div>
      </SpeechScope>
    </HovercardDemoContext.Provider>
  );
}
