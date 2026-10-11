import type { PostLessonShare } from "@wordinator/contracts";
import { Link } from "@tanstack/react-router";
import { useCallback } from "react";
import { Trans, useTranslation } from "react-i18next";
import { PlainText } from "../../molecules/PlainText";
import { SpeechButton, SpeechScope } from "../../molecules/Speech";
import { ArrowIcon } from "../../ui";
import { DialogueTurns, InlineText } from "../LessonDocument/LessonDocument";
import styles from "./LessonShare.module.css";

// The byline of a lesson share (docs/posts-and-feed.md#lesson-share): the kind and its lesson, by number while the viewer can open
// it and otherwise by the lesson title saved at share time. `time` is the rendered time element's text.
export function LessonShareByline({ share, name, time, dateTime }: { share: PostLessonShare; name: string; time: string; dateTime?: string }) {
  const { source } = share;
  return <Trans
    i18nKey={`posts.byline.lesson_share.${share.kind}${source.lessonNumber === null ? "Unlinked" : ""}`}
    values={{ name, time, number: source.lessonNumber, lesson: source.lessonTitle, course: source.courseTitle }}
    components={{ name: <strong className={styles.author} />, time: <time dateTime={dateTime} /> }}
  />;
}

function DialogueShare({ share }: { share: Extract<PostLessonShare, { kind: "dialogue" }> }) {
  const { t } = useTranslation();
  const resolve = useCallback((key: string) => share.speech[key] ?? null, [share.speech]);
  if (!share.available || !share.turns) return <div className={styles.unavailable} role="note">{t("lessonShares.dialogueUnavailable")}</div>;
  return <div className={styles.dialogue}>
    <SpeechScope resolve={resolve}><DialogueTurns blockId={share.source.blockId} turns={share.turns} /></SpeechScope>
  </div>;
}

// The shared piece, as the feed card and the share confirmation show it. An example keeps its sentence's lesson formatting through
// the lesson renderer; a question shows its instruction and prompt, with blanks as `…`, and never its author's version. `link` adds
// the way back to the lesson while the viewer can open it; a feed card leaves it out because the card is already one link.
export function LessonSharePreview({ share, link = false }: { share: PostLessonShare; link?: boolean }) {
  const { t } = useTranslation();
  const { source } = share;
  return <div className={styles.preview}>
    {share.kind === "example" && <figure className={styles.example}>
      <div className={styles.spoken}>
        <blockquote className={styles.sentence}><InlineText content={share.example.content} /></blockquote>
        <SpeechButton url={share.speechUrl} label={t("courses.speech.example")} />
      </div>
      {share.example.translation && <figcaption className={styles.translation}><PlainText linkify={false}>{share.example.translation}</PlainText></figcaption>}
      {share.example.note && <p className={styles.exampleNote}><PlainText linkify={false}>{share.example.note}</PlainText></p>}
    </figure>}
    {share.kind === "dialogue" && <DialogueShare share={share} />}
    {share.kind === "question" && <div className={styles.question}>
      <p className={styles.eyebrow}>{t("lessonShares.question")}</p>
      <p className={styles.instruction}><PlainText linkify={false}>{share.question.instruction}</PlainText></p>
      <p className={styles.prompt}><PlainText linkify={false}>{share.question.prompt}</PlainText></p>
    </div>}
    {link && source.linked && source.courseSlug && source.lessonSlug &&
      <Link className={styles.open} to="/courses/$courseSlug/lessons/$lessonSlug" params={{ courseSlug: source.courseSlug, lessonSlug: source.lessonSlug }}>
        {t("lessonShares.openLesson")}<ArrowIcon />
      </Link>}
  </div>;
}
