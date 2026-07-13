import type { APIRoute } from "astro";
import { getCollection } from "astro:content";

type SitemapUrl = {
  path: string;
  changefreq: "weekly" | "monthly";
  priority: string;
  alternates?: {
    en: string;
    fr: string;
    default: string;
  };
};

function xmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function absolute(path: string, origin: URL): string {
  return new URL(path, origin).toString();
}

export const GET: APIRoute = async ({ site }) => {
  const origin = site ?? new URL("https://vps-setup.dev");
  const docs = await getCollection("docs");
  const docPairs = new Map<string, Partial<Record<"en" | "fr", string>>>();

  for (const doc of docs) {
    const [lang, ...slugParts] = doc.id.split("/");
    if (lang !== "en" && lang !== "fr") continue;
    const slug = slugParts.join("/");
    const path = `/${lang}/docs/${slug}/`;
    docPairs.set(slug, { ...docPairs.get(slug), [lang]: path });
  }

  const urls: SitemapUrl[] = [
    {
      path: "/en/",
      changefreq: "weekly",
      priority: "1.0",
      alternates: { en: "/en/", fr: "/fr/", default: "/en/" },
    },
    {
      path: "/fr/",
      changefreq: "weekly",
      priority: "0.9",
      alternates: { en: "/en/", fr: "/fr/", default: "/en/" },
    },
  ];

  for (const paths of docPairs.values()) {
    for (const lang of ["en", "fr"] as const) {
      const path = paths[lang];
      if (!path) continue;
      urls.push({
        path,
        changefreq: "weekly",
        priority: "0.8",
        alternates:
          paths.en && paths.fr
            ? {
                en: paths.en,
                fr: paths.fr,
                default: paths.en,
              }
            : undefined,
      });
    }
  }

  const body = urls
    .map((url) => {
      const alternates = url.alternates
        ? [
            `<xhtml:link rel="alternate" hreflang="en" href="${xmlEscape(absolute(url.alternates.en, origin))}" />`,
            `<xhtml:link rel="alternate" hreflang="fr" href="${xmlEscape(absolute(url.alternates.fr, origin))}" />`,
            `<xhtml:link rel="alternate" hreflang="x-default" href="${xmlEscape(absolute(url.alternates.default, origin))}" />`,
          ].join("")
        : "";

      return [
        "<url>",
        `<loc>${xmlEscape(absolute(url.path, origin))}</loc>`,
        alternates,
        `<changefreq>${url.changefreq}</changefreq>`,
        `<priority>${url.priority}</priority>`,
        "</url>",
      ].join("");
    })
    .join("");

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${body}</urlset>`,
    {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
      },
    },
  );
};
