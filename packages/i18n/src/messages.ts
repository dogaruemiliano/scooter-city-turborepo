import type { SupportedLocale } from "./locales";
import { apiCatalog } from "./catalogs/api";
import { appShellCatalog } from "./catalogs/app-shell";
import { authCatalog } from "./catalogs/auth";
import { languageCatalog } from "./catalogs/language";
import { mobilePlatformCatalog } from "./catalogs/mobile-platform";
import { personsCatalog } from "./catalogs/persons";
import { sharedCatalog } from "./catalogs/shared";
import { themeCatalog } from "./catalogs/theme";

export type MessageTree = {
  readonly [key: string]: string | MessageTree;
};

export type MessageCatalogs = Readonly<Record<SupportedLocale, MessageTree>>;

export const messages = {
  en: {
    shared: sharedCatalog.en,
    auth: authCatalog.en,
    appShell: appShellCatalog.en,
    theme: themeCatalog.en,
    language: languageCatalog.en,
    persons: personsCatalog.en,
    api: apiCatalog.en,
    mobilePlatform: mobilePlatformCatalog.en,
  },
  ro: {
    shared: sharedCatalog.ro,
    auth: authCatalog.ro,
    appShell: appShellCatalog.ro,
    theme: themeCatalog.ro,
    language: languageCatalog.ro,
    persons: personsCatalog.ro,
    api: apiCatalog.ro,
    mobilePlatform: mobilePlatformCatalog.ro,
  },
} as const satisfies MessageCatalogs;

export type MessageCatalog = (typeof messages)[SupportedLocale];
export type MessageNamespace = keyof MessageCatalog;
export type MessageKey = LeafPath<(typeof messages)["en"]>;

type LeafPath<T> = {
  [Key in Extract<keyof T, string>]: T[Key] extends string
    ? Key
    : T[Key] extends Readonly<Record<string, unknown>>
      ? `${Key}.${LeafPath<T[Key]>}`
      : never;
}[Extract<keyof T, string>];
