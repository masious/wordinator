import { BlockNoteSchema, createHeadingBlockSpec, defaultBlockSpecs, defaultStyleSpecs } from "@blocknote/core";
import { createReactBlockSpec, type ReactCustomBlockRenderProps } from "@blocknote/react";
import { Menu } from "@mantine/core";
import { calloutIconSchema, calloutVariantSchema, type CalloutIcon, type CalloutVariant } from "@wordinator/contracts/lesson-document";
import { COURSE_NOTE_MAX, COURSE_SENTENCE_MAX, practicePayloadSchema } from "@wordinator/contracts";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { calloutIcon, calloutIcons } from "../../molecules/Callout";
import calloutStyles from "../../molecules/Callout.module.css";
import { DialogueFields, dialogueTurnsFromFields, PracticeFields, practiceFieldsFromPayload, practicePayloadFromFields, type Turn } from "./PracticeFields";
import styles from "./LessonEditor.module.css";

// The editor's schema is limited to what the lesson document contracts accept: headings 1–3 without toggles, the text
// blocks, and Wordinator's own callout, example, dialogue, and practice blocks; bold, italic, and palette colours only.
// Structured payloads live in string props, matching the contracts. New blocks start with valid placeholder data.
export const DEFAULT_TURNS = JSON.stringify([{ speaker: "A", text: "…" }, { speaker: "B", text: "…" }]);
export const DEFAULT_PRACTICE = JSON.stringify({ instruction: "…", passage: null, items: [{ prompt: "…", authorsVersion: [], note: null }] });

const calloutConfig = {
  type: "callout",
  propSchema: { variant: { default: "hint", values: calloutVariantSchema.options }, icon: { default: "auto", values: calloutIconSchema.options } },
  content: "inline",
} as const;
type CalloutProps = ReactCustomBlockRenderProps<typeof calloutConfig> & { contentRef: (node: HTMLElement | null) => void };

function CalloutBlock({ block, editor, contentRef }: CalloutProps) {
  const { t } = useTranslation();
  const variant = block.props.variant as CalloutVariant; const icon = block.props.icon as CalloutIcon;
  const Icon = calloutIcon(variant, icon);
  const iconNames = Object.keys(calloutIcons) as Array<keyof typeof calloutIcons>;
  return <aside className={calloutStyles.callout} data-variant={variant} aria-label={t(`courses.callout.variants.${variant}`)}>
    <Menu withinPortal position="bottom-start">
      <Menu.Target>
        <button type="button" className={styles.calloutButton} contentEditable={false} aria-label={t("courses.callout.change")}>
          <Icon className={calloutStyles.icon} aria-hidden="true" />
        </button>
      </Menu.Target>
      <Menu.Dropdown className={styles.calloutMenu}>
        <Menu.Label>{t("courses.callout.variant")}</Menu.Label>
        {calloutVariantSchema.options.map((name) => {
          const ItemIcon = calloutIcon(name, "auto");
          return <Menu.Item key={name} leftSection={<ItemIcon size={16} aria-hidden="true" />} aria-checked={name === variant} role="menuitemradio"
            onClick={() => editor.updateBlock(block, { props: { variant: name } })}>{t(`courses.callout.variants.${name}`)}</Menu.Item>;
        })}
        <Menu.Label>{t("courses.callout.icon")}</Menu.Label>
        <div className={styles.iconGrid}>
          <Menu.Item aria-checked={icon === "auto"} role="menuitemradio" onClick={() => editor.updateBlock(block, { props: { icon: "auto" } })}>{t("courses.callout.defaultIcon")}</Menu.Item>
          {iconNames.map((name) => {
            const ItemIcon = calloutIcons[name];
            return <Menu.Item key={name} className={styles.iconItem} aria-label={t(`courses.callout.icons.${name}`)} aria-checked={icon === name} role="menuitemradio"
              onClick={() => editor.updateBlock(block, { props: { icon: name } })}><ItemIcon size={18} aria-hidden="true" /></Menu.Item>;
          })}
        </div>
      </Menu.Dropdown>
    </Menu>
    <div className={calloutStyles.body} ref={contentRef} />
  </aside>;
}

const exampleConfig = { type: "example", propSchema: { translation: { default: "" }, note: { default: "" } }, content: "inline" } as const;
type ExampleProps = ReactCustomBlockRenderProps<typeof exampleConfig> & { contentRef: (node: HTMLElement | null) => void };

