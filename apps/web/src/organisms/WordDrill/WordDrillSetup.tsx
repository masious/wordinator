import { Radio } from "@mantine/core";
import { wordDrillModeSchema, wordDrillSourceSchema, type WordBookmarkLesson, type WordDrillMode, type WordDrillSource } from "@wordinator/contracts/lesson-document";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { WordDrillSettings } from "../../api";
import { AdaptiveDialog, Button, RadioField, SelectField } from "../../ui";
import styles from "./WordDrillSetup.module.css";

// The drill setup (docs/words.md#setup): Weak words or one lesson, and a direction. Weak words needs a visible bookmark; the
// lessons come from the Words tab's lesson filter, and the lesson select starts on the filter's lesson.
function SetupForm({ lessons, lessonId, language, onClose, onStart }: {
  lessons: readonly WordBookmarkLesson[]; lessonId: string | null; language: string; onClose: () => void; onStart: (settings: WordDrillSettings) => void;
}) {
  const { t } = useTranslation();
  const hasBookmarks = lessons.some((entry) => entry.count > 0);
  const [source, setSource] = useState<WordDrillSource>(hasBookmarks || !lessons.length ? "weak" : "lesson");
  const [lesson, setLesson] = useState<string | null>(() => lessons.find((entry) => entry.lesson.id === lessonId)?.lesson.id ?? lessons[0]?.lesson.id ?? null);
  const [direction, setDirection] = useState<WordDrillMode>("mixed");
  const data = useMemo(() => {
    const groups = new Map<string, { group: string; items: Array<{ value: string; label: string }> }>();
    for (const entry of lessons) {
      const group = groups.get(entry.course.id) ?? { group: entry.course.title, items: [] };
      group.items.push({ value: entry.lesson.id, label: entry.lesson.title });
      groups.set(entry.course.id, group);
    }
    return [...groups.values()];
  }, [lessons]);
  const ready = source === "weak" ? hasBookmarks : Boolean(lesson);
  return <form className={styles.form} onSubmit={(event) => {
    event.preventDefault();
    if (!ready) return;
    onStart(source === "lesson" && lesson ? { source, lesson, direction } : { source: "weak", direction });
  }}>
    <Radio.Group label={t("drill.setup.words")} value={source} onChange={(value) => { const next = wordDrillSourceSchema.safeParse(value); if (next.success) setSource(next.data); }}>
      <div className={styles.choices}>
        <RadioField value="weak" label={t("drill.setup.weak")} disabled={!hasBookmarks}
          description={hasBookmarks ? t("drill.setup.weakHelp") : t("drill.setup.weakEmpty")} />
        <RadioField value="lesson" label={t("drill.setup.lesson")} disabled={!lessons.length} description={t("drill.setup.lessonHelp")} />
      </div>
    </Radio.Group>
    {source === "lesson" && <SelectField label={t("drill.setup.lessonSelect")} data={data} value={lesson} allowDeselect={false} onChange={setLesson} />}
    <Radio.Group label={t("drill.setup.direction")} value={direction} onChange={(value) => { const next = wordDrillModeSchema.safeParse(value); if (next.success) setDirection(next.data); }}>
      <div className={styles.choices}>
        <RadioField value="mixed" label={t("drill.setup.mixed")} description={t("drill.setup.mixedHelp")} />
        <RadioField value="understand" label={t("drill.setup.understand", { language })} description={t("drill.setup.understandHelp", { language })} />
        <RadioField value="produce" label={t("drill.setup.produce", { language })} description={t("drill.setup.produceHelp", { language })} />
      </div>
    </Radio.Group>
    <div className={styles.actions}>
      <Button variant="quiet" onClick={onClose}>{t("common.cancel")}</Button>
      <Button type="submit" disabled={!ready}>{t("drill.setup.start")}</Button>
    </div>
  </form>;
}

export function WordDrillSetup({ opened, ...props }: {
  opened: boolean; lessons: readonly WordBookmarkLesson[]; lessonId: string | null; language: string; onClose: () => void; onStart: (settings: WordDrillSettings) => void;
}) {
  const { t } = useTranslation();
  // The form mounts with the dialog, so each opening starts from the defaults and the current filter.
  return <AdaptiveDialog opened={opened} onClose={props.onClose} title={t("drill.setup.title")}>
    {opened && <SetupForm {...props} />}
  </AdaptiveDialog>;
}
