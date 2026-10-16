import { okResponseSchema } from "@wordinator/contracts";
import { walkLessonBlocks, type CourseDetailResponse, type LessonDocument, type CourseLesson } from "@wordinator/contracts/lesson-document";
import { aiPracticeAnswerResponseSchema, type LessonAiPractice, type LessonAiPracticesResponse, type TutorComponentAnswer, type TutorGrade } from "@wordinator/contracts/tutor";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { apiRequest, courseQueryOptions, lessonAiPracticesPath, lessonAiPracticesQueryOptions, lessonProgressQueryOptions, lessonQueryOptions, speechRecognitionTokenSource } from "../../api";
import { RECOGNITION_LOCALES, SpeechRecognitionScope } from "../../molecules/speechRecognition";
import { Button, ConfirmDialog, LabelChip } from "../../ui";
import { loadClip } from "../Tutor/tutorApi";
import { AnswerComponent } from "../TutorComponents";
import styles from "./AiPractices.module.css";

// AI practices on the lesson page (C14h, docs/courses.md#lesson-pages): behind Show AI practices (n), each practice the tutor saved
// for this lesson appears in place after its anchor block, or at the end of the lesson when its anchor is gone. It is answered with
// the tutor's answer components, graded and recorded by the API (source `ai_practice`). Owners and active contributors may remove
// it from the lesson. Nothing here is remembered: collapsing and expanding again starts every practice afresh.

export type AiPracticeScope = { groupId: string; courseId: string; lessonId: string; language: string | undefined };

// The button under the lesson header, with the read's loading and error lines while expanded.
export function AiPracticeToggle({ count, shown, state, onToggle, onRetry }: {
  count: number; shown: boolean; state: "pending" | "error" | "success"; onToggle: () => void; onRetry: () => void;
}) {
  const { t } = useTranslation();
  return <div className={styles.toggle}>
    <Button variant="secondary" aria-expanded={shown} onClick={onToggle}>
      {shown ? t("courses.lessons.aiPractices.hide") : t("courses.lessons.aiPractices.show", { count })}
    </Button>
    {shown && state === "pending" && <p className={styles.status} role="status">{t("courses.lessons.aiPractices.loading")}</p>}
    {shown && state === "error" && <>
      <p className={styles.error} role="alert">{t("courses.lessons.aiPractices.unavailable")}</p>
      <Button variant="quiet" onClick={onRetry}>{t("courses.lessons.aiPractices.retry")}</Button>
    </>}
  </div>;
}

function AiPracticeCard({ scope, practice, canRemove }: { scope: AiPracticeScope; practice: LessonAiPractice; canRemove: boolean }) {
  const { t } = useTranslation(); const queryClient = useQueryClient();
  const [result, setResult] = useState<{ answer: TutorComponentAnswer; grade: TutorGrade } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const path = `${lessonAiPracticesPath(scope.groupId, scope.courseId, scope.lessonId)}/${encodeURIComponent(practice.id)}`;
  const token = useMemo(() => speechRecognitionTokenSource(scope.groupId), [scope.groupId]);
  const locale = scope.language ? RECOGNITION_LOCALES[scope.language as keyof typeof RECOGNITION_LOCALES] ?? null : null;
  const clip = useMemo(() => practice.kind === "dictation" ? { key: `ai-practice:${practice.id}`, load: () => loadClip(`${path}/speech`) } : undefined, [practice.kind, practice.id, path]);
  const answer = async (sent: TutorComponentAnswer) => {
    const graded = await apiRequest(`${path}/answer`, aiPracticeAnswerResponseSchema, { method: "POST", body: JSON.stringify({ answer: sent }) });
    setResult({ answer: sent, grade: graded.grade });
  };
  // Removing updates the cached list and the lesson's count, so the button and its number follow at once.
  const remove = useMutation({
    mutationFn: () => apiRequest(path, okResponseSchema, { method: "DELETE" }),
    onSuccess: async () => {
      const { groupId, courseId, lessonId } = scope;
      queryClient.setQueryData<LessonAiPracticesResponse>(lessonAiPracticesQueryOptions(groupId, courseId, lessonId).queryKey,
        (data) => data && { ...data, practices: data.practices.filter((entry) => entry.id !== practice.id) });
      const decrement = (lesson: CourseLesson): CourseLesson => lesson.id === lessonId ? { ...lesson, aiPracticeCount: Math.max(0, (lesson.aiPracticeCount ?? 0) - 1) } : lesson;
      queryClient.setQueryData<{ lesson: CourseLesson }>(lessonQueryOptions(groupId, courseId, lessonId).queryKey, (data) => data && { lesson: decrement(data.lesson) });
      queryClient.setQueryData<CourseDetailResponse>(courseQueryOptions(groupId, courseId).queryKey, (data) => data && { ...data, lessons: data.lessons.map(decrement) });
      setConfirming(false);
      await queryClient.invalidateQueries({ queryKey: lessonProgressQueryOptions(groupId, courseId).queryKey });
    },
  });
  return <section className={styles.practice} aria-label={t("courses.lessons.aiPractices.label")}>
    <div className={styles.head}>
      <LabelChip>{t("courses.lessons.aiPractices.label")}</LabelChip>
      {canRemove && <Button variant="quiet" onClick={() => { remove.reset(); setConfirming(true); }}>{t("courses.lessons.aiPractices.remove")}</Button>}
    </div>
    <SpeechRecognitionScope locale={locale} token={token}>
      <AnswerComponent view={practice.view} answer={result?.answer ?? null} grade={result?.grade ?? null} onAnswer={answer} clip={clip} />
    </SpeechRecognitionScope>
    {canRemove && <ConfirmDialog opened={confirming} onClose={() => setConfirming(false)} title={t("courses.lessons.aiPractices.removeTitle")}
      confirmLabel={t("courses.lessons.aiPractices.remove")} cancelLabel={t("common.cancel")} confirmLoading={remove.isPending} onConfirm={() => remove.mutate()}>
      <p>{t("courses.lessons.aiPractices.removeConfirm")}</p>
      {remove.isError && <p className={styles.error} role="alert">{t("courses.lessons.aiPractices.removeFailed")}</p>}
    </ConfirmDialog>}
  </section>;
}

// Places the practices for the lesson renderer: by anchor block, and the rest at the end (no anchor, or one the document lacks).
export function useAiPracticeSlots(scope: AiPracticeScope | null, document: LessonDocument | null, data: LessonAiPracticesResponse | undefined) {
  return useMemo(() => {
    if (!scope || !data || !document) return null;
    const ids = new Set([...walkLessonBlocks(document.blocks)].map(({ block }) => block.id));
    const anchored = new Map<string, LessonAiPractice[]>(); const end: LessonAiPractice[] = [];
    for (const practice of data.practices) {
      if (practice.afterBlockId && ids.has(practice.afterBlockId)) anchored.set(practice.afterBlockId, [...anchored.get(practice.afterBlockId) ?? [], practice]);
      else end.push(practice);
    }
    const cards = (practices: LessonAiPractice[]): ReactNode => practices.map((practice) =>
      <AiPracticeCard key={practice.id} scope={scope} practice={practice} canRemove={data.canRemove} />);
    return {
      afterBlock: (blockId: string) => { const practices = anchored.get(blockId); return practices ? cards(practices) : null; },
      end: end.length ? cards(end) : null,
    };
  }, [scope, document, data]);
}
