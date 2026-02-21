import type { Lang } from "@/i18n/ui";
import { languages } from "@/i18n/ui";
import { getLocalizedUrl } from "@/i18n/utils";

interface Props {
  lang: Lang;
  pathname: string;
}

export default function LanguageSwitcher({ lang, pathname }: Props) {
  const targetLang = lang === "en" ? "fr" : "en";
  const url = new URL(pathname, "https://x.com");
  const targetUrl = getLocalizedUrl(url, targetLang);

  return (
    <a
      href={targetUrl}
      className="inline-flex items-center rounded-md border border-input bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
    >
      {languages[targetLang]}
    </a>
  );
}
