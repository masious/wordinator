import { createFileRoute } from "@tanstack/react-router";
import { HomePage } from "../pages/PhaseOnePages";

export const Route = createFileRoute("/")({ component: HomePage });
