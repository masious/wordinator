import type { LessonStep } from "@wordinator/contracts/lesson-document";
import { Check, Flag, Trophy, X } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ProgressMeter } from "../../molecules/ProgressMeter";
import { Button, IconButton } from "../../ui";
import { overviewTotals, stopProgress, stopStatus, type LessonOverview, type OverviewStop } from "./overviewModel";
import { OverviewWords } from "./OverviewWords";
import { AnimatedEmoji } from "../../molecules/AnimatedEmoji";
import { notoEmoji } from "./notoEmoji";
import { finishEmoji, startEmoji, stopCategories, type CategoryTone } from "./stopCategories";
import { Slider } from "./StopSlider";
import styles from "./ZigzagOverview.module.css";

type Point = { x: number; y: number };

// Room kept between the trail and its box, so the nodes on its outer edges stay inside it.
const inset = 36;
// The height one band of loops aims for, how round a loop is (its curl radius against half its height), and how far it curls
// back on itself: the trail moves backwards at the bottom of each swing whenever the curl is above 1.
const bandHeight = 210;
const roundness = 0.85;
const curl = 2;
// Each band's loops take this share of the distance between bands; the rest is the gap between them.
const loopShare = 0.4;
const loopSamples = 48;
const turnSamples = 32;
// The least room between two waypoints' centres, so nodes never sit on each other where the trail crosses itself.
const clearance = 92;

const between = (a: Point, b: Point, share: number): Point => ({ x: a.x + (b.x - a.x) * share, y: a.y + (b.y - a.y) * share });

const cubic = (p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point => {
  const u = 1 - t;
  return { x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x, y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y };
};

// A looping trail that starts in the top-left corner and works its way to the bottom of the box in bands. Each band crosses the
// width as a run of loops: the line swings down, curls back on itself at the bottom of the swing, and climbs over the top into
// the next loop. At the end of a band it turns down round the side into the next band, which runs the other way. The waypoints
// are spread evenly along its length.
export function zigzag(width: number, height: number, count: number) {
  const down = Math.max(0, height - 2 * inset);
  const bands = Math.max(2, Math.round(down / bandHeight));
  const step = down / (bands - 1 + 2 * loopShare); const swing = step * loopShare;
  // The turn between bands bulges out beside the loops; the bands leave room for it at either side.
  const reach = step * 0.6; const side = inset + 0.75 * reach;
  const across = Math.max(0, width - 2 * side);
  // As many round loops as fit the width; the last bit of slack is shared out by loosening the curl a little.
  const loops = Math.max(1, Math.round((across * curl) / (2 * Math.PI * roundness * swing)));
  const advance = across / (2 * Math.PI * loops); const radius = advance * curl;
  // A short lead-in from the corner to where the first band's loops begin.
  const samples: Point[] = [{ x: inset, y: inset }];
  for (let band = 0; band < bands; band += 1) {
    const direction = band % 2 === 0 ? 1 : -1; const from = direction > 0 ? side : side + across; const top = inset + band * step;
    if (band > 0) {
      // A U-turn from the end of the band above, round the side and back in at the top of this one.
      const exit = samples.at(-1)!; const entry = { x: from, y: top };
      for (let sample = 1; sample < turnSamples; sample += 1) {
        samples.push(cubic(exit, { x: exit.x - direction * reach, y: exit.y }, { x: entry.x - direction * reach, y: entry.y }, entry, sample / turnSamples));
      }
    }
    for (let sample = 0; sample <= loops * loopSamples; sample += 1) {
      const t = (sample / loopSamples) * 2 * Math.PI;
      samples.push({ x: from + direction * (advance * t + radius * Math.sin(t)), y: top + swing * (1 - Math.cos(t)) });
    }
  }
  const lengths = [0];
  for (let index = 1; index < samples.length; index += 1) lengths.push(lengths[index - 1]! + Math.hypot(samples[index]!.x - samples[index - 1]!.x, samples[index]!.y - samples[index - 1]!.y));
  const total = lengths.at(-1)!;
  const at = (wanted: number): Point => {
    const distance = Math.min(Math.max(wanted, 0), total);
    const found = lengths.findIndex((length) => length >= distance);
    const next = Math.max(1, found < 0 ? lengths.length - 1 : found);
    const a = samples[next - 1]!; const b = samples[next] ?? a;
    const span = lengths[next]! - lengths[next - 1]!;
    return between(a, b, span > 0 ? (distance - lengths[next - 1]!) / span : 0);
  };
  // Waypoints sit at even distances along the trail, except that one landing on a crossing slides along it, by as little as it
  // can and never more than half the way to its neighbours, until it is clear of the ones already placed.
  const gap = count > 1 ? total / (count - 1) : 0;
  const stations: number[] = [];
  const placed: Point[] = [];
  for (let index = 0; index < count; index += 1) {
    const ideal = gap * index; let station = ideal;
    if (index > 0 && index < count - 1) {
      for (let offset = 0; offset < gap / 2; offset += 4) {
        const free = [ideal + offset, ideal - offset].find((candidate) => placed.every((point) => Math.hypot(point.x - at(candidate).x, point.y - at(candidate).y) >= clearance));
        if (free !== undefined) { station = free; break; }
      }
    }
    stations.push(station); placed.push(at(station));
  }
  // The trail up to `distance`: every sample already passed, then the point it stops at.
  const upTo = (distance: number) => [...samples.filter((_, index) => lengths[index]! < distance), at(distance)];
  return { samples, points: stations.map(at), stations, upTo };
}

const line = (points: readonly Point[]) => points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");

function useBox() {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => setBox({ width: element.clientWidth, height: element.clientHeight });
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, box };
}

