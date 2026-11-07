import { readDialogueTurns, type LessonBlockOf } from "@wordinator/contracts/lesson-document";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight, MessageCircle, Play } from "lucide-react";
import { useTranslation } from "react-i18next";
import { dialogueScenesQueryOptions } from "../../api";
import { speakerPortraits } from "../../pages/DialogueScene/DialogueScene";
import styles from "./DialogueBanner.module.css";

// A dialogue on the lesson page: the scene as a cover with the cast and a button to the dialogue page, which is the player
// (docs/courses.md#dialogue-scene-pages). The lines themselves are not shown here.
export function DialogueBanner({ block, title, groupId, courseId, lessonId, courseSlug, lessonSlug }: {
  block: LessonBlockOf<"dialogue">; title: string; groupId: string; courseId: string; lessonId: string; courseSlug: string; lessonSlug: string;
}) {
  const { t } = useTranslation();
  const scene = useQuery(dialogueScenesQueryOptions(groupId, courseId, lessonId)).data?.scenes.find((entry) => entry.blockId === block.id);
  const turns = readDialogueTurns(block);
  const speakers = [...new Set(turns.map((turn) => turn.speaker))];
  const portraits = speakerPortraits(scene?.portraits);
  const cover = scene?.backgroundUrl ?? scene?.locationUrl ?? null;
  return <Link className={styles.banner} data-cover={cover ? "image" : "plain"}
    to="/courses/$courseSlug/lessons/$lessonSlug/dialogues/$blockId" params={{ courseSlug, lessonSlug, blockId: block.id }}>
    {cover && <img className={styles.image} src={cover} alt="" />}
    <span className={styles.scrim} aria-hidden="true" />
    <span className={styles.body}>
      <span className={styles.eyebrow}><MessageCircle aria-hidden="true" />{t("courses.lessons.dialogueBanner.eyebrow", { count: turns.length })}</span>
      <span className={styles.title}>{title}</span>
      <span className={styles.footer}>
        <span className={styles.cast} aria-label={speakers.join(", ")}>
          {speakers.map((speaker) => {
            const portrait = portraits[speaker.trim().toLowerCase()];
            return portrait
              ? <img key={speaker} src={portrait} alt="" title={speaker} />
              : <span key={speaker} className={styles.initial} title={speaker} aria-hidden="true">{speaker.trim().charAt(0).toUpperCase()}</span>;
          })}
        </span>
        <span className={styles.cta}><Play aria-hidden="true" />{t("courses.lessons.dialogueBanner.play")}<ArrowRight aria-hidden="true" /></span>
      </span>
    </span>
  </Link>;
}
