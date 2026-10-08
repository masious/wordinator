import { useMediaQuery } from "@mantine/hooks";
import { BookOpen, BookOpenText, Check, Flag, MessagesSquare, PencilLine, Trophy, type LucideIcon } from "lucide-react";
import { Fragment, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { stopProgress, stopStatus, type LessonOverview, type OverviewKind, type OverviewStop } from "./overviewModel";
import styles from "./OverviewPath.module.css";

const kindIcons = { topic: BookOpen, story: MessagesSquare, practice: PencilLine, reading: BookOpenText } as const satisfies Record<OverviewKind, LucideIcon>;

// A fixed pseudo-random number in [0, 1) for a waypoint, so the road bends differently at every stop but the same on every visit.
const noise = (index: number, salt: number) => {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
};

// Narrow screens read the lesson as one lane winding down the left edge. Wider screens lay it out as a board: stops snake across
// the columns, left to right and then back, and the road turns in the page margin at the end of each row.
function useColumns() {
  const options = { getInitialValueInEffect: false };
  const board = useMediaQuery("(min-width: 48em)", undefined, options);
  const three = useMediaQuery("(min-width: 64em)", undefined, options);
  const four = useMediaQuery("(min-width: 100em)", undefined, options);
  return four ? 4 : three ? 3 : board ? 2 : 1;
}

function place(index: number, columns: number) {
  if (columns === 1) return { style: { "--x": 50 + 22 * Math.sin((index * Math.PI) / 4) } as CSSProperties };
  const row = Math.floor(index / columns); const offset = index % columns;
  return {
    style: {
      gridRow: row + 1, gridColumn: (row % 2 === 0 ? offset : columns - 1 - offset) + 1,
      "--x": 50 + (noise(index, 1) * 2 - 1) * 24, "--drop": noise(index, 2),
    } as CSSProperties,
  };
}

type Point = { x: number; y: number };
type Shape = { width: number; height: number; points: Point[] };

// The road between waypoints `from` and `from + 1`. In the lane it leaves and enters each stop vertically. On the board it runs
// sideways with a seeded wobble along each row, and swings out into the margin to turn into the next row.
function segment(a: Point, b: Point, from: number, columns: number, width: number) {
  if (columns === 1) {
    const middle = (a.y + b.y) / 2;
    return `C${a.x} ${middle} ${b.x} ${middle} ${b.x} ${b.y}`;
  }
  if (Math.floor(from / columns) !== Math.floor((from + 1) / columns)) {
    const right = Math.floor(from / columns) % 2 === 0; const margin = 14;
    // A cubic with both handles level with its ends peaks at three quarters of the handle distance.
    const reach = right ? (width - margin - Math.max(a.x, b.x)) / 0.75 : (Math.min(a.x, b.x) - margin) / 0.75;
    const x = right ? Math.max(a.x, b.x) + reach : Math.min(a.x, b.x) - reach;
    return `C${x} ${a.y} ${x} ${b.y} ${b.x} ${b.y}`;
  }
  const span = b.x - a.x; const wobble = 70;
  return `C${a.x + span / 3} ${a.y + (noise(from, 3) * 2 - 1) * wobble} ${b.x - span / 3} ${b.y + (noise(from, 4) * 2 - 1) * wobble} ${b.x} ${b.y}`;
}

const road = (points: readonly Point[], first: number, columns: number, width: number) => points.map((point, index) =>
  index === 0 ? `M${point.x} ${point.y}` : segment(points[index - 1]!, point, first + index - 1, columns, width)).join(" ");

// Centres from layout offsets rather than bounding boxes, so entry and pop animations never bend the road.
function centre(element: HTMLElement, container: HTMLElement): Point {
  let x = element.offsetWidth / 2; let y = element.offsetHeight / 2;
  for (let node: HTMLElement | null = element; node && node !== container; node = node.offsetParent as HTMLElement | null) {
    x += node.offsetLeft; y += node.offsetTop;
  }
  return { x, y };
}

function useRoad(overview: LessonOverview, columns: number) {
  const ref = useRef<HTMLOListElement>(null);
  const [shape, setShape] = useState<Shape>({ width: 0, height: 0, points: [] });
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
  }, [overview, columns]);
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
      {/* The progress ring is centred on the stop, not drawn by the node, so the node's press and hover effects never move it. */}
      {status === "current" && <svg className={styles.ring} viewBox="0 0 100 100" aria-hidden="true">
        <circle className={styles.ringTrack} cx="50" cy="50" r="46" />
        <circle className={styles.ringFill} cx="50" cy="50" r="46" pathLength={100} strokeDasharray={`${progress * 100} 100`} />
      </svg>}
      <span className={styles.node} data-waypoint>
        <Icon aria-hidden="true" strokeWidth={2.25} />
      </span>
      {status === "current" && <span className={styles.bubble}>{started
        ? t("courses.overview.stepOf", { current: reached - stop.start + 1, total: stop.end - stop.start })
        : t("courses.overview.status.next")}</span>}
    </span>
    {/* The slot holds one line in the layout; the card draws over it and opens on hover or focus without moving anything.
        The current stop stays open so the next step is always in view. */}
    <span className={styles.slot} data-open={status === "current" || undefined}>
      <span className={styles.card}>
        <span className={styles.reveal}><span className={styles.revealAbove}>
          <span className={styles.eyebrow}>{t(`courses.overview.kinds.${stop.kind}`)}<span aria-hidden="true"> · </span>{statusLabel}</span>
        </span></span>
        <span className={styles.title}>{stop.title}</span>
        <span className={styles.reveal}><span className={styles.revealBelow}>
          {stop.speakers.length > 0 && <span className={styles.speakers}>{stop.speakers.join(" · ")}</span>}
          {stop.teaser && <span className={styles.teaser}>{stop.teaser}</span>}
          <span className={styles.facts}>{facts.map((fact, index) => <span key={index}>{fact}</span>)}</span>
          {stop.words.length > 0 && <span className={styles.terms}>
            {stop.words.slice(0, 4).map((word) => <span key={word.id} className={styles.term}>{word.term}</span>)}
            {stop.words.length > 4 && <span className={styles.more}>{t("courses.overview.moreWords", { count: stop.words.length - 4 })}</span>}
          </span>}
        </span></span>
      </span>
    </span>
  </button>;
}