function ExampleEditorBlock({ block, editor, contentRef }: ExampleProps) {
  const { t } = useTranslation();
  return <figure className={styles.example}>
    <span className={styles.blockLabel} contentEditable={false}>{t("courses.editor.blocks.example")}</span>
    <div className={styles.sentence} ref={contentRef} />
    <div className={styles.exampleFields} contentEditable={false}>
      <label>{t("courses.editor.fields.translation")}
        <input value={block.props.translation} maxLength={COURSE_SENTENCE_MAX} onChange={(event) => editor.updateBlock(block, { props: { translation: event.currentTarget.value } })} />
      </label>
      <label>{t("courses.editor.fields.note")}
        <textarea value={block.props.note} maxLength={COURSE_NOTE_MAX} rows={2} onChange={(event) => editor.updateBlock(block, { props: { note: event.currentTarget.value } })} />
      </label>
    </div>
  </figure>;
}

const parseJson = (value: string): unknown => { try { return JSON.parse(value); } catch { return null; } };

const dialogueConfig = { type: "dialogue", propSchema: { turns: { default: DEFAULT_TURNS } }, content: "none" } as const;
function DialogueEditorBlock({ block, editor }: ReactCustomBlockRenderProps<typeof dialogueConfig>) {
  const { t } = useTranslation();
  const [turns, setTurns] = useState<Turn[]>(() => (parseJson(block.props.turns) as Turn[] | null) ?? []);
  const valid = dialogueTurnsFromFields(turns) !== null;
  const change = (next: Turn[]) => {
    setTurns(next);
    const parsed = dialogueTurnsFromFields(next);
    if (parsed) editor.updateBlock(block, { props: { turns: JSON.stringify(parsed) } });
  };
  return <section className={styles.structured} contentEditable={false} aria-label={t("courses.editor.blocks.dialogue")}>
    <span className={styles.blockLabel}>{t("courses.editor.blocks.dialogue")}</span>
    <DialogueFields turns={turns} onChange={change} />
    {!valid && <p className={styles.incomplete} role="status">{t("courses.editor.incomplete")}</p>}
  </section>;
}

const practiceConfig = { type: "practice", propSchema: { data: { default: DEFAULT_PRACTICE } }, content: "none" } as const;
function PracticeEditorBlock({ block, editor }: ReactCustomBlockRenderProps<typeof practiceConfig>) {
  const { t } = useTranslation();
  const [fields, setFields] = useState(() => {
    const parsed = practicePayloadSchema.safeParse(parseJson(block.props.data));
    return practiceFieldsFromPayload(parsed.success ? parsed.data : practicePayloadSchema.parse(JSON.parse(DEFAULT_PRACTICE)));
  });
  const valid = practicePayloadFromFields(fields) !== null;
  const change = (next: typeof fields) => {
    setFields(next);
    const payload = practicePayloadFromFields(next);
    if (payload) editor.updateBlock(block, { props: { data: JSON.stringify(payload) } });
  };
  return <section className={styles.structured} contentEditable={false} aria-label={t("courses.editor.blocks.practice")}>
    <span className={styles.blockLabel}>{t("courses.editor.blocks.practice")}</span>
    <PracticeFields value={fields} onChange={change} />
    {!valid && <p className={styles.incomplete} role="status">{t("courses.editor.incomplete")}</p>}
  </section>;
}

const createCallout = createReactBlockSpec(calloutConfig, { render: (props) => <CalloutBlock {...props} /> });
const createExample = createReactBlockSpec(exampleConfig, { render: (props) => <ExampleEditorBlock {...props} /> });
const createDialogue = createReactBlockSpec(dialogueConfig, { render: (props) => <DialogueEditorBlock {...props} /> });
const createPractice = createReactBlockSpec(practiceConfig, { render: (props) => <PracticeEditorBlock {...props} /> });

const { paragraph, bulletListItem, numberedListItem, divider } = defaultBlockSpecs;
const { bold, italic, textColor, backgroundColor } = defaultStyleSpecs;

export const lessonEditorSchema = BlockNoteSchema.create({
  blockSpecs: {
    paragraph, heading: createHeadingBlockSpec({ levels: [1, 2, 3], allowToggleHeadings: false }), bulletListItem, numberedListItem, divider,
    callout: createCallout(), example: createExample(), dialogue: createDialogue(), practice: createPractice(),
  },
  styleSpecs: { bold, italic, textColor, backgroundColor },
});
export type LessonEditorInstance = typeof lessonEditorSchema.BlockNoteEditor;
