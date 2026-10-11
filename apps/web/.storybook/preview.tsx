import "@mantine/core/styles.css";
import "@fontsource-variable/manrope/wght.css";
import "@fontsource-variable/newsreader/wght.css";
import "@fontsource-variable/newsreader/wght-italic.css";
import "@fontsource/dm-mono/latin-400.css";
import "@fontsource/dm-mono/latin-500.css";
import "../src/i18n";
import "../src/index.css";
import { MantineProvider } from "@mantine/core";
import type { Decorator, Preview } from "@storybook/react-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { createContext, useContext, useState, type ComponentType } from "react";
import { theme } from "../src/theme";
import { seedQueries, type QuerySeed } from "../stories/fixtures";

// The router is created once per story; the story itself reaches its route through context, so changed args re-render it.
const CurrentStory = createContext<ComponentType | null>(null);
function StorySlot() {
  const Story = useContext(CurrentStory);
  return Story ? <Story /> : null;
}

// Every story gets the app's Mantine theme and tokens in the chosen colour scheme, a fresh query cache seeded with the signed-in
// fixture account (plus any `parameters.queries`), and a memory router, so links render without leaving Storybook.
const withProviders: Decorator = (Story, context) => {
  const scheme = context.globals.colorScheme === "dark" ? "dark" : "light";
  const seed = context.parameters.queries as QuerySeed | undefined;
  const [queryClient] = useState(() => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } });
    seedQueries(client, seed);
    return client;
  });
  const [router] = useState(() => {
    const root = createRootRoute();
    const route = createRoute({ getParentRoute: () => root, path: "$", component: StorySlot });
    return createRouter({ routeTree: root.addChildren([route]), history: createMemoryHistory({ initialEntries: ["/journal"] }) });
  });
  return <MantineProvider theme={theme} forceColorScheme={scheme}>
    <QueryClientProvider client={queryClient}>
      <CurrentStory.Provider value={Story}><RouterProvider router={router} /></CurrentStory.Provider>
    </QueryClientProvider>
  </MantineProvider>;
};

const preview: Preview = {
  decorators: [withProviders],
  globalTypes: {
    colorScheme: {
      description: "Colour scheme",
      toolbar: { title: "Colour scheme", icon: "mirror", items: [{ value: "light", title: "Light" }, { value: "dark", title: "Dark" }], dynamicTitle: true },
    },
  },
  initialGlobals: { colorScheme: "light" },
  parameters: { layout: "padded", controls: { expanded: true } },
};
export default preview;
