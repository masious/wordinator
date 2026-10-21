import { MantineProvider } from "@mantine/core";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { SummaryActivity, type SummaryPayload } from "./SummaryActivity";
import styles from "./SummaryActivity.module.css";

const highlighted = String(styles.highlighted);

const payload: SummaryPayload = {
  type: "story_summary", recipeVersion: 1, schemaVersion: 1, image: { url: "https://media.test/scene.jpg", alt: "A dog in a park" },
  pairs: [
    { dutch: "De hond loopt in het park.", english: "The dog walks in the park." },
    { dutch: "Hij ziet een kat.", english: "He sees a cat." },
  ],
  newWords: [{ term: "de hond", translation: "the dog" }, { term: "de kat", translation: "the cat" }],
};

afterEach(() => cleanup());

function renderSummary(onComplete = vi.fn()) {
  render(<MantineProvider><SummaryActivity payload={payload} completing={false} onComplete={onComplete} /></MantineProvider>);
}

describe("Summary activity", () => {
  it("hovering a Dutch sentence highlights its English pair, and hovering English highlights the Dutch pair", () => {
    renderSummary();
    const dutch = screen.getByText("De hond loopt in het park.");
    const english = screen.getByText("The dog walks in the park.");
    expect(dutch).toHaveAttribute("data-pair", "0");
    expect(dutch).toHaveAttribute("aria-describedby", english.id);
    expect(english).toHaveAttribute("aria-describedby", dutch.id);

    fireEvent.mouseEnter(dutch);
    expect(dutch).toHaveClass(highlighted);
    expect(english).toHaveClass(highlighted);
    expect(screen.getByText("He sees a cat.")).not.toHaveClass(highlighted);
    fireEvent.mouseLeave(dutch);
    expect(english).not.toHaveClass(highlighted);

    fireEvent.mouseEnter(english);
    expect(dutch).toHaveClass(highlighted);
    expect(english).toHaveClass(highlighted);
    fireEvent.mouseLeave(english);
    expect(dutch).not.toHaveClass(highlighted);
  });

  it("keyboard focus on a sentence highlights its pair the same way, and blur clears it", () => {
    renderSummary();
    const dutch = screen.getByText("Hij ziet een kat.");
    const english = screen.getByText("He sees a cat.");
    expect(dutch).toHaveAttribute("tabindex", "0");

    act(() => dutch.focus());
    expect(dutch).toHaveFocus();
    expect(english).toHaveClass(highlighted);
    expect(dutch).toHaveClass(highlighted);

    act(() => dutch.blur());
    expect(english).not.toHaveClass(highlighted);

    act(() => english.focus());
    expect(dutch).toHaveClass(highlighted);
  });

  it("shows the new words for display only, with no bookmark button", () => {
    renderSummary();
    const words = screen.getByRole("region", { name: "New words" });
    expect(within(words).getAllByRole("listitem")).toHaveLength(2);
    expect(within(words).getByText("the dog")).toBeInTheDocument();
    expect(within(words).queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /bookmark/i })).not.toBeInTheDocument();
  });
});
