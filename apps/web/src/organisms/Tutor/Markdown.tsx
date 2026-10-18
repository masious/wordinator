import { TUTOR_SPAN_MAX, type TutorSpan } from "@wordinator/contracts/tutor";
import { Fragment, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ClipButton, type ClipSource } from "../TutorComponents";
import styles from "./Tutor.module.css";

// The assistant's Markdown subset (docs/ai-tutor.md#messages-and-formatting): **bold**, *italic*, one-level bulleted and numbered
// lists, `inline code`, short headings as section labels, and http/https links. Everything else (raw HTML, images, tables, code
// blocks, other link schemes) stays literal text. The parser keeps source offsets, so the stored target-language spans (offsets
// into the same text) render inside any formatting with a speaker button after each. Output is React elements only: no HTML is
// ever parsed or injected.

type Leaf = { type: "text"; start: number; end: number } | { type: "code"; start: number; end: number };
type Inline = Leaf | { type: "strong"; children: Inline[] } | { type: "em"; children: Inline[] } | { type: "link"; href: string; children: Leaf[] };
type Block = { type: "paragraph"; lines: Inline[][] } | { type: "list"; ordered: boolean; items: Inline[][] };
type Section = { heading: Inline[] | null; blocks: Block[] };

export const HEADING_MAX = 80;
const HEADING = /^(#{1,3})[ \t]+(\S.*?)[ \t#]*$/;
const LIST_ITEM = /^[ \t]*([-*+]|\d{1,3}[.)])[ \t]+(?=\S)/;

const safeHref = (href: string) => {
  try { const url = new URL(href); return url.protocol === "http:" || url.protocol === "https:" ? url.href : null; } catch { return null; }
};
const isSpace = (character: string | undefined) => character === undefined || /\s/.test(character);
const isWord = (character: string | undefined) => character !== undefined && /[\p{L}\p{N}_]/u.test(character);

