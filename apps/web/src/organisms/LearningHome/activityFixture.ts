import { localDayOf, type LearningActivityRange } from "@wordinator/contracts/learning";

// A learning-activity read for the dashboard tests: every day of the range ending today, zero-filled, with `today` carrying the parts.
const DAY = 86_400_000;

export type Totals = { lesson: number; grammar: number; practice: number; vocabulary: number; aiPractice: number };
const emptyFocus = { grammar: 0, vocabulary: 0, reading: 0, listening: 0, writing: 0 };
const dayRow = (day: string, parts: Partial<Totals> = {}) => {
  const values = { lesson: 0, grammar: 0, practice: 0, vocabulary: 0, aiPractice: 0, ...parts };
  return { day, ...values, total: Object.values(values).reduce((sum, seconds) => sum + seconds, 0), aiPracticeFocus: emptyFocus };
};

export function activity(range: LearningActivityRange, options: { today?: Partial<Totals>; previousTotal?: number; goal?: number | null; streak?: number } = {}) {
  const length = range === "week" ? 7 : 30;
  const now = Date.now();
  const days = Array.from({ length }, (_, index) => {
    const offset = length - 1 - index;
    const day = localDayOf(new Date(now - offset * DAY));
    return dayRow(day, offset === 0 ? options.today : undefined);
  });
  const totals = days.reduce((sum, row) => ({
    lesson: sum.lesson + row.lesson, grammar: sum.grammar + row.grammar, practice: sum.practice + row.practice,
    vocabulary: sum.vocabulary + row.vocabulary, aiPractice: sum.aiPractice + row.aiPractice, total: sum.total + row.total, aiPracticeFocus: emptyFocus,
  }), { lesson: 0, grammar: 0, practice: 0, vocabulary: 0, aiPractice: 0, total: 0, aiPracticeFocus: emptyFocus });
  return {
    range, from: days[0]!.day, to: days.at(-1)!.day, days, totals, previousTotal: options.previousTotal ?? 0,
    dailyGoalMinutes: options.goal === undefined ? null : options.goal, streak: options.streak ?? 0,
  };
}

export function response(body: unknown) { return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }); }
