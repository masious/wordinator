import { Popover } from "@mantine/core";
import type { VocabularyWord } from "@wordinator/contracts/lesson-document";
import { Bookmark } from "lucide-react";
import { createContext, useContext, useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PlainText } from "../../molecules/PlainText";
import { playSpeech, SpeechButton, useSpeechUrl } from "../../molecules/Speech";
import styles from "./TempHovercard.module.css";

// Prototype: a new word's hovercard. The demo page sets the tone (one of the vivid accents) and whether opening a card speaks its
// term; cards portalled out of the page take the tone through `toneStyle`.
export type HovercardDemo = { toneStyle: CSSProperties; sayWords: boolean; words: ReadonlyMap<string, VocabularyWord> };
export const HovercardDemoContext = createContext<HovercardDemo>({ toneStyle: {}, sayWords: false, words: new Map() });
export const useHovercardDemo = () => useContext(HovercardDemoContext);

const ARTICLE = /^(de|het|der|die|das)\s+(.+)$/i;

// The card: an eyebrow, the article as a tone pill, the term with its speaker, IPA, forms, and meaning; the full card adds the
// example (with its speaker) and the note. The bookmark only toggles here; nothing is saved.
export function WordCard({ word, compact = false }: { word: VocabularyWord; compact?: boolean }) {
  const { t } = useTranslation();
  const [saved, setSaved] = useState(false);
  const termSpeech = useSpeechUrl(`word:${word.id}`);
  const exampleSpeech = useSpeechUrl(`wordExample:${word.id}`);
  const [, article, rest] = ARTICLE.exec(word.term.trim()) ?? [null, null, word.term];
  const example = word.example?.trim(); const note = word.note?.trim(); const forms = word.forms?.trim();
  return (
    <div className={styles.card} data-compact={compact || undefined}>
      <div className={styles.cardHead}>
        <p className={styles.cardTerm}>
          {article && <span className={styles.article}>{article.toLowerCase()}</span>}
          <span>{rest}</span>
        </p>
        <SpeechButton url={termSpeech} label={t("courses.speech.term", { term: word.term })} />
        <button type="button" className={styles.bookmark} aria-pressed={saved} aria-label={`Bookmark ${word.term}`} onClick={() => setSaved(!saved)}>
          <Bookmark aria-hidden="true" />
        </button>
      </div>
      {(word.ipa || forms) && (
        <p className={styles.cardForms}>
          {word.ipa && <span>/{word.ipa}/</span>}
          {forms && <span>{forms}</span>}
        </p>
      )}
      <p className={styles.cardMeaning}><PlainText>{word.meaning}</PlainText></p>
      {!compact && example && (
        <p className={styles.cardExample}>
          <span><PlainText>{example}</PlainText></span>
          <SpeechButton url={exampleSpeech} label={t("courses.speech.wordExample", { term: word.term })} />
        </p>
      )}
      {!compact && note && <p className={styles.cardNote}><PlainText>{note}</PlainText></p>}
    </div>
  );
}

const OPEN_DELAY = 200;
const CLOSE_DELAY = 180;

// A marked word in running text. Hovering opens its card after a short delay and leaving the word and the card closes it; a tap or
// click toggles it, a keyboard focus opens it, and Escape or a click elsewhere closes it.
export function HoverWord({ word, children }: { word: VocabularyWord; children: ReactNode }) {
  const { toneStyle, sayWords } = useHovercardDemo();
  const [opened, setOpened] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const termSpeech = useSpeechUrl(`word:${word.id}`);
  const owner = useId();
  const clear = () => window.clearTimeout(timer.current);
  useEffect(() => clear, []);
  const open = () => {
    clear();
    if (opened) return;
    setOpened(true);
    if (sayWords && termSpeech) playSpeech(owner, [termSpeech]);
  };
  const later = (action: () => void, delay: number) => { clear(); timer.current = window.setTimeout(action, delay); };
  const onKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    if (opened) setOpened(false); else open();
  };
  return (
    <Popover opened={opened} onChange={setOpened} position="top" offset={8} width={300} withArrow arrowSize={12} arrowOffset={16}
      middlewares={{ flip: true, shift: { padding: 12 } }} returnFocus={false} classNames={{ dropdown: styles.dropdown, arrow: styles.arrow }}>
      <Popover.Target>
        <span role="button" tabIndex={0} className={styles.mark} style={toneStyle} aria-expanded={opened} data-open={opened || undefined}
          onMouseEnter={() => later(open, OPEN_DELAY)} onMouseLeave={() => later(() => setOpened(false), CLOSE_DELAY)}
          onFocus={(event) => { if (event.currentTarget.matches(":focus-visible")) open(); }}
          onClick={() => { if (opened) setOpened(false); else open(); }} onKeyDown={onKeyDown}>
          {children}
        </span>
      </Popover.Target>
      <Popover.Dropdown style={toneStyle} onMouseEnter={clear} onMouseLeave={() => later(() => setOpened(false), CLOSE_DELAY)}>
        <WordCard word={word} />
      </Popover.Dropdown>
    </Popover>
  );
}
