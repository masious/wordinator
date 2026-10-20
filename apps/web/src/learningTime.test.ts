import type { LearningTimeEntry } from "@wordinator/contracts/learning";
import { describe, expect, it, vi } from "vitest";
import { IDLE_MS, LearningClock, type TimeTarget } from "./learningTime";

// The learning time clock (docs/learning-time.md#the-clock): idle cut-off, pauses, the claim on top, day splitting, and sending.
const groupId = "g"; const courseId = "c"; const lessonId = "l";
const reading: TimeTarget = { activity: "reading", focus: "lesson", courseId, lessonId };
const practice: TimeTarget = { activity: "practice", courseId, lessonId, practiceId: "p" };

function setup(start = new Date(2026, 9, 20, 12, 0, 0).getTime()) {
  let now = start; let active = true;
  const sent: Array<{ day: string; entries: LearningTimeEntry[] }> = [];
  let fail = false;
  const send = vi.fn(async (_group: string, day: string, entries: LearningTimeEntry[]) => { if (fail) throw new Error("offline"); sent.push({ day, entries }); });
  const clock = new LearningClock(send, () => now, () => active);
  return {
    clock, sent, send,
    advance: (ms: number) => { now += ms; },
    setActive: (value: boolean) => { active = value; },
    setFail: (value: boolean) => { fail = value; },
  };
}

describe("LearningClock", () => {
  it("counts the claim on top and stops at the idle cut-off", async () => {
    const s = setup();
    const release = s.clock.claim({ groupId, target: () => reading });
    s.advance(30_000);
    expect(s.clock.pendingSeconds(() => true)).toBe(30);
    // No interaction for longer than the cut-off: only IDLE_MS since the last interaction counts.
    s.advance(IDLE_MS * 2);
    expect(s.clock.pendingSeconds(() => true)).toBe(IDLE_MS / 1000);
    s.clock.interact(); s.advance(10_000);
    expect(s.clock.pendingSeconds(() => true)).toBe(IDLE_MS / 1000 + 10);
    release();
    await vi.waitFor(() => expect(s.sent).toHaveLength(1));
    expect(s.sent[0]!.entries).toEqual([{ ...reading, seconds: IDLE_MS / 1000 + 10 }]);
  });

  it("pauses while the page is hidden or unfocused", () => {
    const s = setup();
    s.clock.claim({ groupId, target: () => reading });
    s.advance(10_000); s.clock.settle();
    s.setActive(false); s.advance(20_000); s.clock.settle();
    s.setActive(true); s.clock.interact(); s.advance(5_000);
    expect(s.clock.pendingSeconds(() => true)).toBe(15);
  });

  it("hands time to a claim pushed on top and back when it ends", () => {
    const s = setup();
    s.clock.claim({ groupId, target: () => reading });
    s.advance(10_000);
    const release = s.clock.claim({ groupId, target: () => practice });
    s.advance(20_000); release();
    s.advance(5_000);
    expect(s.clock.pendingSeconds((target) => target.activity === "reading")).toBe(15);
    expect(s.clock.pendingSeconds((target) => target.activity === "practice")).toBe(20);
  });

  it("reads a claim's target when it counts, so reading's focus can change", () => {
    const s = setup(); let focus: "lesson" | "grammar" = "lesson";
    s.clock.claim({ groupId, target: () => ({ ...reading, focus }) });
    s.advance(10_000); s.clock.settle();
    focus = "grammar"; s.clock.interact(); s.advance(4_000);
    expect(s.clock.pendingSeconds((target) => target.activity === "reading" && target.focus === "grammar")).toBe(4);
  });

  it("keeps each local day apart", async () => {
    const s = setup(new Date(2026, 9, 20, 23, 59, 50).getTime());
    s.clock.claim({ groupId, target: () => reading });
    s.advance(5_000); s.clock.settle();
    s.advance(10_000); s.clock.interact();
    await s.clock.flush();
    expect(s.sent.map((send) => [send.day, send.entries[0]!.seconds])).toEqual([["2026-10-20", 5], ["2026-10-21", 10]]);
  });

  it("sends whole seconds, keeps the remainder, and puts a failed send back", async () => {
    const s = setup();
    s.clock.claim({ groupId, target: () => reading });
    s.advance(2_500);
    s.setFail(true);
    await s.clock.flush();
    expect(s.clock.pendingSeconds(() => true)).toBe(2);
    s.setFail(false); s.clock.interact(); s.advance(1_000);
    await s.clock.flush();
    expect(s.sent[0]!.entries).toEqual([{ ...reading, seconds: 3 }]);
    expect(s.clock.pendingSeconds(() => true)).toBe(0);
  });

  it("splits long time into entries of at most ten minutes", async () => {
    const s = setup();
    s.clock.claim({ groupId, target: () => reading });
    for (let minute = 0; minute < 25; minute += 1) { s.advance(60_000); s.clock.interact(); }
    await s.clock.flush();
    expect(s.sent[0]!.entries.map((entry) => entry.seconds)).toEqual([600, 600, 300]);
  });

  it("counts nothing without a claim", async () => {
    const s = setup();
    s.advance(60_000); s.clock.interact();
    await s.clock.flush();
    expect(s.send).not.toHaveBeenCalled();
  });
});
