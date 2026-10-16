import { MantineProvider } from "@mantine/core";
import { parseTargetSpans } from "@wordinator/contracts/tutor";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import "../../i18n";
import type { ClipSource } from "../TutorComponents";
import { AssistantText, parseMarkdown } from "./Markdown";

afterEach(cleanup);

const clip = (index: number): ClipSource => ({ key: `test:${index}`, load: async () => ({ status: "ready", url: `https://media.test/${index}.mp3` }) });
function renderText(raw: string, withSpeech = true, spanBase = 0) {
  const { text, spans } = parseTargetSpans(raw);
  return render(<MantineProvider><AssistantText text={text} spans={spans} spanBase={spanBase} speech={withSpeech ? clip : undefined} lang="nl" /></MantineProvider>);
}

describe("Assistant Markdown subset", () => {
  it("renders bold, italic, inline code, safe links, and one-level lists", () => {
    const { container } = renderText("Use **de** with *most* nouns, like `de man`.\n\n- first\n- second\n\n1. one\n2. two\n\nSee https://example.com/page. or [the docs](https://example.com/docs).");
    expect(container.querySelector("strong")).toHaveTextContent("de");
    expect(container.querySelector("em")).toHaveTextContent("most");
    expect(container.querySelector("code")).toHaveTextContent("de man");
    expect(container.querySelectorAll("ul li")).toHaveLength(2);
    expect(container.querySelectorAll("ol li")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "https://example.com/page" })).toHaveAttribute("href", "https://example.com/page");
    expect(screen.getByRole("link", { name: "the docs" })).toHaveAttribute("href", "https://example.com/docs");
  });

  it("splits sections under short headings shown as labels", () => {
    const { container } = renderText("Intro line.\n\n## Grammar\nDe and het.\n\n## Words\n- huis");
    const sections = container.querySelectorAll("section");
    expect(sections).toHaveLength(3);
    expect(screen.getByRole("heading", { name: "Grammar" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Words" })).toBeInTheDocument();
    // A long heading is not a label: it stays literal text.
    const long = parseMarkdown(`# ${"x".repeat(90)}`);
    expect(long[0]!.heading).toBeNull();
  });

  it("shows raw HTML, images, code fences, and unsafe links as literal text", () => {
    const { container } = renderText("<b>bold</b> <img src=x onerror=alert(1)>\n![cat](https://example.com/cat.png)\n[click](javascript:alert(1))\n```\ncode\n```");
    expect(container.querySelector("b")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container).toHaveTextContent("<b>bold</b> <img src=x onerror=alert(1)>");
    expect(container).toHaveTextContent("[click](javascript:alert(1))");
    expect(container).toHaveTextContent("```");
    expect(screen.queryByRole("link", { name: "click" })).toBeNull();
    // The image syntax is not a link either.
    expect(screen.queryByRole("link", { name: "cat" })).toBeNull();
    expect(container).toHaveTextContent("![cat](https://example.com/cat.png)");
  });

  it("marks target-language spans inside formatting with a speaker button after each, numbered from the part's base", () => {
    const { container } = renderText("Say **[[Goedemorgen]]** and [[tot ziens]].", true, 2);
    const targets = container.querySelectorAll("span[lang='nl']");
    expect([...targets].map((node) => node.textContent)).toEqual(["Goedemorgen", "tot ziens"]);
    expect(screen.getByRole("button", { name: "Play “Goedemorgen”" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play “tot ziens”" })).toBeInTheDocument();
  });

  it("shows spans without speaker buttons while streaming", () => {
    const { container } = renderText("Say [[hallo]] and [[unfinished", false);
    expect(container.querySelector("span[lang='nl']")).toHaveTextContent("hallo");
    expect(container).toHaveTextContent("[[unfinished");
    expect(screen.queryByRole("button")).toBeNull();
  });
});
