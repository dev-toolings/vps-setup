import type { APIRoute } from "astro";

export const GET: APIRoute = ({ site }) => {
  const origin = site ?? new URL("https://vps-setup.dev");

  return new Response(
    ["User-agent: *", "Allow: /", `Sitemap: ${new URL("/sitemap.xml", origin).toString()}`, ""].join("\n"),
    {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
    },
  );
};
