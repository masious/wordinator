import { readDialogueTurns, walkLessonBlocks, type CourseLesson, type DialogueScene as SceneAsset, type InlineContent, type LessonBlockOf } from "@wordinator/contracts/lesson-document";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo, useRef, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { apiRequest, courseProgressQueryOptions, lessonQueryOptions, sessionQueryOptions } from "../../api";
import { useLearningClaim } from "../../learningTime";
import { lessonSpeech, SpeechScope } from "../../molecules/Speech";
import { lessonSteps } from "../../organisms/CourseLessons/LessonPlayer";
import { saveLessonPosition } from "../../organisms/CourseLessons/LessonReadingProgress";
import { useLessonBookmarkTarget, WordBookmarkScope } from "../../organisms/WordBookmark/WordBookmark";
import { ErrorState, LoadingState } from "../../ui";
import { markLesson } from "../TempHovercard/lessonWords";
import { HovercardDemoContext, type HovercardDemo } from "../TempHovercard/WordHovercard";
import { Conversation } from "../TempConv/Conversation";
import { dialogueScenesResponseSchema } from "@wordinator/contracts/lesson-document";

const toneStyle = { "--hc-tone": "var(--color-action)", "--hc-on-tone": "var(--color-action-text)" } as CSSProperties;

export function DialogueScenePage({ groupId, courseId, lessonId, courseSlug, lessonSlug, blockId }: {
  groupId: string; courseId: string; lessonId: string; courseSlug: string; lessonSlug: string; blockId: string;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const client = useQueryClient();
  const session = useQuery(sessionQueryOptions());
  const lesson = useQuery(lessonQueryOptions(groupId, courseId, lessonId));
  const progress = useQuery(courseProgressQueryOptions(groupId, courseId));
  const images = useQuery({
    queryKey: ["dialogue-scenes", groupId, courseId, lessonId] as const,
    queryFn: () => apiRequest(`/api/groups/${encodeURIComponent(groupId)}/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}/dialogue-scenes`, dialogueScenesResponseSchema),
    enabled: Boolean(lesson.data?.lesson),
  });
  if (session.isPending || lesson.isPending || progress.isPending || images.isPending) return <LoadingState label={t("courses.conversationScene.loading")} />;
  if (!lesson.data?.lesson || !progress.data || images.isError) return <ErrorState title={t("courses.conversationScene.unavailable")} />;
  const data = lesson.data.lesson;
  const document = data.document;
  const blocks = document ? [...walkLessonBlocks(document.blocks)].map(({ block }) => block) : [];
  const block = blocks.find((entry) => entry.id === blockId && entry.type === "dialogue") as LessonBlockOf<"dialogue"> | undefined;
  if (!document || !block) return <ErrorState title={t("courses.conversationScene.unavailable")} />;
  const scene = images.data?.scenes.find((entry) => entry.blockId === blockId);
  const blockAt = blocks.findIndex((entry) => entry.id === blockId);
  const nextBlock = blocks.slice(blockAt + 1).find((entry) => entry.type !== "column")?.id ?? blockId;
  const firstDialogue = document.blocks.find((entry) => entry.type === "dialogue")?.id === blockId;
  const intro: InlineContent[] = [];
  let label: string | null = null;
  for (const entry of firstDialogue ? document.blocks.slice(0, document.blocks.findIndex((item) => item.id === blockId)) : blocks.slice(0, blockAt)) {
    if (entry.type === "heading") { label = entry.content.map((item) => item.type === "text" ? item.text : item.content.map((text) => text.text).join("")).join(""); continue; }
    if (firstDialogue && "content" in entry && Array.isArray(entry.content) && entry.content.length) intro.push(entry.content as InlineContent);
  }
  return <SceneContent key={blockId} groupId={groupId} courseId={courseId} lessonId={lessonId} courseSlug={courseSlug}
    lessonSlug={lessonSlug} lesson={data} block={block} intro={intro} label={label} nextBlock={nextBlock} scene={scene}
    language={session.data?.status === "signedIn" && session.data.groups.find((entry) => entry.id === groupId)?.language === "de" ? "de" : "nl"}
    savedStep={progress.data.positions.find((entry) => entry.lessonId === lessonId)?.stepIndex ?? -1}
    completed={progress.data.completedLessonIds.includes(lessonId)} client={client} navigate={navigate} />;
}

function SceneContent({ groupId, courseId, lessonId, courseSlug, lessonSlug, lesson, block, intro, label, nextBlock, scene, savedStep, completed, client, navigate, language }: {
  groupId: string; courseId: string; lessonId: string; courseSlug: string; lessonSlug: string; lesson: CourseLesson;
  block: LessonBlockOf<"dialogue">; intro: InlineContent[]; label: string | null; nextBlock: string; scene: SceneAsset | undefined;
  savedStep: number; completed: boolean; client: ReturnType<typeof useQueryClient>; navigate: ReturnType<typeof useNavigate>; language: "nl" | "de";
}) {
  const document = lesson.document!;
  const steps = useMemo(() => lessonSteps(lesson), [lesson]);
  const speech = useMemo(() => lessonSpeech(lesson), [lesson]);
  const marks = useMemo(() => markLesson(document, language), [document, language]);
  const demo = useMemo<HovercardDemo>(() => ({ toneStyle, sayWords: false, words: marks.words, subtle: true, clickOnly: true, persistentBookmarks: true }), [marks]);
  const bookmarkTarget = useLessonBookmarkTarget(groupId, courseId, lessonId, document);
  const furthest = useRef(savedStep);
  furthest.current = Math.max(furthest.current, savedStep);
  const active = lesson.published && !completed;
  useLearningClaim(lesson.published ? { groupId, target: () => ({ activity: "reading", focus: "lesson", courseId, lessonId }) } : null);
  const onLineChange = useCallback((index: number) => {
    const at = steps.findIndex((step) => step.kind === "dialogueTurn" && step.block.id === block.id && step.turnIndex === index);
    if (!active || at <= furthest.current) return;
    furthest.current = at;
    const step = steps[at];
    if (step) void saveLessonPosition(client, { path: `/api/groups/${encodeURIComponent(groupId)}/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}`, groupId, courseId }, step);
  }, [active, block.id, client, courseId, groupId, lessonId, steps]);
  const lessonRoute = { to: "/courses/$courseSlug/lessons/$lessonSlug" as const, params: { courseSlug, lessonSlug } };
  const leave = () => void navigate(lessonRoute);
  const advance = () => void navigate({ ...lessonRoute, hash: nextBlock });
  const fallback = lesson.document?.blocks.find((entry) => entry.type === "image");
  const background = scene?.backgroundUrl ?? scene?.locationUrl ?? (fallback?.type === "image" ? fallback.props.url : "");
  return <WordBookmarkScope resolve={bookmarkTarget}><HovercardDemoContext.Provider value={demo}><SpeechScope resolve={(key) => speech[key] ?? null}>
    <Conversation blockId={block.id} title={lesson.title} scene={label} intro={intro} turns={readDialogueTurns(block)}
      background={background} location={scene?.locationUrl ?? undefined} portraits={scene?.portraits ?? {}}
      lineScenes={scene?.lineScenes.map((line) => ({ scene: line.sceneUrl, mask: line.maskUrl }))}
      spans={marks.spans.get(block.id)} onLineChange={onLineChange} onContinue={advance} onExit={leave} />
  </SpeechScope></HovercardDemoContext.Provider></WordBookmarkScope>;
}
