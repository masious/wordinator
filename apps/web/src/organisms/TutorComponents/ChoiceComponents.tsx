import type { TutorArticle } from "@wordinator/contracts/tutor";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { ComponentFrame, GradePending, GradeResult, MarkedText, SubmitRow, useAnswerFlow } from "./shared";
import type { AnswerComponentProps } from "./types";
import styles from "./TutorComponents.module.css";

const typing = (target: EventTarget | null) => target instanceof Element && Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
const numberKey = (event: KeyboardEvent) => !event.altKey && !event.ctrlKey && !event.metaKey && /^[1-9]$/.test(event.key) ? Number(event.key) - 1 : null;

// De or het: two large toggle pills per noun (der, die, das for German). With focus in a noun's row, keys 1–3 pick its article.
export function ArticleComponent({ view, answer, grade, onAnswer, disabled, autoFocus }: AnswerComponentProps<"article">) {
  const { t } = useTranslation();
  const flow = useAnswerFlow(answer, onAnswer);
  const [picked, setPicked] = useState<(TutorArticle | null)[]>(() => view.nouns.map(() => null));
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (autoFocus) first.current?.focus({ preventScroll: true }); }, [autoFocus]);
  const locked = Boolean(flow.answered) || flow.pending || Boolean(disabled);
  const shown = flow.answered?.articles ?? picked;
  const pick = (noun: number, article: TutorArticle) => setPicked((current) => current.map((entry, index) => index === noun ? article : entry));
  const ready = picked.every((entry) => entry !== null);
  return <ComponentFrame kind="article">
    <ul className={styles.nouns}>
      {view.nouns.map((noun, index) => <li key={index} className={styles.noun}>
        <span className={styles.nounText}><span className={styles.nounTerm}>{noun.noun}</span>{noun.meaning && <span className={styles.muted}>{noun.meaning}</span>}</span>
        <span className={styles.toggles} role="group" aria-label={t("tutorComponents.article.noun", { noun: noun.noun })} onKeyDown={(event) => {
          const key = numberKey(event); const option = key === null ? undefined : view.options[key];
          if (!option || locked) return;
          event.preventDefault(); pick(index, option);
        }}>
          {view.options.map((option, position) => {
            const item = grade?.items[index];
            const chosen = shown[index] === option;
            return <button key={option} ref={index === 0 && position === 0 ? first : undefined} type="button" className={styles.toggle} aria-pressed={chosen} disabled={locked}
              aria-keyshortcuts={String(position + 1)} data-ok={chosen && item ? String(item.ok) : undefined} onClick={() => pick(index, option)}>{option}</button>;
          })}
        </span>
      </li>)}
    </ul>
    {grade ? <GradeResult kind="article" grade={grade} /> : flow.answered ? <GradePending />
      : <SubmitRow disabled={locked || !ready} pending={flow.pending} failed={flow.failed}
        onSubmit={() => { if (ready) void flow.submit({ kind: "article", articles: picked as TutorArticle[] }); }} />}
  </ComponentFrame>;
}

// Multiple choice: full-width tiles; clicking one, or its number key while focus is in the component, sends it.
export function ChoiceComponent({ view, answer, grade, onAnswer, disabled, autoFocus }: AnswerComponentProps<"choice">) {
  const { t } = useTranslation();
  const flow = useAnswerFlow(answer, onAnswer);
  const frame = useRef<HTMLDivElement>(null);
  useEffect(() => { if (autoFocus) frame.current?.focus({ preventScroll: true }); }, [autoFocus]);
  const locked = Boolean(flow.answered) || flow.pending || Boolean(disabled);
  const chosen = flow.answered?.choice ?? flow.draft?.choice ?? null;
  const choose = (index: number) => { if (!locked && index < view.options.length) void flow.submit({ kind: "choice", choice: index }); };
  return <ComponentFrame kind="choice">
    <div ref={frame} tabIndex={-1} className={styles.grade} onKeyDown={(event) => {
      if (typing(event.target)) return;
      const key = numberKey(event); if (key === null || key >= view.options.length || locked) return;
      event.preventDefault(); choose(key);
    }}>
      <p className={styles.prompt}><MarkedText text={view.question} /></p>
      <ul className={styles.options} aria-label={t("tutorComponents.choice.options")}>
        {view.options.map((option, index) => <li key={index}>
          <button type="button" className={styles.option} disabled={locked} aria-pressed={chosen === index} aria-keyshortcuts={String(index + 1)}
            data-correct={grade && grade.reference === option ? "" : undefined} onClick={() => choose(index)}>
            <kbd className={styles.key} aria-hidden="true">{index + 1}</kbd><span><MarkedText text={option} /></span>
          </button>
        </li>)}
      </ul>
      {!grade && !flow.answered && <p className={styles.muted}>{t("tutorComponents.choice.help")}</p>}
    </div>
    {grade ? <GradeResult kind="choice" grade={grade} /> : flow.answered ? <GradePending />
      : flow.failed ? <p className={styles.sendError} role="alert">{t("tutorComponents.sendFailed")}</p> : null}
  </ComponentFrame>;
}
