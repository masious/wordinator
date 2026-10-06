import { MantineProvider } from "@mantine/core";
import { LESSON_DOCUMENT_SCHEMA_VERSION, type LessonDocument as LessonDocumentData, type LessonTopBlock } from "@wordinator/contracts/lesson-document";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import "../../i18n";
import { LessonDocument } from "./LessonDocument";

const id = (n: number) => `50000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const plain = { textColor: "default", backgroundColor: "default" } as const;
const text = (value: string, styles: Record<string, unknown> = {}) => ({ type: "text" as const, text: value, styles });
const doc = (blocks: unknown[]) => ({ schemaVersion: LESSON_DOCUMENT_SCHEMA_VERSION, blocks }) as LessonDocumentData;
const renderDocument = (document: LessonDocumentData) => render(<MantineProvider><LessonDocument document={document} renderPractice={(block) => <p>practice {block.id}</p>} /></MantineProvider>);

afterEach(cleanup);

describe("Lesson document renderer", () => {
  it("renders every block type with headings below the lesson title", () => {
    const blocks: LessonTopBlock[] = [
      { id: id(1), type: "heading", props: { ...plain, level: 1 }, content: [text("Wonen")], children: [] },
      { id: id(2), type: "heading", props: { ...plain, level: 3 }, content: [text("Details")], children: [] },
      { id: id(3), type: "paragraph", props: plain, content: [text("Een "), text("vet", { bold: true }), text(" en "), text("schuin", { italic: true })], children: [] },
      { id: id(4), type: "bulletListItem", props: plain, content: [text("eerste")], children: [
        { id: id(5), type: "bulletListItem", props: plain, content: [text("genest")], children: [] },
      ] },
      { id: id(6), type: "numberedListItem", props: { ...plain, start: 3 }, content: [text("drie")], children: [] },
      { id: id(7), type: "divider", props: {}, children: [] },
      { id: id(8), type: "callout", props: { variant: "false-friend", icon: "auto" }, content: [text("Bellen is not ‘to bell’.")], children: [] },
      { id: id(9), type: "example", props: { translation: "There is a balcony.", note: "Formal." }, content: [text("Er is een balkon.")], children: [] },
      { id: id(10), type: "dialogue", props: { turns: JSON.stringify([{ speaker: "A", text: "Hoi" }, { speaker: "B", text: "Dag" }]) }, children: [] },
      { id: id(11), type: "practice", props: { data: "{}" }, children: [] },
      { id: id(12), type: "image", props: { backgroundColor: "default", name: "Een keuken", url: "https://images.example/k.webp", caption: "De keuken", showPreview: true, previewWidth: 320 }, children: [] },
      // The editor always keeps a trailing empty paragraph; readers never see it.
      { id: id(13), type: "paragraph", props: plain, content: [], children: [] },
    ];
    const { container } = renderDocument(doc(blocks));
    expect(screen.getByRole("heading", { name: "Wonen", level: 3 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Details", level: 5 })).toBeInTheDocument();
    expect(screen.getByText("vet").tagName).toBe("STRONG");
    expect(screen.getByText("schuin").tagName).toBe("EM");
    expect(screen.getByText("genest").closest("ul")!.parentElement!.closest("li")).toHaveTextContent("eerste");
    expect(screen.getByText("drie").closest("ol")).toHaveAttribute("start", "3");
    expect(container.querySelector("hr")).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "False friend" })).toHaveTextContent("Bellen is not ‘to bell’.");
    expect(screen.getByText("There is a balcony.")).toBeInTheDocument();
    expect(screen.getByText("Formal.")).toBeInTheDocument();
    expect(screen.getByText("Dag")).toBeInTheDocument();
    expect(screen.getByText(`practice ${id(11)}`)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Een keuken" })).toHaveAttribute("src", "https://images.example/k.webp");
    expect(screen.getByText("De keuken")).toBeInTheDocument();
    expect(container.querySelectorAll("p")).toHaveLength(3);
  });

  it("escapes hostile text and never links unsafe schemes", () => {
    const hostile = "<img src=x onerror=alert(1)><script>alert(2)</script>";
    const { container } = renderDocument(doc([
      { id: id(1), type: "paragraph", props: plain, content: [
        text(hostile),
        { type: "link", href: "javascript:alert(3)", content: [text("bad link")] },
        { type: "link", href: "https://example.com/", content: [text("good link")] },
      ], children: [] },
    ]));
    expect(container.querySelector("p")).toHaveTextContent(`${hostile}bad linkgood link`);
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelectorAll("a")).toHaveLength(1);
    const link = screen.getByRole("link", { name: "good link" });
    expect(link).toHaveAttribute("href", "https://example.com/");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer nofollow");
  });

  it("maps colours to token classes instead of inline styles", () => {
    const { container } = renderDocument(doc([
      { id: id(1), type: "paragraph", props: { textColor: "default", backgroundColor: "yellow" }, content: [text("rood", { textColor: "red" })], children: [] },
    ]));
    expect(screen.getByText("rood").className).toMatch(/text-red/);
    expect(container.querySelector("p")!.className).toMatch(/surface-yellow/);
    expect(container.innerHTML).not.toMatch(/style="[^"]*color/);
  });

  it("lays out columns by their widths", () => {
    const column = (n: number, width: number, words: string) => ({ id: id(n), type: "column", props: { width }, children: [
      { id: id(n + 10), type: "paragraph", props: plain, content: [text(words)], children: [] },
    ] });
    const { container } = renderDocument(doc([{ id: id(1), type: "columnList", props: {}, children: [column(2, 2, "links"), column(3, 1, "rechts")] }]));
    const grid = screen.getByText("links").closest("div")!.parentElement!;
    expect(grid.style.getPropertyValue("--lesson-columns")).toBe(`minmax(0, ${2 / 3}fr) minmax(0, ${1 / 3}fr)`);
    expect(container).toHaveTextContent("rechts");
  });
});
