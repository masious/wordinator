import type { CourseWord } from "@wordinator/contracts/lesson-document";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PlainText } from "../../molecules/PlainText";
import { SpeechButton } from "../../molecules/Speech";
import { Button } from "../../ui";
import styles from "./WordList.module.css";

type Place = { id: string; slug: string; title: string };

// One word of the Words tab's lists (docs/words.md#words-tab): the term with its speaker button and forms, the meaning, and the
// course with a link to the lesson the word comes from. `status` sits between the word and the actions (the Weak words dots);
// `speechOwner` lets an action that speaks the term show on its speaker button.
export function WordRow({ word, course, lesson, status, actions, speechOwner }: {
  word: CourseWord; course: Place; lesson: Place; status?: ReactNode; actions: ReactNode; speechOwner?: string;
}) {
  const { t } = useTranslation();
  return <li className={styles.row} aria-label={word.term}>
    <div className={styles.word}>
      <p className={styles.term}>{word.term}
        <SpeechButton url={word.speech.term} label={t("courses.speech.term", { term: word.term })} owner={speechOwner} className={styles.speech} />
        {word.forms && <span className={styles.forms}>{word.forms}</span>}</p>
      <p className={styles.meaning}><PlainText>{word.meaning}</PlainText></p>
      <p className={styles.source}>{course.title} · <Link className={styles.lesson} to="/courses/$courseSlug/lessons/$lessonSlug"
        params={{ courseSlug: course.slug, lessonSlug: lesson.slug }} aria-label={t("words.openLesson", { lesson: lesson.title })}>{lesson.title}</Link></p>
    </div>
    {status}
    <div className={styles.actions}>{actions}</div>
  </li>;
}

// Loads the next page as its marker scrolls into view; the button stays for keyboards and browsers without an observer.
function MoreRows({ loading, onLoad }: { loading: boolean; onLoad: () => void }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node || loading || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => { if (entry?.isIntersecting) onLoad(); }, { rootMargin: "0px 0px 20%" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [loading, onLoad]);
  return <div ref={ref} className={styles.more}><Button variant="quiet" loading={loading} onClick={onLoad}>{t("words.more")}</Button></div>;
}

// A list of word rows that loads further pages as the learner scrolls.
export function WordList({ label, more, children }: {
  label: string; more: { hasMore: boolean; loading: boolean; onLoad: () => void }; children: ReactNode;
}) {
  return <>
    <ul className={styles.list} aria-label={label}>{children}</ul>
    {more.hasMore && <MoreRows loading={more.loading} onLoad={more.onLoad} />}
  </>;
}
