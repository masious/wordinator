import { createFileRoute, notFound } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { EmptyState, PageContainer } from "../ui";
import { loadDraftLesson } from "../organisms/LessonOverview/draftLessons";
import { ZigzagOverview, type IconStyle } from "../organisms/LessonOverview/ZigzagOverview";

// Prototype, development only: the zigzag variation of the lesson overview, e.g. /2overview/07-a-mijn-dag?step=40.
// It takes the same lesson files and `step` search parameter as /overview; stops show emoji, and `icons=icons` swaps them for icons.
export const Route = createFileRoute("/2overview/$lessonSlug")({
  validateSearch: (search: Record<string, unknown>): { step?: number; icons?: IconStyle } => {
    const step = Number(search.step);
    return {
      ...(search.step !== undefined && Number.isInteger(step) && step >= 0 ? { step } : {}),
      ...(search.icons === "icons" ? { icons: "icons" as const } : {}),
    };
  },
  beforeLoad: () => { if (!import.meta.env.DEV) throw notFound(); },
  loader: ({ params }) => loadDraftLesson(params.lessonSlug),
  component: ZigzagOverviewRoute,
});

function ZigzagOverviewRoute() {
  const { t } = useTranslation();
  const overview = Route.useLoaderData(); const { lessonSlug } = Route.useParams(); const { step, icons } = Route.useSearch();
  const navigate = Route.useNavigate();
  if (!overview) return <PageContainer><EmptyState title={t("courses.overview.notFound", { slug: lessonSlug })} /></PageContainer>;
  const firstPractice = overview.stops.find((stop) => stop.kind === "practice")?.start ?? 0;
  const reached = Math.min(step ?? firstPractice, overview.steps.length);
  return <ZigzagOverview overview={overview} reached={reached} icons={icons}
    onReach={(next) => void navigate({ search: (current) => ({ ...current, step: Math.min(next, overview.steps.length) }), replace: true, resetScroll: false })} />;
}
