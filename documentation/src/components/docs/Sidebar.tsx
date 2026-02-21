import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SidebarGroup } from "@/lib/docs";
import type { Lang } from "@/i18n/ui";

interface Props {
  groups: SidebarGroup[];
  currentSlug: string;
  lang: Lang;
}

export default function Sidebar({ groups, currentSlug, lang }: Props) {
  const [openSections, setOpenSections] = useState<Set<string>>(
    new Set(groups.map((g) => g.section))
  );

  const toggleSection = (section: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  };

  return (
    <nav className="space-y-2">
      {groups.map((group) => (
        <div key={group.section}>
          <button
            onClick={() => toggleSection(group.section)}
            className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm font-semibold hover:bg-accent"
          >
            {group.section}
            <ChevronRight
              className={cn(
                "h-4 w-4 transition-transform",
                openSections.has(group.section) && "rotate-90"
              )}
            />
          </button>
          {openSections.has(group.section) && (
            <div className="ml-2 mt-1 space-y-0.5 border-l border-border pl-2">
              {group.items.map((item) => {
                const href = `/${lang}/docs/${item.slug}`;
                const isActive = currentSlug === href || currentSlug === `${href}/`;
                return (
                  <a
                    key={item.slug}
                    href={href}
                    className={cn(
                      "block rounded-md px-2 py-1.5 text-sm transition-colors",
                      isActive
                        ? "bg-accent font-medium text-accent-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    )}
                  >
                    {item.title}
                  </a>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </nav>
  );
}
