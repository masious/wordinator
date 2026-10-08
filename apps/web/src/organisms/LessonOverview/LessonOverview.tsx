import { useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { Button, LabelChip } from "../../ui";
import { OverviewPath } from "./OverviewPath";
import { overviewTotals, stopStatus, type LessonOverview as LessonOverviewData, type OverviewStop } from "./overviewModel";
import { StopSlider } from "./StopSlider";
import styles from "./LessonOverview.module.css";

function ProgressRing({ percent, label }: { percent: number; label: string }) {
  return <div className={styles.ring} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}
    data-complete={percent >= 100 || undefined} style={{ "--percent": `${percent}%` } as CSSProperties}>
    <span className={styles.ringValue}>{percent}<small>%</small></span>
  </div>;
}

// Prototype: lesson progress is a step index the reviewer can set here until the overview reads the real saved position.
function ProgressSimulator({ reached, total, onChange }: { reached: number; total: number; onChange: (reached: number) => void }) {
  const { t } = useTranslation();
  return <div className={styles.simulator}>
    <label className={styles.simulatorLabel} htmlFor="overview-simulator">{t("courses.overview.prototype.label")}</label>
    <input id="overview-simulator" className={styles.range} type="range" min={0} max={total} value={reached} onChange={(event) => onChange(Number(event.currentTarget.value))} />
    <span className={styles.simulatorValue}>{t("courses.overview.prototype.value", { current: reached, total })}</span>
  </div>;
}

// One lesson at a glance: how far the reader has come, and every section still between them and the finish line.
export function LessonOverview({ overview, reached, onReach }: { overview: LessonOverviewData; reached: number; onReach: (reached: number) => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<OverviewStop | null>(null);
  const totals = overviewTotals(overview, reached);
  const next = overview.stops.find((stop) => stopStatus(stop, reached) === "current");
  const stats = [
    { label: t("courses.overview.stats.sections"), done: totals.stops, total: overview.stops.length },
    { label: t("courses.overview.stats.steps"), done: Math.min(reached, overview.steps.length), total: overview.steps.length },
    { label: t("courses.overview.stats.words"), done: totals.words, total: overview.words },
    { label: t("courses.overview.stats.questions"), done: totals.questions, total: overview.questions },
  ];
  return <main className={styles.page}>
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.intro}>
          <LabelChip>{t("courses.overview.eyebrow")}</LabelChip>
          <h1>{overview.title}</h1>
          {overview.goal && <p>{overview.goal}</p>}
        </div>
        <section className={styles.summary} aria-label={t("courses.overview.progressLabel")}>
          <ProgressRing percent={totals.percent} label={t("courses.overview.progressLabel")} />
          <dl className={styles.stats}>{stats.map((stat) => <div key={stat.label}>
            <dt>{stat.label}</dt>
            <dd>{t("courses.overview.stats.value", { done: stat.done, total: stat.total })}</dd>
          </div>)}</dl>
          {next
            ? <div className={styles.next}>
              <p><span className={styles.nextLabel}>{t("courses.overview.status.next")}</span>{next.title}</p>
              <Button onClick={() => setOpen(next)}>{t(reached > next.start ? "courses.overview.continue" : "courses.overview.start")}</Button>
            </div>
            : <p className={styles.complete}>{t("courses.overview.finishDone")}</p>}
        </section>
      </header>
      <OverviewPath overview={overview} reached={reached} onOpen={setOpen} />
    </div>
    <ProgressSimulator reached={reached} total={overview.steps.length} onChange={onReach} />
    <StopSlider overview={overview} stop={open} reached={reached} onReach={onReach} onChangeStop={setOpen} onClose={() => setOpen(null)} />
  </main>;
}
