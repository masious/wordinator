import { en } from "@blocknote/core/locales";
import { locales as multiColumnLocales } from "@blocknote/xl-multi-column";
import type { TFunction } from "i18next";

const multiColumnEn = multiColumnLocales.en;

// BlockNote's own controls read their labels from a dictionary. Every surface the lesson editor can show is taken from
// Wordinator's catalog; the English base only fills entries for features the schema never enables (tables, comments,
// video, audio, code), so nothing BlockNote renders here bypasses i18next. Keyboard shortcut hints stay as BlockNote formats them.
export function lessonEditorDictionary(t: TFunction) {
  const ui = (key: string) => t(`courses.editor.ui.${key}`);
  const image = (value: string) => ({ ...en.formatting_toolbar.file_replace.tooltip, image: value });
  const colors = Object.fromEntries(Object.keys(en.color_picker.colors).map((name) => [name, ui(`colorNames.${name}`)])) as typeof en.color_picker.colors;
  return {
    ...en,
    placeholders: {
      ...en.placeholders, default: t("courses.editor.placeholder"), emptyDocument: t("courses.editor.placeholder"), heading: t("courses.editor.headingPlaceholder"),
      bulletListItem: t("courses.editor.listPlaceholder"), numberedListItem: t("courses.editor.listPlaceholder"),
    },
    file_blocks: { ...en.file_blocks, add_button_text: { ...en.file_blocks.add_button_text, image: ui("addImage") } },
    side_menu: { add_block_label: ui("addBlock"), drag_handle_label: ui("blockMenu") },
    drag_handle: { ...en.drag_handle, delete_menuitem: ui("delete"), colors_menuitem: ui("colors") },
    suggestion_menu: { no_items_title: ui("noItems") },
    color_picker: { text_title: ui("textColor"), background_title: ui("backgroundColor"), colors },
    formatting_toolbar: {
      ...en.formatting_toolbar,
      bold: { ...en.formatting_toolbar.bold, tooltip: ui("bold") },
      italic: { ...en.formatting_toolbar.italic, tooltip: ui("italic") },
      colors: { tooltip: ui("colors") },
      link: { ...en.formatting_toolbar.link, tooltip: ui("createLink") },
      file_caption: { tooltip: ui("caption"), input_placeholder: ui("caption") },
      file_replace: { tooltip: image(ui("replaceImage")) },
      // The image's name is its alt text.
      file_rename: { tooltip: image(ui("altText")), input_placeholder: image(ui("altText")) },
      file_download: { tooltip: image(ui("downloadImage")) },
      file_delete: { tooltip: image(ui("deleteImage")) },
      file_preview_toggle: { tooltip: ui("togglePreview") },
    },
    file_panel: {
      upload: { title: ui("upload"), file_placeholder: { ...en.file_panel.upload.file_placeholder, image: ui("uploadImage") }, upload_error: ui("uploadFailed") },
      embed: { title: ui("embed"), embed_button: { ...en.file_panel.embed.embed_button, image: ui("embedImage") }, url_placeholder: ui("urlPlaceholder") },
    },
    link_toolbar: {
      delete: { tooltip: ui("removeLink") }, edit: { text: ui("editLink"), tooltip: ui("edit") }, open: { tooltip: ui("openLink") },
      form: { title_placeholder: ui("linkTitle"), url_placeholder: ui("linkUrl") },
    },
    generic: { ctrl_shortcut: ui("ctrl"), form_submit: ui("submit") },
    multi_column: {
      slash_menu: {
        two_columns: { ...multiColumnEn.slash_menu.two_columns, title: ui("twoColumns"), subtext: "", group: t("courses.editor.slashGroups.layout") },
        three_columns: { ...multiColumnEn.slash_menu.three_columns, title: ui("threeColumns"), subtext: "", group: t("courses.editor.slashGroups.layout") },
      },
    },
  };
}
