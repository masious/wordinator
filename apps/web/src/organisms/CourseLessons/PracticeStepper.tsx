import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { CourseLesson } from "@wordinator/contracts/lesson-document";
import { SlidePanel } from "../../molecules/SlidePanel";
import { QuestionPips } from "../../molecules/QuestionPips";
import { IconButton } from "../../ui";
import type { PracticeGroupItem } from "../LessonDocument/LessonDocument";
import { ownStatus, practiceFromBlock, PracticeSummary, type PracticeScope } from "./PracticeBlock";
import styles from "./PracticeStepper.module.css";

// The lesson page's practice stepper (docs/courses.md#lesson-pages): two or more practices in a row as one card. Its header says
// how many the viewer has done and has one shared status pip per practice (done, current, or open), which moves to that practice, with
// Previous and Next arrows. Only the current practice shows, under its title; changing practice slides it in from the side of the
// move. It opens on the first practice the viewer has not done, and stays where they put it while their progress refreshes.
export function PracticeStepper({ items, scope, progress, published, archived }: {
  items: PracticeGroupItem[]; scope: PracticeScope; progress: CourseLesson["practiceProgress"]; published: boolean; archived: boolean;
}) {
  const { t } = useTranslation();
  const practices = items.map((item) => ({ ...item, practice: practiceFromBlock(item.block, progress) }));
  const done = practices.map(({ practice }) => ownStatus(practice).done);
  const [current, setCurrent] = useState(() => Math.max(0, done.indexOf(false)));
  const active = practices[Math.min(current, practices.length - 1)]!;
  const label = (index: number) => {
    const title = practices[index]!.title; const key = title === null ? "stepUntitled" : "step";
    return t(`courses.practice.${key}${done[index] ? "Done" : ""}`, { number: index + 1, title });
  };
  return <section className={styles.stepper} aria-label={t("courses.practice.stepperLabel")}>
    <header className={styles.header}>
      <p className={styles.heading}>
        <span className={styles.eyebrow}>{t("courses.practice.label")}</span>
        <span className={styles.count}>{t("courses.practice.doneOf", { done: done.filter(Boolean).length, total: practices.length })}</span>
      </p>
      <div className={styles.arrows}>
        <IconButton tone="quiet" label={t("courses.practice.previous")} disabled={current === 0} onClick={() => setCurrent(current - 1)}><ChevronLeft aria-hidden="true" /></IconButton>
        <IconButton tone="quiet" label={t("courses.practice.next")} disabled={current === practices.length - 1} onClick={() => setCurrent(current + 1)}><ChevronRight aria-hidden="true" /></IconButton>
      </div>
    </header>
    <QuestionPips label={t("courses.practice.stepperLabel")} current={current} onSelect={setCurrent}
      items={practices.map((item, index) => ({ id: item.block.id, state: done[index] ? "done" as const : "open" as const, label: label(index) }))} />
    <SlidePanel index={current}>
      <div className={styles.body}>
        {active.title && <h3 className={styles.title}>{active.title}</h3>}
        <PracticeSummary step scope={scope} block={active.practice} published={published} archived={archived} />
      </div>
    </SlidePanel>
  </section>;
}
