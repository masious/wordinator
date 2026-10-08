// Authoring shorthand → stored BlockNote shape. Shared by the lesson tool and the web app's draft lesson overview, so it
// imports nothing from Node.
// Authoring files are untyped JSON; callers validate the result with lessonDocumentSchema.
type Json = any;
const textDefaults = { textColor: "default", backgroundColor: "default", textAlignment: "left" };

const inline = (content: Json): Json[] => {
  if (content == null) return [];
  if (typeof content === "string") return content ? [{ type: "text", text: content, styles: {} }] : [];
  return content.map((item: Json) =>
    typeof item === "string" ? { type: "text", text: item, styles: {} }
      : item.type === "link" ? { type: "link", href: item.href, content: inline(item.content) }
      : { type: "text", text: item.text, styles: item.styles ?? {} });
};

// Turns the authoring shorthand into the stored BlockNote shape. IDs are assigned on the authoring block so they persist.
export const normalize = (block: Json): Json => {
  block.id ??= crypto.randomUUID();
  const props = block.props ?? {};
  const children = (block.children ?? []).map(normalize);
  switch (block.type) {
    case "paragraph": case "bulletListItem": case "numberedListItem":
      return { id: block.id, type: block.type, props: { ...textDefaults, ...props }, content: inline(block.content), children };
    case "heading":
      return { id: block.id, type: "heading", props: { ...textDefaults, level: 2, isToggleable: false, ...props }, content: inline(block.content), children };
    case "divider":
      return { id: block.id, type: "divider", props: {}, children: [] };
    case "callout":
      return { id: block.id, type: "callout", props: { variant: "hint", icon: "auto", ...props }, content: inline(block.content), children: [] };
    case "example":
      return { id: block.id, type: "example", props: { translation: props.translation ?? "", note: props.note ?? "" }, content: inline(block.content), children: [] };
    case "dialogue":
      return { id: block.id, type: "dialogue", props: { turns: typeof props.turns === "string" ? props.turns : JSON.stringify(props.turns) }, children: [] };
    case "practice": {
      const data = typeof props.data === "string" ? JSON.parse(props.data) : props.data;
      const payload = { instruction: data.instruction, passage: data.passage ?? null, items: data.items.map((item: Json) => ({ prompt: item.prompt, authorsVersion: item.authorsVersion ?? [], note: item.note ?? null })) };
      return { id: block.id, type: "practice", props: { data: JSON.stringify(payload) }, children: [] };
    }
    case "vocabulary": {
      // Word IDs are assigned on the authoring words so they persist; empty optional fields are dropped.
      if (typeof props.data === "string") block.props.data = JSON.parse(props.data);
      const words = block.props.data.words.map((word: Json) => {
        word.id ??= crypto.randomUUID();
        const out: Json = { id: word.id, term: word.term, meaning: word.meaning };
        for (const key of ["forms", "example", "note"]) if (word[key]) out[key] = word[key];
        return out;
      });
      return { id: block.id, type: "vocabulary", props: { data: JSON.stringify({ words }) }, children: [] };
    }
    case "columnList":
      return { id: block.id, type: "columnList", props: {}, children };
    case "column":
      return { id: block.id, type: "column", props: { width: props.width ?? 1 }, children };
    default:
      return { ...block, children };
  }
};


export const authoredDocument = (blocks: Json[]) => ({ schemaVersion: 2, blocks: blocks.map(normalize) });