export type IconStyle = "icons" | "emoji";

// A stop's node is painted in its category's tone. A finished stop keeps its icon and gains a check badge, so the trail still
// shows what kind of work each finished stop was. `icon` draws the node's face; it is told when the waypoint is the current
// stop or pointed at, so an animated emoji can play.
function Waypoint({ point, width, status, selected, label, children, onClick, icon, tone, emoji }: {
  point: Point; width: number; status: "done" | "current" | "upcoming"; selected?: boolean; label: string; children: ReactNode; onClick?: () => void;
  icon: (active: boolean) => ReactNode; tone?: CategoryTone; emoji?: boolean;
}) {
  const [pointed, setPointed] = useState(false);
  // The label leans away from the nearer side so it never leaves the trail box.
  const style = { left: point.x, top: point.y, "--lean": width > 0 ? point.x / width : 0.5 } as CSSProperties;
  const content = <>
    <span className={styles.node} data-tone={tone} data-emoji={emoji || undefined}>
      {icon(pointed || status === "current")}
      {tone && status === "done" && <span className={styles.check}><Check aria-hidden="true" strokeWidth={3} /></span>}
    </span>
    <span className={styles.label}>{children}</span>
  </>;
  const pointer = { onPointerEnter: () => setPointed(true), onPointerLeave: () => setPointed(false), onFocus: () => setPointed(true), onBlur: () => setPointed(false) };
  return onClick
    ? <button type="button" className={styles.waypoint} style={style} data-status={status} data-selected={selected || undefined} aria-label={label} aria-pressed={selected} onClick={onClick} {...pointer}>{content}</button>
    : <span className={styles.waypoint} style={style} data-status={status} data-marker {...pointer}>{content}</span>;
}

