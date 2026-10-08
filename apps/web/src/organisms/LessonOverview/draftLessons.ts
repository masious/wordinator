import { lessonDocumentSchema } from "@wordinator/contracts/lesson-document";
import { authoredDocument } from "../../../../../content/dutch-foundations/tools/normalize";
import { buildOverview, type LessonOverview } from "./overviewModel";

// Prototype only: the lesson overview reads authored lesson files straight from `content/` so its design can be settled before
// it has an API. Production builds replace the glob with an empty object, so no lesson file is bundled.
type AuthoredLesson = { title: string; goal?: string | null; blocks: unknown[] };
const files: Record<string, () => Promise<AuthoredLesson>> = import.meta.env.DEV
  ? import.meta.glob<AuthoredLesson>("../../../../../content/*/*/[0-9]*.json", { import: "default" })
  : {};

export async function loadDraftLesson(slug: string): Promise<LessonOverview | null> {
  const path = Object.keys(files).find((entry) => entry.endsWith(`/${slug}.json`));
  if (!path) return null;
  const file = await files[path]!();
  // The shorthand normalizer fills in IDs and defaults in place, so it works on a copy of the cached module.
  const document = lessonDocumentSchema.parse(authoredDocument(structuredClone(file.blocks)));
  return buildOverview(file.title, file.goal ?? null, document);
}
