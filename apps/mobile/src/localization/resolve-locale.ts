import {
  fallbackLocale,
  matchLocale,
  normalizeLocaleTag,
  type LocalePreference,
  type SupportedLocale,
} from "@repo/i18n";

export type MobileDeviceLocale =
  | LocalePreference
  | {
      readonly languageTag?: LocalePreference;
      readonly languageCode?: LocalePreference;
    };

export function resolveMobileLocale(
  storedLocale: LocalePreference,
  deviceLocales: Iterable<MobileDeviceLocale> = [],
  fallback: SupportedLocale = fallbackLocale,
): SupportedLocale {
  const normalizedStoredLocale = normalizeLocaleTag(storedLocale);

  if (normalizedStoredLocale !== null) {
    return normalizedStoredLocale;
  }

  return (
    matchLocale(getDeviceLocalePreferences(deviceLocales), { fallback }) ??
    fallback
  );
}

export function getDeviceLocalePreferences(
  deviceLocales: Iterable<MobileDeviceLocale>,
): LocalePreference[] {
  const preferences: LocalePreference[] = [];

  for (const locale of deviceLocales) {
    if (typeof locale === "string" || locale == null) {
      preferences.push(locale);
      continue;
    }

    preferences.push(locale.languageTag, locale.languageCode);
  }

  return preferences;
}