// Prototype variation of the lesson overview: the lesson as a winding zigzag trail that fills the page height, with the open
// section played in a panel docked in the bottom-right corner and the new words behind a corner button.
export function ZigzagOverview({ overview, reached, onReach, icons = "emoji" }: {
  overview: LessonOverview; reached: number; onReach: (reached: number) => void; icons?: IconStyle;
}) {
  const { t } = useTranslation();
  const { ref, box } = useBox();
  const current = overview.stops.find((stop) => stopStatus(stop, reached) === "current") ?? null;
  const [open, setOpen] = useState<OverviewStop | null>(current ?? overview.stops[0] ?? null);
  const [staged, setStaged] = useState<LessonStep | null>(null);
  const [wordsOpen, setWordsOpen] = useState(false);
  const active = useMemo(() => new Set(open && staged ? staged.words.map((word) => word.id) : []), [open, staged]);
  const totals = overviewTotals(overview, reached);
  const complete = reached >= overview.steps.length;
  const trail = zigzag(box.width, box.height, overview.stops.length + 2);
  // Waypoints are the start marker (0), each stop, then the finish line. The trail is coloured to the current stop, and on
  // towards the next one as its steps are played.
  const currentIndex = current ? overview.stops.indexOf(current) + 1 : overview.stops.length + 1;
  const doneAt = complete ? trail.stations.at(-1)! : trail.stations[currentIndex - 1]! + (trail.stations[currentIndex]! - trail.stations[currentIndex - 1]!) * (current ? stopProgress(current, reached) : 0);
  const stats = [
    { label: t("courses.overview.stats.sections"), done: totals.stops, total: overview.stops.length },
    { label: t("courses.overview.stats.words"), done: totals.words, total: overview.words },
    { label: t("courses.overview.stats.questions"), done: totals.questions, total: overview.questions },
  ];
  return <main className={styles.page}>
    <div className={styles.trail} ref={ref} role="list" aria-label={t("courses.overview.zigzag.trailLabel")}>
      {box.width > 0 && <svg className={styles.road} width={box.width} height={box.height} aria-hidden="true">
        <path className={styles.track} d={line(trail.samples)} />
        <path className={styles.done} d={line(trail.upTo(doneAt))} />
      </svg>}
      <div role="listitem">
        <Waypoint point={trail.points[0]!} width={box.width} status="done" label={t("courses.overview.begin")} emoji={icons === "emoji"}
          icon={(active) => icons === "emoji" ? <AnimatedEmoji className={styles.emoji} emoji={startEmoji.emoji} {...notoEmoji(startEmoji.codepoint)} playing={active} /> : <Flag aria-hidden="true" />}>
          {t("courses.overview.begin")}
        </Waypoint>
      </div>
      {overview.stops.map((stop, index) => {
        const status = stopStatus(stop, reached);
        const category = stopCategories[stop.category]; const Icon = category.icon;
        const statusLabel = t(status === "current" ? "courses.overview.status.next" : `courses.overview.status.${status}`);
        return <div role="listitem" key={stop.id}>
          <Waypoint point={trail.points[index + 1]!} width={box.width} status={status} selected={open?.id === stop.id}
            label={t("courses.overview.open", { title: stop.title, status: statusLabel })} tone={category.tone} emoji={icons === "emoji"} onClick={() => setOpen(stop)}
            icon={(active) => icons === "emoji"
              ? <AnimatedEmoji className={styles.emoji} emoji={category.emoji} {...notoEmoji(category.codepoint)} playing={active} />
              : <Icon aria-hidden="true" />}>
            <span className={styles.eyebrow}>{t(`courses.overview.categories.${stop.category}`)}</span>
            {stop.title}
          </Waypoint>
        </div>;
      })}
      <div role="listitem">
        <Waypoint point={trail.points.at(-1)!} width={box.width} status={complete ? "done" : "upcoming"} label={t("courses.overview.finishTitle")} emoji={icons === "emoji"}
          icon={(active) => icons === "emoji" ? <AnimatedEmoji className={styles.emoji} emoji={finishEmoji.emoji} {...notoEmoji(finishEmoji.codepoint)} playing={active || complete} /> : <Trophy aria-hidden="true" />}>
          {t("courses.overview.finishTitle")}
        </Waypoint>
      </div>
    </div>

    <header className={styles.summary}>
      <p className={styles.eyebrow}>{t("courses.overview.eyebrow")}</p>
      <h1 title={overview.goal ?? undefined}>{overview.title}</h1>
      <div className={styles.meter}>
        <ProgressMeter value={totals.percent} label={t("courses.overview.progressLabel")} size="compact" />
        <span>{totals.percent}%</span>
      </div>
      <dl className={styles.stats}>{stats.map((stat) => <div key={stat.label}>
        <dt>{stat.label}</dt><dd>{t("courses.overview.stats.value", { done: stat.done, total: stat.total })}</dd>
      </div>)}</dl>
      {/* Prototype: the reader's position is simulated until the overview reads the saved one. */}
      <label className={styles.simulator}>
        <span>{t("courses.overview.prototype.label")}</span>
        <input type="range" min={0} max={overview.steps.length} value={reached} onChange={(event) => onReach(Number(event.currentTarget.value))} />
        <span>{t("courses.overview.prototype.value", { current: reached, total: overview.steps.length })}</span>
      </label>
    </header>

    <section className={styles.panel} aria-label={open ? open.title : t("courses.overview.zigzag.panelLabel")} data-open={open ? true : undefined}>
      {open
        ? <>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.eyebrow}>
                {icons === "emoji" && <AnimatedEmoji className={styles.panelEmoji} emoji={stopCategories[open.category].emoji} {...notoEmoji(stopCategories[open.category].codepoint)} />}
                {t(`courses.overview.categories.${open.category}`)}
              </span>
              <h2>{open.title}</h2>
            </div>
            <IconButton label={t("courses.overview.zigzag.close")} onClick={() => setOpen(null)}><X aria-hidden="true" size={18} /></IconButton>
          </div>
          <div className={styles.panelBody}>
            <Slider key={open.id} overview={overview} stop={open} reached={reached} onReach={onReach} onNextStop={setOpen} onClose={() => setOpen(null)}
              onStep={setStaged} onShowWords={() => setWordsOpen(true)}
              badge={icons === "emoji" ? <AnimatedEmoji emoji={stopCategories[open.category].emoji} {...notoEmoji(stopCategories[open.category].codepoint)} playing /> : undefined} />
          </div>
        </>
        : <div className={styles.collapsed}>
          <p>{current ? <><span className={styles.eyebrow}>{t("courses.overview.status.next")}</span>{current.title}</> : t("courses.overview.finishDone")}</p>
          {current && <Button onClick={() => setOpen(current)}>{t(reached > current.start ? "courses.overview.continue" : "courses.overview.start")}</Button>}
        </div>}
    </section>

    <OverviewWords overview={overview} reached={reached} active={active} open={wordsOpen} onOpenChange={setWordsOpen} />
  </main>;
}
