import { createFileRoute } from "@tanstack/react-router";
import { TempIcons } from "../pages/TempIcons/TempIcons";

// Temporary: grammar icon candidates for the lesson index. Remove once one is picked.
export const Route = createFileRoute("/temp")({ component: TempIcons });
