import { inlineText, readDialogueTurns, type InlineContent, type LessonBlockOf, type LessonDocument } from "@wordinator/contracts/lesson-document";
import { useMemo, type CSSProperties } from "react";
import { SpeechScope } from "../../molecules/Speech";
import { markLesson } from "../TempHovercard/lessonWords";
import { useLessonSpeech } from "../TempHovercard/TempHovercard";
import { HovercardDemoContext, type HovercardDemo } from "../TempHovercard/WordHovercard";
import { Conversation } from "./Conversation";
import daan from "./images/11-b/daan.jpg";
import lotte from "./images/11-b/lotte.jpg";
import maskDaan from "./images/11-b/mask-daan.jpg";
import maskLotte from "./images/11-b/mask-lotte.jpg";
import maskNoor from "./images/11-b/mask-noor.jpg";
import maskOber from "./images/11-b/mask-ober.jpg";
import maskSofia from "./images/11-b/mask-sofia.jpg";
import noor from "./images/11-b/noor.jpg";
import ober from "./images/11-b/ober.jpg";
import restaurant from "./images/11-b/restaurant.jpg";
import scene11b from "./images/11-b/scene.jpg";
import sofia11b from "./images/11-b/sofia.jpg";
import karin from "./images/karin.jpg";
import office from "./images/office.jpg";
import sofia from "./images/sofia.jpg";

// 11-b's lines each have their own redrawn scene (a gesture, or a thought bubble with what is said) and the mask lighting its speaker.
const lineArt = import.meta.glob<string>("./images/11-b/lines/*.jpg", { eager: true, import: "default" });
const lineScenes11b = Array.from({ length: 12 }, (_, index) => ({
  scene: lineArt[`./images/11-b/lines/scene-${index}.jpg`]!,
  mask: lineArt[`./images/11-b/lines/mask-${index}.jpg`]!,
}));

// Temporary page: the first dialogue of an authored lesson file staged over its location, with the blocks before it as intro
// boxes. The images are gpt-image-2 tests made from picked production scenes (docs/conversation-scenes.md); development only
// and not translated. Delete with its route (docs/courses.md#conversation-prototype).
const STAGES = {
  "23-a-mag-ik-vrij-nemen": { background: office, portraits: { sofia, karin } },
  // The scene has the speakers drawn in; the restaurant is the empty location it was made from, shown during the intro.
  "11-b-de-rekening-alstublieft": {
    background: scene11b,
    location: restaurant,
    portraits: { sofia: sofia11b, noor, daan, lotte, ober },
    masks: { sofia: maskSofia, noor: maskNoor, daan: maskDaan, lotte: maskLotte, ober: maskOber },
    lineScenes: lineScenes11b,
  },
};
export const TEMP_CONV_LESSON: keyof typeof STAGES = "11-b-de-rekening-alstublieft";

// The blocks before the lesson's first top-level dialogue: each block with inline text becomes an intro box, and the last heading
// (below the lesson's title) names the scene.
export function stageLesson(document: LessonDocument) {
  const at = document.blocks.findIndex((block) => block.type === "dialogue");
  if (at < 0) return null;
  const intro: InlineContent[] = [];
  let scene: string | null = null;
  for (const block of document.blocks.slice(0, at)) {
    if (block.type === "heading") {
      if (block.props.level > 1) scene = inlineText(block.content);
      continue;
    }
    if ("content" in block && Array.isArray(block.content) && block.content.length) intro.push(block.content as InlineContent);
  }
  return { dialogue: document.blocks[at] as LessonBlockOf<"dialogue">, intro, scene };
}

// The dialogue's new words (docs/courses.md#new-word-hovercards-prototype) are lightly tinted in the action colour, and a click
// opens their card.
const toneStyle = { "--hc-tone": "var(--color-action)", "--hc-on-tone": "var(--color-action-text)" } as CSSProperties;

export function TempConv({ title, document }: { title: string; document: LessonDocument }) {
  const speech = useLessonSpeech(document);
  const staged = useMemo(() => stageLesson(document), [document]);
  const marks = useMemo(() => markLesson(document, "nl"), [document]);
  const demo = useMemo<HovercardDemo>(() => ({ toneStyle, sayWords: false, words: marks.words, subtle: true, clickOnly: true }), [marks]);
  if (!staged) return <p>This lesson has no dialogue.</p>;
  return (
    <HovercardDemoContext.Provider value={demo}>
      <SpeechScope resolve={(key) => speech[key] ?? null}>
        <Conversation blockId={staged.dialogue.id} title={title} scene={staged.scene} intro={staged.intro}
          turns={readDialogueTurns(staged.dialogue)} spans={marks.spans.get(staged.dialogue.id)} {...STAGES[TEMP_CONV_LESSON]} />
      </SpeechScope>
    </HovercardDemoContext.Provider>
  );
}
