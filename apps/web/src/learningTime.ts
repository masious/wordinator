import { LEARNING_TIME_ENTRIES_MAX, LEARNING_TIME_SECONDS_MAX, localDayOf, type LearningTimeEntry } from "@wordinator/contracts/learning";
import { useEffect, useRef, useState } from "react";

// The learning time clock (C15, docs/learning-time.md#the-clock): it counts active seconds for the claim on top, keeps them per
// target and local day, and sends them once a minute, when the page is hidden, and when a claim ends. Nothing is kept in browser
// storage. Displays read the server's totals plus `pendingSeconds` and refresh once a minute.

// Time counts while the learner has interacted within this long.
export const IDLE_MS = 90_000;
export const SEND_INTERVAL_MS = 60_000;
const TICK_MS = 5_000;
const ACTIVITY_EVENTS = ["scroll", "wheel", "keydown", "pointerdown", "pointermove", "touchstart", "input"] as const;

// What a claim measures: the entry without its seconds. Reading's focus can change while it runs, so a claim reads it when it counts.
export type TimeTarget = LearningTimeEntry extends infer E ? E extends LearningTimeEntry ? Omit<E, "seconds"> : never : never;
export type TimeClaim = { groupId: string; target: () => TimeTarget };
type Bucket = { groupId: string; day: string; target: TimeTarget; ms: number };
type Send = (groupId: string, day: string, entries: LearningTimeEntry[]) => Promise<void>;

const targetKey = (groupId: string, day: string, target: TimeTarget) => JSON.stringify([groupId, day, target]);

export class LearningClock {
  private claims: TimeClaim[] = [];
  private buckets = new Map<string, Bucket>();
  private mark: number;
  private lastInteraction: number;
  private listeners = new Set<() => void>();
  private sending: Promise<void> | null = null;

  constructor(private readonly send: Send, private readonly now: () => number = Date.now, private readonly active: () => boolean = () => true) {
    this.mark = now(); this.lastInteraction = now();
  }

  /** Credits the time since the last settle to the claim on top, up to the idle cut-off, then moves the mark to now. */
  settle() {
    const now = this.now(); const claim = this.claims.at(-1);
    const end = Math.min(now, this.lastInteraction + IDLE_MS);
    if (claim && this.active() && end > this.mark) {
      const target = claim.target(); const day = localDayOf(new Date(end));
      const key = targetKey(claim.groupId, day, target);
      const bucket = this.buckets.get(key) ?? { groupId: claim.groupId, day, target, ms: 0 };
      bucket.ms += end - this.mark;
      this.buckets.set(key, bucket);
    }
    this.mark = now;
  }

  /** The learner did something: time up to now counts, and the idle cut-off starts again. */
  interact() { this.settle(); this.lastInteraction = this.now(); }

  /** Puts a claim on top; the returned function removes it (and sends what it had once no claim is left). */
  claim(claim: TimeClaim): () => void {
    this.settle(); this.lastInteraction = this.now();
    this.claims.push(claim);
    return () => {
      this.settle();
      this.claims = this.claims.filter((entry) => entry !== claim);
      if (!this.claims.length) void this.flush();
    };
  }

  /** Seconds counted but not yet sent, for targets matching `where`. */
  pendingSeconds(where: (target: TimeTarget) => boolean): number {
    this.settle();
    let ms = 0;
    for (const bucket of this.buckets.values()) if (where(bucket.target)) ms += bucket.ms;
    return Math.floor(ms / 1000);
  }

  /** Called after a send, with what was sent, so displays can move it into their server totals. */
  subscribe(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }

  /** Sends every whole second counted so far. A failed send puts its seconds back for the next one. */
  async flush(): Promise<void> {
    if (this.sending) await this.sending.catch(() => undefined);
    this.settle();
    const groups = new Map<string, Bucket[]>();
    for (const bucket of this.buckets.values()) {
      if (bucket.ms < 1000) continue;
      const key = JSON.stringify([bucket.groupId, bucket.day]);
      groups.set(key, [...groups.get(key) ?? [], bucket]);
    }
    if (!groups.size) return;
    const work = [...groups.values()].flatMap((buckets) => {
      const entries: Array<{ bucket: Bucket; entry: LearningTimeEntry; ms: number }> = [];
      for (const bucket of buckets) {
        let seconds = Math.floor(bucket.ms / 1000);
        bucket.ms -= seconds * 1000;
        for (; seconds > 0; seconds -= LEARNING_TIME_SECONDS_MAX) {
          const part = Math.min(seconds, LEARNING_TIME_SECONDS_MAX);
          entries.push({ bucket, entry: { ...bucket.target, seconds: part } as LearningTimeEntry, ms: part * 1000 });
        }
      }
      const chunks = [];
      for (let index = 0; index < entries.length; index += LEARNING_TIME_ENTRIES_MAX) chunks.push(entries.slice(index, index + LEARNING_TIME_ENTRIES_MAX));
      return chunks.map((chunk) => this.send(buckets[0]!.groupId, buckets[0]!.day, chunk.map((item) => item.entry))
        .then(() => { for (const listener of this.listeners) listener(); },
          () => { for (const item of chunk) item.bucket.ms += item.ms; }));
    });
    this.sending = Promise.all(work).then(() => undefined);
    await this.sending;
    this.sending = null;
  }

  /** Whether a claim is running, for tests and displays. */
  get running() { return this.claims.length > 0; }
}

const visible = () => typeof document === "undefined" || (document.visibilityState === "visible" && document.hasFocus());

let shared: LearningClock | null = null;
let sendTime: Send | null = null;
/** The app's one clock. `configureLearningClock` gives it its send function once, at start-up. */
export function learningClock(): LearningClock {
  if (shared) return shared;
  const clock = new LearningClock((groupId, day, entries) => sendTime ? sendTime(groupId, day, entries) : Promise.reject(new Error("not configured")), Date.now, visible);
  shared = clock;
  if (typeof window === "undefined") return clock;
  for (const type of ACTIVITY_EVENTS) window.addEventListener(type, () => { if (clock.running) clock.interact(); }, { passive: true, capture: true });
  const pause = () => { clock.settle(); if (document.visibilityState === "hidden") void clock.flush(); };
  document.addEventListener("visibilitychange", pause);
  window.addEventListener("blur", () => clock.settle());
  window.addEventListener("focus", () => clock.settle());
  window.addEventListener("pagehide", () => void clock.flush());
  window.setInterval(() => clock.settle(), TICK_MS);
  window.setInterval(() => { if (clock.running) void clock.flush(); }, SEND_INTERVAL_MS);
  return clock;
}
export function configureLearningClock(send: Send) { sendTime = send; }
/** Sends what the clock has, for flows whose next request reads the time (finishing a practice). */
export const flushLearningTime = () => learningClock().flush();

/** Runs a claim while `claim` is not null. The claim's target is read through a ref, so a new object each render is fine. */
export function useLearningClaim(claim: TimeClaim | null) {
  const latest = useRef(claim); latest.current = claim;
  const on = claim !== null; const groupId = claim?.groupId;
  useEffect(() => {
    if (!on || !groupId) return;
    return learningClock().claim({ groupId, target: () => latest.current!.target() });
  }, [on, groupId]);
}

/** Re-renders once a minute and after every send, for displays that add pending seconds to server totals. */
export function useMinuteRefresh() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((tick) => tick + 1);
    const timer = window.setInterval(bump, SEND_INTERVAL_MS);
    const unsubscribe = learningClock().subscribe(bump);
    return () => { window.clearInterval(timer); unsubscribe(); };
  }, []);
}

