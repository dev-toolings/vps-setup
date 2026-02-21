import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface Heading {
  depth: number;
  slug: string;
  text: string;
}

interface Props {
  headings: Heading[];
  title: string;
}

export default function TableOfContents({ headings, title }: Props) {
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      { rootMargin: "0px 0px -80% 0px" }
    );

    headings.forEach(({ slug }) => {
      const el = document.getElementById(slug);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [headings]);

  const filtered = headings.filter((h) => h.depth >= 2 && h.depth <= 3);
  if (filtered.length === 0) return null;

  return (
    <div>
      <p className="text-sm font-medium mb-3">{title}</p>
      <nav className="space-y-1">
        {filtered.map((heading) => (
          <a
            key={heading.slug}
            href={`#${heading.slug}`}
            className={cn(
              "block text-xs leading-relaxed transition-colors",
              heading.depth === 3 && "pl-3",
              activeId === heading.slug
                ? "text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {heading.text}
          </a>
        ))}
      </nav>
    </div>
  );
}
