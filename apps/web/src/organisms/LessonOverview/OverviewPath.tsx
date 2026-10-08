import { BookOpen, BookOpenText, Check, Flag, MessagesSquare, PencilLine, Trophy, type LucideIcon } from "lucide-react";
import { Fragment, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { stopProgress, stopStatus, type LessonOverview, type OverviewKind, type OverviewStop } from "./overviewModel";
import styles from "./OverviewPath.module.css";

const kindIcons = { topic: BookOpen, story: MessagesSquare, practice: PencilLine, reading: BookOpenText } as const satisfies Record<OverviewKind, LucideIcon>;

// Waypoint `index` (the start marker is 0) sets where the road bends. Wide screens wind across a central band with cards in
// the outer columns, on the side the road leans towards; narrow screens wind down a thin lane with every card to its right.
function bend(index: number) {
  const wave = Math.sin((index * Math.PI) / 4);
  const side = wave < 0 || (wave === 0 && index % 8 === 4) ? "left" : "right";
  return { style: { "--x-wide": 50 + 38 * wave, "--x-narrow": 50 + 30 * wave } as CSSProperties, side };
}

type Point = { x: number; y: number };
// Vertical tangents at every waypoint, so the road leaves and enters each stop straight and swings between them.
const road = (points: readonly Point[]) => points.map((point, index) => {
  if (index === 0) return `M${point.x} ${point.y}`;
  const from = points[index - 1]!; const middle = (from.y + point.y) / 2;
  return `C${from.x} ${middle} ${point.x} ${middle} ${point.x} ${point.y}`;
}).join(" ");

// Centres from layout offsets rather than bounding boxes, so entry and pop animations never bend the road.
function centre(element: HTMLElement, container: HTMLElement): Point {
  let x = element.offsetWidth / 2; let y = element.offsetHeight / 2;
  for (let node: HTMLElement | null = element; node && node !== container; node = node.offsetParent as HTMLElement | null) {
    x += node.offsetLeft; y += node.offsetTop;
  }
  return { x, y };
}

function useRoad(deps: unknown) {
  const ref = useRef<HTMLOListElement>(null);
  const [shape, setShape] = useState<{ width: number; height: number; points: Point[] }>({ width: 0, height: 0, points: [] });
  useLayoutEffect(() => {
    const list = ref.current;
    if (!list) return;
    const measure = () => setShape({
      width: list.offsetWidth, height: list.offsetHeight,
      points: [...list.querySelectorAll<HTMLElement>("[data-waypoint]")].map((element) => centre(element, list)),
    });
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, [deps]);
  return { ref, shape };
}

function StopCard({ stop, reached, onOpen }: { stop: OverviewStop; reached: number; onOpen: () => void }) {
  const { t } = useTranslation();
  const status = stopStatus(stop, reached); const progress = stopProgress(stop, reached);
  const started = status === "current" && progress > 0;
  const Icon = status === "done" ? Check : kindIcons[stop.kind];
  const statusLabel = status === "current" ? t(started ? "courses.overview.status.inProgress" : "courses.overview.status.next") : t(`courses.overview.status.${status}`);
  const facts = [
    t("courses.overview.steps", { count: stop.end - stop.start }),
    stop.lines > 0 && t("courses.overview.lines", { count: stop.lines }),
    stop.questions > 0 && t("courses.overview.questions", { count: stop.questions }),
    stop.words.length > 0 && t("courses.overview.words", { count: stop.words.length }),
  ].filter(Boolean);
  return <button type="button" className={styles.stop} data-status={status} data-kind={stop.kind} onClick={onOpen}
    aria-label={t("courses.overview.open", { title: stop.title, status: statusLabel })}>
    <span className={styles.lane}>
      <span className={styles.node} data-waypoint style={{ "--progress": `${progress * 100}%` } as CSSProperties}>
        <Icon aria-hidden="true" strokeWidth={2.25} />
      </span>
      {status === "current" && <span className={styles.bubble}>{started
        ? t("courses.overview.stepOf", { current: reached - stop.start + 1, total: stop.end - stop.start })
        : t("courses.overview.status.next")}</span>}
    </span>
    <span className={styles.card}>
      <span className={styles.eyebrow}>{t(`courses.overview.kinds.${stop.kind}`)}<span aria-hidden="true"> · </span>{statusLabel}</span>
      <span className={styles.title}>{stop.title}</span>
      {stop.speakers.length > 0 && <span className={styles.speakers}>{stop.speakers.join(" · ")}</span>}
      {stop.teaser && <span className={styles.teaser}>{stop.teaser}</span>}
      <span className={styles.facts}>{facts.map((fact, index) => <span key={index}>{fact}</span>)}</span>
      {stop.words.length > 0 && <span className={styles.terms}>
        {stop.words.slice(0, 4).map((word) => <span key={word.id} className={styles.term}>{word.term}</span>)}
        {stop.words.length > 4 && <span className={styles.more}>{t("courses.overview.moreWords", { count: stop.words.length - 4 })}</span>}
      </span>}
    </span>
  </button>;
}

// The lesson as one winding road: a start marker, a stop per section, and a finish line. The road is painted in the done colour
// up to the stop the reader is on, so the next stop is always where the colour ends.
export function OverviewPath({ overview, reached, onOpen }: { overview: LessonOverview; reached: number; onOpen: (stop: OverviewStop) => void }) {
  const { t } = useTranslation();
  const { ref, shape } = useRoad(overview);
  const complete = reached >= overview.steps.length;
  const current = overview.stops.findIndex((stop) => stopStatus(stop, reached) === "current");
  // Waypoints are the start marker, each stop, then the finish line.
  const lastDone = complete ? overview.stops.length + 1 : current + 1;
  const chapterSizes = new Map<string, number>();
  for (const stop of overview.stops) if (stop.chapter) chapterSizes.set(stop.chapter, (chapterSizes.get(stop.chapter) ?? 0) + 1);
  const finish = bend(overview.stops.length + 1);
  const done = shape.points.slice(0, lastDone + 1);
  return <div className={styles.frame}>
    {shape.points.length > 1 && <svg className={styles.road} width={shape.width} height={shape.height} viewBox={`0 0 ${shape.width} ${shape.height}`} aria-hidden="true">
      <path className={styles.track} d={road(shape.points)} />
      <path className={styles.centreLine} d={road(shape.points)} />
      {done.length > 1 && <path className={styles.done} d={road(done.slice(0, -1))} />}
      {/* The newest stretch draws itself in when the reader moves on. */}
      {done.length > 1 && <path key={lastDone} className={`${styles.done} ${styles.newest}`} d={road(done.slice(-2))} pathLength={1} />}
    </svg>}
    <ol className={styles.list} ref={ref}>
      <li className={styles.row} data-side={bend(0).side} style={bend(0).style}>
        <span className={styles.marker}>
          <span className={styles.lane}><span className={styles.node} data-waypoint data-status="done"><Flag aria-hidden="true" strokeWidth={2.25} /></span></span>
          <span className={styles.card}><span className={styles.title}>{t("courses.overview.begin")}</span></span>
        </span>
      </li>
      {overview.stops.map((stop, index) => {
        const opensChapter = stop.chapter && stop.chapter !== overview.stops[index - 1]?.chapter && (chapterSizes.get(stop.chapter) ?? 0) > 1;
        const { style, side } = bend(index + 1);
        return <Fragment key={stop.id}>
          {opensChapter && <li className={styles.chapter}><span>{stop.chapter}</span></li>}
          <li className={styles.row} data-side={side} style={style}><StopCard stop={stop} reached={reached} onOpen={() => onOpen(stop)} /></li>
        </Fragment>;
      })}
      <li className={styles.row} data-side={finish.side} style={finish.style}>
        <span className={styles.marker} data-finish>
          <span className={styles.lane}><span className={styles.node} data-waypoint data-status={complete ? "done" : "upcoming"} data-trophy><Trophy aria-hidden="true" strokeWidth={2.25} /></span></span>
          <span className={styles.card}>
            <span className={styles.title}>{t("courses.overview.finishTitle")}</span>
            <span className={styles.teaser}>{t(complete ? "courses.overview.finishDone" : "courses.overview.finishHelp")}</span>
          </span>
        </span>
      </li>
    </ol>
  </div>;
}
