import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { queryClient } from "./query";
import { NotFoundPage } from "./pages/NotFoundPage";

export const router = createRouter({ routeTree, context: { queryClient }, defaultPreload: "intent", defaultNotFoundComponent: NotFoundPage });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
