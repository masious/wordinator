import { Radio } from "@mantine/core";
import { lessonWordBatches, wordDrillModeSchema, wordDrillSourceSchema, type WordBookmarkLesson, type WordDrillMode, type WordDrillSource } from "@wordinator/contracts/lesson-document";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { lessonQueryOptions, type WordDrillSettings } from "../../api";
import { AdaptiveDialog, Button, RadioField, SelectField } from "../../ui";
import styles from "./WordDrillSetup.module.css";

// The drill setup (docs/words.md#setup): Weak words or one lesson, and a direction. Weak words needs a visible bookmark or
// word memory (`hasMemory`, from the Weak words read); the
// lessons come from the Words tab's lesson filter, and the lesson select starts on the filter's lesson.
const ALL_WORDS = "all";

// The chosen lesson's word batches (docs/words.md#word-batches), read from its published document once the lesson loads.
function BatchSelect({ groupId, entry, batch, onBatch }: { groupId: string; entry: WordBookmarkLesson; batch: number | null; onBatch: (next: number | null) => void }) {
  const { t } = useTranslation();
  const lesson = useQuery(lessonQueryOptions(groupId, entry.course.id, entry.lesson.id));
  const data = useMemo(() => {
    const document = lesson.data?.lesson.document;
    const batches = document ? lessonWordBatches(document) : [];
    return [{ value: ALL_WORDS, label: t("drill.setup.allWords") }, ...batches.map((item, index) => ({
      value: String(index + 1),
      label: [t("drill.setup.batch", { number: index + 1 }), t("drill.setup.batchWords", { count: item.wordIds.length }), ...item.headings].join(" · "),
    }))];
  }, [lesson.data, t]);
  return <SelectField label={t("drill.setup.batchSelect")} description={t("drill.setup.batchHelp")} data={data} disabled={data.length < 3}
    value={batch === null ? ALL_WORDS : String(batch)} allowDeselect={false} onChange={(value) => onBatch(value && value !== ALL_WORDS ? Number(value) : null)} />;
}

function SetupForm({ groupId, lessons, lessonId, hasMemory, language, onClose, onStart }: {
  groupId: string; lessons: readonly WordBookmarkLesson[]; lessonId: string | null; hasMemory: boolean; language: string; onClose: () => void; onStart: (settings: WordDrillSettings) => void;
}) {
  const { t } = useTranslation();
  const hasWeak = hasMemory || lessons.some((entry) => entry.count > 0);
  const [source, setSource] = useState<WordDrillSource>(hasWeak || !lessons.length ? "weak" : "lesson");
  const [lesson, setLesson] = useState<string | null>(() => lessons.find((entry) => entry.lesson.id === lessonId)?.lesson.id ?? lessons[0]?.lesson.id ?? null);
  const [batch, setBatch] = useState<number | null>(null);
  const [direction, setDirection] = useState<WordDrillMode>("mixed");
  const chosen = lessons.find((entry) => entry.lesson.id === lesson);
  const data = useMemo(() => {
    const groups = new Map<string, { group: string; items: Array<{ value: string; label: string }> }>();
    for (const entry of lessons) {
      const group = groups.get(entry.course.id) ?? { group: entry.course.title, items: [] };
      group.items.push({ value: entry.lesson.id, label: entry.lesson.title });
      groups.set(entry.course.id, group);
    }
    return [...groups.values()];
  }, [lessons]);
  const ready = source === "weak" ? hasWeak : Boolean(lesson);
  return <form className={styles.form} onSubmit={(event) => {
    event.preventDefault();
    if (!ready) return;
    onStart(source === "lesson" && lesson ? { source, lesson, ...(batch ? { batch } : {}), direction } : { source: "weak", direction });
  }}>
    <Radio.Group label={t("drill.setup.words")} value={source} onChange={(value) => { const next = wordDrillSourceSchema.safeParse(value); if (next.success) setSource(next.data); }}>
      <div className={styles.choices}>
        <RadioField value="weak" label={t("drill.setup.weak")} disabled={!hasWeak}
          description={hasWeak ? t("drill.setup.weakHelp") : t("drill.setup.weakEmpty")} />
        <RadioField value="lesson" label={t("drill.setup.lesson")} disabled={!lessons.length} description={t("drill.setup.lessonHelp")} />
      </div>
    </Radio.Group>
    {source === "lesson" && <SelectField label={t("drill.setup.lessonSelect")} data={data} value={lesson} allowDeselect={false} onChange={(next) => { setLesson(next); setBatch(null); }} />}
    {source === "lesson" && chosen && <BatchSelect key={chosen.lesson.id} groupId={groupId} entry={chosen} batch={batch} onBatch={setBatch} />}
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
  opened: boolean; groupId: string; lessons: readonly WordBookmarkLesson[]; lessonId: string | null; hasMemory: boolean; language: string; onClose: () => void; onStart: (settings: WordDrillSettings) => void;
}) {
  const { t } = useTranslation();
  // The form mounts with the dialog, so each opening starts from the defaults and the current filter.
  return <AdaptiveDialog opened={opened} onClose={props.onClose} title={t("drill.setup.title")}>
    {opened && <SetupForm {...props} />}
  </AdaptiveDialog>;
}