export function parseInline(text: string, start: number, end: number): Inline[] {
  const out: Inline[] = [];
  let textStart = start; let index = start;
  const flush = (to: number) => { if (to > textStart) out.push({ type: "text", start: textStart, end: to }); };
  const take = (node: Inline, next: number) => { flush(index); out.push(node); index = next; textStart = next; };
  while (index < end) {
    const character = text[index];
    if (character === "`") {
      const close = text.indexOf("`", index + 1);
      if (close > index + 1 && close < end) { take({ type: "code", start: index + 1, end: close }, close + 1); continue; }
    }
    if (text.startsWith("**", index) && !isSpace(text[index + 2])) {
      const close = text.indexOf("**", index + 2);
      if (close > index + 2 && close + 2 <= end && !isSpace(text[close - 1])) { take({ type: "strong", children: parseInline(text, index + 2, close) }, close + 2); continue; }
    }
    if ((character === "*" || character === "_") && text[index + 1] !== character && !isSpace(text[index + 1]) && (character === "*" || !isWord(text[index - 1]) || index === start)) {
      let close = text.indexOf(character, index + 1);
      while (close !== -1 && close < end && text[close + 1] === character) close = text.indexOf(character, close + 2);
      if (close !== -1 && close < end && !isSpace(text[close - 1]) && (character === "*" || !isWord(text[close + 1]))) {
        take({ type: "em", children: parseInline(text, index + 1, close) }, close + 1); continue;
      }
    }
    if (character === "[" && text[index - 1] !== "!") {
      const match = /^\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/.exec(text.slice(index, end));
      const href = match ? safeHref(match[2]!) : null;
      if (match && href) { take({ type: "link", href, children: [{ type: "text", start: index + 1, end: index + 1 + match[1]!.length }] }, index + match[0].length); continue; }
    }
    if (character === "h" && (index === start || /[\s(]/.test(text[index - 1]!))) {
      const match = /^https?:\/\/[^\s<>"]+/.exec(text.slice(index, end));
      const url = match ? match[0].replace(/[.,;:!?)\]'"]+$/, "") : "";
      const href = url.length > "https://".length ? safeHref(url) : null;
      if (href) { take({ type: "link", href, children: [{ type: "text", start: index, end: index + url.length }] }, index + url.length); continue; }
    }
    index += 1;
  }
  flush(end);
  return out;
}

export function parseMarkdown(text: string): Section[] {
  const sections: Section[] = [{ heading: null, blocks: [] }];
  let current: Block | null = null;
  let offset = 0;
  for (const line of text.split("\n")) {
    const start = offset; const end = start + line.length; offset = end + 1;
    const section = sections[sections.length - 1]!;
    if (!line.trim()) { current = null; continue; }
    const heading = HEADING.exec(line);
    if (heading && heading[2]!.length <= HEADING_MAX) {
      const from = start + line.indexOf(heading[2]!, heading[1]!.length);
      sections.push({ heading: parseInline(text, from, from + heading[2]!.length), blocks: [] });
      current = null; continue;
    }
    const item = LIST_ITEM.exec(line);
    if (item) {
      const ordered = /\d/.test(item[1]!);
      const inline = parseInline(text, start + item[0].length, end);
      if (current?.type === "list" && current.ordered === ordered) current.items.push(inline);
      else { current = { type: "list", ordered, items: [inline] }; section.blocks.push(current); }
      continue;
    }
    const inline = parseInline(text, start, end);
    if (current?.type === "paragraph") current.lines.push(inline);
    else { current = { type: "paragraph", lines: [inline] }; section.blocks.push(current); }
  }
  return sections.filter((section) => section.heading || section.blocks.length);
}

function leavesOf(nodes: Inline[], into: Leaf[] = [], inLink = new Set<Leaf>(), linked = false): { leaves: Leaf[]; inLink: Set<Leaf> } {
  for (const node of nodes) {
    if (node.type === "text" || node.type === "code") { into.push(node); if (linked) inLink.add(node); }
    else leavesOf(node.children, into, inLink, linked || node.type === "link");
  }
  return { leaves: into, inLink };
}

type SpanAt = { index: number; span: TutorSpan; text: string; anchor: Leaf | null };

export function AssistantText({ text, spans, spanBase = 0, speech, lang }: {
  text: string; spans: readonly TutorSpan[];
  // The index of this part's first span among the message's spans; speech requests name spans by that index.
  spanBase?: number;
  // The clip of a span by its message index; without it (while streaming) spans show without speaker buttons.
  speech?: (spanIndex: number) => ClipSource | null;
  lang?: string;
}) {
  const { t } = useTranslation();
  const sections = parseMarkdown(text);
  const all = sections.flatMap((section) => [...(section.heading ?? []), ...section.blocks.flatMap((block) => block.type === "paragraph" ? block.lines.flat() : block.items.flat())]);
  const { leaves, inLink } = leavesOf(all);
  const marked: SpanAt[] = spans.map((span, position) => {
    const touching = leaves.filter((leaf) => leaf.start < span.end && leaf.end > span.start);
    const anchor = touching[touching.length - 1] ?? null;
    return { index: spanBase + position, span, text: text.slice(span.start, span.end), anchor: anchor && !inLink.has(anchor) ? anchor : null };
  });

  const renderLeaf = (leaf: Leaf, key: number) => {
    const cuts = new Set([leaf.start, leaf.end]);
    for (const { span } of marked) for (const at of [span.start, span.end]) if (at > leaf.start && at < leaf.end) cuts.add(at);
    const points = [...cuts].sort((left, right) => left - right);
    const pieces: ReactNode[] = [];
    for (let position = 0; position < points.length - 1; position += 1) {
      const from = points[position]!; const to = points[position + 1]!;
      const inside = marked.find(({ span }) => span.start <= from && span.end >= to);
      const piece = text.slice(from, to);
      pieces.push(inside ? <span key={from} className={styles.target} lang={lang}>{piece}</span> : <Fragment key={from}>{piece}</Fragment>);
      for (const entry of marked) {
        if (entry.anchor !== leaf || Math.min(leaf.end, entry.span.end) !== to) continue;
        const clip = speech && entry.text.length <= TUTOR_SPAN_MAX ? speech(entry.index) : null;
        if (clip) pieces.push(<ClipButton key={`speech-${entry.index}`} clip={clip} label={t("tutor.speakSpan", { text: entry.text })} className={styles.spanSpeech} />);
      }
    }
    return leaf.type === "code" ? <code key={key} className={styles.code}>{pieces}</code> : <Fragment key={key}>{pieces}</Fragment>;
  };
  const renderInline = (nodes: Inline[]): ReactNode[] => nodes.map((node, key) => {
    if (node.type === "text" || node.type === "code") return renderLeaf(node, key);
    if (node.type === "strong") return <strong key={key}>{renderInline(node.children)}</strong>;
    if (node.type === "em") return <em key={key}>{renderInline(node.children)}</em>;
    return <a key={key} href={node.href} target="_blank" rel="noreferrer">{renderInline(node.children)}</a>;
  });
  const renderBlock = (block: Block, key: number) => block.type === "paragraph"
    ? <p key={key} className={styles.paragraph}>{block.lines.map((line, index) => <Fragment key={index}>{index > 0 && <br />}{renderInline(line)}</Fragment>)}</p>
    : block.ordered
      ? <ol key={key} role="list" className={`${styles.list} ${styles.orderedList}`}>{block.items.map((entry, index) => <li key={index}>{renderInline(entry)}</li>)}</ol>
      : <ul key={key} className={styles.list}>{block.items.map((entry, index) => <li key={index}>{renderInline(entry)}</li>)}</ul>;
  return <div className={styles.assistantText}>
    {sections.map((section, index) => <section key={index} className={styles.section}>
      {section.heading && <h3 className={styles.sectionLabel}>{renderInline(section.heading)}</h3>}
      {section.blocks.map(renderBlock)}
    </section>)}
  </div>;
}
