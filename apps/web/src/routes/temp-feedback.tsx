import { createFileRoute } from "@tanstack/react-router";
import { TempFeedback } from "../pages/TempFeedback/TempFeedback";

// Temporary: answer feedback prototypes (answered sets as the learner's reply, word-level mistake marks). Remove once one is picked.
export const Route = createFileRoute("/temp-feedback")({ component: TempFeedback });
