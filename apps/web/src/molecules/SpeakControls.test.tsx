import { MantineProvider } from "@mantine/core";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import "../i18n";
import { AssessmentBreakdown, SpokenVerdict } from "./SpeakControls";
import type { PronunciationAssessment } from "./speechRecognition";

const assessment: PronunciationAssessment = {
  overall: 86, accuracy: 88, fluency: 97, completeness: 67,
  words: [{ word: "een", accuracy: 99, error: "none" }, { word: "geven", accuracy: 54, error: "mispronunciation" }, { word: "feest", accuracy: null, error: "omission" }],
};
afterEach(cleanup);

describe("Pronunciation assessment", () => {
  it("ends a verdict in the overall score only when there is an assessment", () => {
    render(<MantineProvider><SpokenVerdict answer={{ heard: "een feest geven", matches: true, assessment }} /></MantineProvider>);
    expect(screen.getByRole("img", { name: "Pronunciation score 86 of 100" })).toBeInTheDocument();
    cleanup();
    render(<MantineProvider><SpokenVerdict answer={{ heard: "zondag", matches: true, assessment: null }} /></MantineProvider>);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("lists accuracy, fluency, and completeness, then each word with its band and error", () => {
    render(<MantineProvider><AssessmentBreakdown assessment={assessment} /></MantineProvider>);
    const values = Object.fromEntries(screen.getAllByRole("term").map((term) => [term.textContent, term.nextElementSibling?.textContent]));
    expect(values).toEqual({ Accuracy: "88", Fluency: "97", Completeness: "67" });
    const words = within(screen.getByRole("list", { name: "Words" })).getAllByRole("listitem");
    expect(words.map((word) => word.textContent)).toEqual(["een99", "geven54 · unclear", "feestnot heard"]);
    expect(words.map((word) => word.dataset.band)).toEqual(["good", "weak", "weak"]);
  });
});
