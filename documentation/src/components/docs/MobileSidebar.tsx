import { useState } from "react";
import { Menu } from "lucide-react";
import Sidebar from "./Sidebar";
import type { SidebarGroup } from "@/lib/docs";
import type { Lang } from "@/i18n/ui";

interface Props {
  groups: SidebarGroup[];
  currentSlug: string;
  lang: Lang;
  siteName: string;
}

export default function MobileSidebar({ groups, currentSlug, lang, siteName }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button onClick={() => setOpen(true)} className="p-2 -ml-2 hover:bg-accent rounded-md">
        <Menu className="h-5 w-5" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="fixed inset-y-0 left-0 z-50 w-[280px] bg-background border-r border-border shadow-lg">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <span className="font-bold">{siteName}</span>
              <button onClick={() => setOpen(false)} className="p-1 hover:bg-accent rounded-md text-sm">
                ✕
              </button>
            </div>
            <div className="overflow-y-auto p-4 h-[calc(100vh-57px)]">
              <Sidebar groups={groups} currentSlug={currentSlug} lang={lang} />
            </div>
          </div>
        </>
      )}
    </>
  );
}
