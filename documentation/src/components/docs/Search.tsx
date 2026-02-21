import { useState, useEffect, useCallback } from "react";
import type { Lang } from "@/i18n/ui";

interface Props {
  lang: Lang;
  placeholder: string;
}

export default function Search({ lang, placeholder }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const search = useCallback(
    async (q: string) => {
      setQuery(q);
      if (!q || typeof window === "undefined") {
        setResults([]);
        return;
      }
      try {
        // @ts-ignore - pagefind is loaded at runtime after build
        const pagefind = await import(/* @vite-ignore */ "/pagefind/pagefind.js");
        const result = await pagefind.search(q);
        const data = await Promise.all(result.results.slice(0, 8).map((r: any) => r.data()));
        setResults(data.filter((d: any) => d.url.startsWith(`/${lang}/`)));
      } catch {
        setResults([]);
      }
    },
    [lang]
  );

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm text-muted-foreground hover:bg-accent"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        {placeholder}
        <kbd className="ml-auto pointer-events-none hidden select-none rounded border border-border px-1.5 py-0.5 text-xs sm:inline-block">
          ⌘K
        </kbd>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="fixed left-1/2 top-[20%] z-50 w-full max-w-lg -translate-x-1/2 rounded-lg border border-border bg-background p-0 shadow-lg">
            <input
              autoFocus
              value={query}
              onChange={(e) => search(e.target.value)}
              placeholder={placeholder}
              className="w-full border-b border-border bg-transparent px-4 py-3 text-sm outline-none"
            />
            <div className="max-h-[300px] overflow-y-auto p-2">
              {results.length === 0 && query && (
                <p className="p-4 text-sm text-muted-foreground text-center">No results found.</p>
              )}
              {results.map((result, i) => (
                <a
                  key={i}
                  href={result.url}
                  className="block rounded-md px-3 py-2 text-sm hover:bg-accent"
                  onClick={() => setOpen(false)}
                >
                  <div className="font-medium">{result.meta?.title ?? result.url}</div>
                  {result.excerpt && (
                    <div
                      className="text-xs text-muted-foreground mt-0.5 line-clamp-2"
                      dangerouslySetInnerHTML={{ __html: result.excerpt }}
                    />
                  )}
                </a>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}
