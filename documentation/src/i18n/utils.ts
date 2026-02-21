import { ui, defaultLang, type Lang } from "./ui";

export function getLocaleFromUrl(url: URL): Lang {
  const [, lang] = url.pathname.split("/");
  if (lang in ui) return lang as Lang;
  return defaultLang;
}

export function useTranslations(lang: Lang) {
  return function t(key: keyof (typeof ui)[typeof defaultLang]): string {
    return (ui[lang] as Record<string, string>)[key] ?? (ui[defaultLang] as Record<string, string>)[key] ?? key;
  };
}

export function getLocalizedUrl(url: URL, targetLang: Lang): string {
  const [, , ...rest] = url.pathname.split("/");
  return `/${targetLang}/${rest.join("/")}`;
}
