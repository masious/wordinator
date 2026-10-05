import { createFileRoute } from "@tanstack/react-router";
import { UiWorkbench } from "../pages/UiWorkbench";

export const Route = createFileRoute("/ui")({ component: UiWorkbench });
