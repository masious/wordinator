import { parseTargetSpans, tutorComponentView, type TutorStoredPart } from "@wordinator/contracts/tutor";
import { describe, expect, it } from "vitest";
import { parseVerdict } from "../src/tutor/grading";
import { toModelMessages, withSpanMarks } from "../src/tutor/loop";

// Pure parts of the agent loop and the verdict parser (C14g).

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("model history", () => {
  it("puts span marks back as the model wrote them", () => {
    const raw = "Zeg [[Goedemorgen]] en [[tot ziens]].";
    const parsed = parseTargetSpans(raw);
    expect(withSpanMarks(parsed.text, parsed.spans)).toBe(raw);
  });

  it("follows every tool call with exactly one tool message and starts a new assistant message after results", () => {
    const fill = { kind: "fill_in" as const, payload: { prompt: "Ik … hier.", answers: ["woon"] } };
    const parts: TutorStoredPart[] = [
      { type: "text", text: "Let me look.", spans: [] },
      { type: "tool_call", toolCallId: id(1), name: "get_lesson", arguments: { lessonId: "next" } },
      { type: "tool_result", toolCallId: id(1), name: "get_lesson", ok: true, error: null, detail: {}, content: "{\"lesson\":null}" },
      { type: "text", ...parseTargetSpans("Try [[this]]:") },
      { type: "tool_call", toolCallId: id(2), name: "ask_fill_in", arguments: fill.payload },
      { type: "component", toolCallId: id(2), kind: "fill_in", view: tutorComponentView(fill), component: fill, answer: { kind: "fill_in", blanks: ["woon"] },
        grade: { correct: true, matched: true, verdict: null, note: null, reference: "woon", items: [], score: null }, answeredAt: 1 },
      { type: "tool_call", toolCallId: id(3), name: "get_weak_words", arguments: {} },
      { type: "error", code: "AI_UNAVAILABLE", message: "x" },
    ];
    const messages = toModelMessages([{ role: "user", parts: [{ type: "text", text: "Teach me", spans: [] }] }, { role: "assistant", parts }]);
    expect(messages.map((message) => message.role)).toEqual(["user", "assistant", "tool", "assistant", "tool", "tool"]);
    expect(messages[1]).toMatchObject({ content: "Let me look.", tool_calls: [{ id: id(1), function: { name: "get_lesson", arguments: "{\"lessonId\":\"next\"}" } }] });
    expect(messages[3]).toMatchObject({ content: "Try [[this]]:" });
    expect(JSON.parse((messages[4] as { content: string }).content)).toMatchObject({ status: "answered", grade: { correct: true } });
    expect(JSON.parse((messages[5] as { content: string }).content)).toEqual({ error: "NO_RESULT" });
  });
});

describe("verdicts", () => {
  it("reads the first JSON object and refuses anything else", () => {
    expect(parseVerdict("Sure! {\"verdict\": \"error\", \"note\": \"Wrong verb.\"}")).toEqual({ verdict: "error", note: "Wrong verb.", corrected: null });
    expect(parseVerdict("{\"verdict\": \"acceptable\", \"corrected\": \"Ignored.\"}")).toEqual({ verdict: "acceptable", note: null, corrected: null });
    expect(parseVerdict("{\"verdict\": \"error\", \"note\": \"Op.\", \"corrected\": \" ik zie veel spullen op de markt \"}"))
      .toEqual({ verdict: "error", note: "Op.", corrected: "ik zie veel spullen op de markt" });
    expect(parseVerdict("{\"verdict\": \"maybe\"}")).toBeNull();
    expect(parseVerdict("acceptable")).toBeNull();
  });
});
