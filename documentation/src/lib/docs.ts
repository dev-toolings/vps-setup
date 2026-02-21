import { getCollection } from "astro:content";
import type { Lang } from "@/i18n/ui";

export interface DocEntry {
  id: string;
  slug: string;
  data: {
    title: string;
    description: string;
    section: string;
    order: number;
  };
}

export interface SidebarGroup {
  section: string;
  items: { title: string; slug: string; order: number }[];
}

export async function getDocsForLocale(lang: Lang): Promise<DocEntry[]> {
  const allDocs = await getCollection("docs");
  return allDocs
    .filter((doc) => doc.id.startsWith(`${lang}/`))
    .sort((a, b) => a.data.order - b.data.order) as unknown as DocEntry[];
}

export async function getSidebarTree(lang: Lang): Promise<SidebarGroup[]> {
  const docs = await getDocsForLocale(lang);
  const groups = new Map<string, SidebarGroup>();

  for (const doc of docs) {
    const section = doc.data.section;
    if (!groups.has(section)) {
      groups.set(section, { section, items: [] });
    }
    const slug = doc.id.replace(`${lang}/`, "");
    groups.get(section)!.items.push({
      title: doc.data.title,
      slug,
      order: doc.data.order,
    });
  }

  for (const group of groups.values()) {
    group.items.sort((a, b) => a.order - b.order);
  }

  return Array.from(groups.values());
}
