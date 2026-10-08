import { createFileRoute, notFound } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { EmptyState, PageContainer } from "../ui";
import { loadDraftLesson } from "../organisms/LessonOverview/draftLessons";
import { LessonOverview } from "../organisms/LessonOverview/LessonOverview";

// Prototype, development only: the lesson overview of an authored lesson file, e.g. /overview/07-a-mijn-dag?step=40.
// `step` is the simulated reader position; without it the reader stands at the lesson's first practice.
export const Route = createFileRoute("/overview/$lessonSlug")({
  validateSearch: (search: Record<string, unknown>): { step?: number } => {
    const step = Number(search.step);
    return search.step !== undefined && Number.isInteger(step) && step >= 0 ? { step } : {};
  },
  beforeLoad: () => { if (!import.meta.env.DEV) throw notFound(); },
  loader: ({ params }) => loadDraftLesson(params.lessonSlug),
  component: OverviewRoute,
});

function OverviewRoute() {
  const { t } = useTranslation();
  const overview = Route.useLoaderData(); const { lessonSlug } = Route.useParams(); const { step } = Route.useSearch();
  const navigate = Route.useNavigate();
  if (!overview) return <PageContainer><EmptyState title={t("courses.overview.notFound", { slug: lessonSlug })} /></PageContainer>;
  const firstPractice = overview.stops.find((stop) => stop.kind === "practice")?.start ?? 0;
  const reached = Math.min(step ?? firstPractice, overview.steps.length);
  return <LessonOverview overview={overview} reached={reached}
    onReach={(next) => void navigate({ search: { step: Math.min(next, overview.steps.length) }, replace: true, resetScroll: false })} />;
}