function Marker({ icon, status, trophy, children }: { icon: ReactNode; status: "done" | "upcoming"; trophy?: boolean; children: ReactNode }) {
  return <span className={styles.marker}>
    <span className={styles.lane}><span className={styles.node} data-waypoint data-status={status} data-trophy={trophy || undefined}>{icon}</span></span>
    <span className={styles.card}>{children}</span>
  </span>;
}

// The lesson as one winding road: a start marker, a stop per section, and a finish line. The road is painted in the done colour
// up to the stop the reader is on, so the next stop is always where the colour ends.
export function OverviewPath({ overview, reached, onOpen }: { overview: LessonOverview; reached: number; onOpen: (stop: OverviewStop) => void }) {
  const { t } = useTranslation();
  const columns = useColumns();
  const { ref, shape } = useRoad(overview, columns);
  const complete = reached >= overview.steps.length;
  const current = overview.stops.findIndex((stop) => stopStatus(stop, reached) === "current");
  // Waypoints are the start marker (0), each stop, then the finish line.
  const lastDone = complete ? overview.stops.length + 1 : current + 1;
  const chapterSizes = new Map<string, number>();
  for (const stop of overview.stops) if (stop.chapter) chapterSizes.set(stop.chapter, (chapterSizes.get(stop.chapter) ?? 0) + 1);
  const done = shape.points.slice(0, lastDone + 1);
  const paint = (points: readonly Point[], first: number) => road(points, first, columns, shape.width);
  const finish = place(overview.stops.length + 1, columns);
  return <div className={styles.frame} data-layout={columns > 1 ? "board" : "lane"}>
    {shape.points.length > 1 && <svg className={styles.road} width={shape.width} height={shape.height} viewBox={`0 0 ${shape.width} ${shape.height}`} aria-hidden="true">
      <path className={styles.track} d={paint(shape.points, 0)} />
      <path className={styles.centreLine} d={paint(shape.points, 0)} />
      {done.length > 2 && <path className={styles.done} d={paint(done.slice(0, -1), 0)} />}
      {/* The newest stretch draws itself in when the reader moves on. */}
      {done.length > 1 && <path key={lastDone} className={`${styles.done} ${styles.newest}`} d={paint(done.slice(-2), done.length - 2)} pathLength={1} />}
    </svg>}
    <ol className={styles.list} ref={ref} style={{ "--columns": columns } as CSSProperties}>
      <li className={styles.row} style={place(0, columns).style}>
        <Marker icon={<Flag aria-hidden="true" strokeWidth={2.25} />} status="done"><span className={styles.title}>{t("courses.overview.begin")}</span></Marker>
      </li>
      {overview.stops.map((stop, index) => {
        const opensChapter = stop.chapter && stop.chapter !== overview.stops[index - 1]?.chapter && (chapterSizes.get(stop.chapter) ?? 0) > 1;
        // The lane gives a chapter its own banner row; on the board the chapter rides above its first stop.
        return <Fragment key={stop.id}>
          {opensChapter && columns === 1 && <li className={styles.chapter}><span>{stop.chapter}</span></li>}
          <li className={styles.row} style={place(index + 1, columns).style}>
            {opensChapter && columns > 1 && <span className={styles.chapterTag}>{stop.chapter}</span>}
            <StopCard stop={stop} reached={reached} onOpen={() => onOpen(stop)} />
          </li>
        </Fragment>;
      })}
      <li className={styles.row} style={finish.style}>
        <Marker icon={<Trophy aria-hidden="true" strokeWidth={2.25} />} status={complete ? "done" : "upcoming"} trophy>
          <span className={styles.title}>{t("courses.overview.finishTitle")}</span>
          <span className={styles.teaser}>{t(complete ? "courses.overview.finishDone" : "courses.overview.finishHelp")}</span>
        </Marker>
      </li>
    </ol>
  </div>;
}
