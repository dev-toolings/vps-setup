export const languages = { en: "English", fr: "Français" } as const;
export const defaultLang = "en" as const;
export type Lang = keyof typeof languages;

export const ui = {
  en: {
    "site.title": "VPS Setup",
    "site.description": "Modern CLI for VPS provisioning with Ansible",
    "nav.getting-started": "Getting Started",
    "nav.servers": "Servers",
    "nav.profiles": "Profiles",
    "nav.configuration": "Configuration",
    "nav.history": "History",
    "search.placeholder": "Search documentation...",
    "toc.title": "On this page",
    "pagination.prev": "Previous",
    "pagination.next": "Next",
    "landing.hero": "Modern CLI for VPS provisioning",
    "landing.subtitle": "Manage multiple servers, configuration profiles, and deployment history — all from an elegant CLI.",
    "landing.cta": "Get Started",
    "landing.docs": "Documentation",
  },
  fr: {
    "site.title": "VPS Setup",
    "site.description": "CLI moderne pour le provisioning VPS avec Ansible",
    "nav.getting-started": "Démarrage rapide",
    "nav.servers": "Serveurs",
    "nav.profiles": "Profils",
    "nav.configuration": "Configuration",
    "nav.history": "Historique",
    "search.placeholder": "Rechercher dans la documentation...",
    "toc.title": "Sur cette page",
    "pagination.prev": "Précédent",
    "pagination.next": "Suivant",
    "landing.hero": "CLI moderne pour le provisioning VPS",
    "landing.subtitle": "Gérez plusieurs serveurs, profils de configuration et historique des déploiements — le tout depuis un CLI élégant.",
    "landing.cta": "Démarrer",
    "landing.docs": "Documentation",
  },
} as const;
