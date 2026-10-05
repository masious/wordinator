import "@mantine/core/styles.css";
import "@fontsource-variable/manrope/wght.css";
import "@fontsource-variable/newsreader/wght.css";
import "@fontsource-variable/newsreader/wght-italic.css";
import "@fontsource/dm-mono/latin-400.css";
import "@fontsource/dm-mono/latin-500.css";
import { localStorageColorSchemeManager, MantineProvider } from "@mantine/core";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import "./i18n";
import "./index.css";
import { router } from "./router";
import { theme } from "./theme";
import { queryClient } from "./query";
import { COLOR_SCHEME_STORAGE_KEY, ThemeRuntimeSync } from "./colorScheme";

registerSW({ immediate: true });
const colorSchemeManager = localStorageColorSchemeManager({ key: COLOR_SCHEME_STORAGE_KEY });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MantineProvider colorSchemeManager={colorSchemeManager} defaultColorScheme="auto" theme={theme}>
      <ThemeRuntimeSync />
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </MantineProvider>
  </StrictMode>,
);
