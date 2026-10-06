import type { TFunction } from "i18next";
import { describe, expect, it } from "vitest";
import { resources } from "../../i18n";
import { lessonEditorDictionary } from "./editorDictionary";

// A stand-in translator that marks every string it produced, so anything left unmarked came from BlockNote's English.
const marked = ((key: string) => `«${key}»`) as unknown as TFunction;
const strings = (value: unknown): string[] =>
  typeof value === "string" ? [value] : value && typeof value === "object" ? Object.values(value).flatMap(strings) : [];

describe("Lesson editor dictionary", () => {
  it("takes every reachable BlockNote label from the catalog", () => {
    const dictionary = lessonEditorDictionary(marked);
    const reachable = [
      dictionary.side_menu, dictionary.suggestion_menu, dictionary.color_picker, dictionary.link_toolbar, dictionary.generic,
      dictionary.drag_handle.delete_menuitem, dictionary.drag_handle.colors_menuitem,
      dictionary.formatting_toolbar.bold.tooltip, dictionary.formatting_toolbar.italic.tooltip, dictionary.formatting_toolbar.colors,
      dictionary.formatting_toolbar.link.tooltip, dictionary.formatting_toolbar.file_caption, dictionary.formatting_toolbar.file_preview_toggle,
      dictionary.formatting_toolbar.file_replace.tooltip.image, dictionary.formatting_toolbar.file_rename.tooltip.image,
      dictionary.formatting_toolbar.file_delete.tooltip.image, dictionary.file_blocks.add_button_text.image,
      dictionary.file_panel.upload.title, dictionary.file_panel.upload.file_placeholder.image, dictionary.file_panel.upload.upload_error,
      dictionary.multi_column.slash_menu.two_columns.title, dictionary.multi_column.slash_menu.three_columns.title,
      dictionary.placeholders.default, dictionary.placeholders.heading, dictionary.placeholders.bulletListItem,
    ];
    expect(strings(reachable).filter((value) => !value.startsWith("«"))).toEqual([]);
  });

  it("has an English entry for every key it asks for", () => {
    const ui = resources.en.translation.courses.editor.ui;
    const asked: string[] = [];
    lessonEditorDictionary(((key: string) => { asked.push(key); return key; }) as unknown as TFunction);
    const missing = asked.filter((key) => {
      let node: unknown = resources.en.translation;
      for (const part of key.split(".")) node = (node as Record<string, unknown> | undefined)?.[part];
      return typeof node !== "string";
    });
    expect(missing).toEqual([]);
    expect(ui.bold).toBe("Bold");
  });
});
