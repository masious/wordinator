import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stickyInset } from "./LessonIndex";
import { LessonStickyHeader } from "./LessonStickyHeader";

// A page with a cover (0-300), its title (400-460) and the text below, under a 72px header bar.
const tops: Record<string, number> = { cover: 0, title: 400 };
let scrollY = 0;
const scroll = async (y: number) => {
  scrollY = y;
  await act(async () => { window.dispatchEvent(new Event("scroll")); await new Promise((resolve) => setTimeout(resolve, 5)); });
};

function Page({ cover }: { cover: string | null }) {
  return <article>
    <div data-lesson-header style={{ position: "sticky", top: 0 }}>
      <LessonStickyHeader title="In het restaurant" cover={cover}
        entry={{ id: "60000000-0000-4000-8000-000000000003", text: "Story: Een tafel bij het raam", depth: 0, level: 2, category: "story", start: 0 }} />
    </div>
    {cover && <div data-lesson-cover data-at="cover" />}
    <h1 id="lesson-title" data-at="title">In het restaurant</h1>
  </article>;
}

describe("LessonStickyHeader", () => {
  beforeEach(() => {
    scrollY = 0;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0));
    vi.stubGlobal("cancelAnimationFrame", (handle: number) => clearTimeout(handle));
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(72);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const at = this.dataset.at;
      const top = (at ? tops[at]! : 0) - scrollY; const height = at === "cover" ? 300 : 60;
      return { top, bottom: top + height, height, left: 0, right: 0, width: 0, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
    });
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("puts the reading line under the bar", () => {
    render(<Page cover={null} />);
    expect(stickyInset(null)).toBe(72);
  });

  it("slides in with the blurred cover once the cover has gone under it, then the title once the page's title has", async () => {
    const { container } = render(<Page cover="https://images.test/cover.jpg" />);
    const bar = container.querySelector("[data-lesson-header] > div")!;
    const [backdrop, text] = [bar.children[0]!, bar.children[1]!];
    await scroll(0);
    expect(bar).not.toHaveAttribute("data-shown");
    expect(bar).toHaveAttribute("aria-hidden", "true");
    // The section is in the bar from the start; it shows with the bar.
    expect(text).toHaveTextContent("Story: Een tafel bij het raam");
    await scroll(250);
    expect(bar).toHaveAttribute("data-shown");
    expect(backdrop).toHaveAttribute("data-shown");
    expect(backdrop.querySelector("img")).toHaveAttribute("src", "https://images.test/cover.jpg");
    expect(text.firstElementChild).not.toHaveAttribute("data-shown");
    await scroll(400);
    expect(text.firstElementChild).toHaveAttribute("data-shown");
    expect(text.firstElementChild).toHaveTextContent("In het restaurant");
    // Scrolling back up takes them out again.
    await scroll(0);
    expect(bar).not.toHaveAttribute("data-shown");
  });

  it("names a level-3 entry after its level-2 section, whose category icon stays still", () => {
    const section = { id: "60000000-0000-4000-8000-000000000008", text: "Mogen: Mag ik …?", depth: 0, level: 2 as const, category: "grammar" as const, start: 3 };
    const part = { id: "60000000-0000-4000-8000-000000000009", text: "Asking permission", depth: 1, level: 3 as const, category: "grammar" as const, start: 3, color: "violet" as const };
    const { container } = render(<article><div data-lesson-header><LessonStickyHeader title="In het restaurant" cover={null} entry={part} section={section} /></div></article>);
    const line = container.querySelector("[data-lesson-header] > div")!.children[1]!.lastElementChild!;
    expect(line).toHaveTextContent("Mogen: Mag ik …?Asking permission");
    expect(line.querySelector(".lucide-chevron-right")).not.toBeNull();
    expect(line.querySelector("[data-tone]")).not.toBeNull();
    expect(line.querySelector('[data-color="violet"]')).not.toBeNull();
    // On a level-2 entry, only that entry is named.
    cleanup();
    const { container: alone } = render(<article><div data-lesson-header><LessonStickyHeader title="In het restaurant" cover={null} entry={section} /></div></article>);
    expect(alone.querySelector(".lucide-chevron-right")).toBeNull();
  });

  it("without a cover, slides in with its light tone once the page's title has gone under it", async () => {
    const { container } = render(<Page cover={null} />);
    const bar = container.querySelector("[data-lesson-header] > div")!;
    await scroll(250);
    expect(bar).not.toHaveAttribute("data-shown");
    await scroll(400);
    expect(bar).toHaveAttribute("data-shown");
    expect(bar.children[0]).toHaveAttribute("data-shown");
    expect(bar.children[0]!.querySelector("img")).toBeNull();
  });
});
