import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext } from "@tanstack/react-router";
import { App } from "../App";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({ component: App });
