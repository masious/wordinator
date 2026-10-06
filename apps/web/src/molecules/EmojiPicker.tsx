import { EmojiPicker as Frimousse } from "frimousse";
import { useTranslation } from "react-i18next";
import styles from "./EmojiPicker.module.css";

// The one emoji picker for lessons and, later, reactions. Emoji data is served from Wordinator's own origin.
export const EMOJIBASE_URL = "/emojibase";

export function EmojiPicker({ onSelect }: { onSelect: (emoji: string) => void }) {
  const { t } = useTranslation();
  return <Frimousse.Root className={styles.root} locale="en" emojibaseUrl={EMOJIBASE_URL} columns={8} onEmojiSelect={({ emoji }) => onSelect(emoji)}>
    <Frimousse.Search className={styles.search} placeholder={t("emojiPicker.search")} aria-label={t("emojiPicker.search")} />
    <Frimousse.Viewport className={styles.viewport}>
      <Frimousse.Loading className={styles.status}>{t("emojiPicker.loading")}</Frimousse.Loading>
      <Frimousse.Empty className={styles.status}>{t("emojiPicker.empty")}</Frimousse.Empty>
      <Frimousse.List className={styles.list} components={{
        CategoryHeader: ({ category, ...props }) => <div className={styles.category} {...props}>{category.label}</div>,
        Row: ({ children, ...props }) => <div className={styles.row} {...props}>{children}</div>,
        Emoji: ({ emoji, ...props }) => <button type="button" className={styles.emoji} data-active={emoji.isActive || undefined} {...props}>{emoji.emoji}</button>,
      }} />
    </Frimousse.Viewport>
  </Frimousse.Root>;
}
