import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import mdx from "@astrojs/mdx";
import tailwind from "@astrojs/tailwind";

const SITE = process.env.SITE_URL || "https://vps-setup.dev";

export default defineConfig({
  site: SITE,
  integrations: [
    react(),
    mdx(),
    tailwind({ applyBaseStyles: false }),
  ],
  vite: {
    build: {
      rollupOptions: {
        external: ["/pagefind/pagefind.js"],
      },
    },
  },
  i18n: {
    defaultLocale: "en",
    locales: ["en", "fr"],
    routing: {
      prefixDefaultLocale: true,
      redirectToDefaultLocale: false,
    },
  },
});
