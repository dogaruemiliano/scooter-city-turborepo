import { localeHeaderName, type SupportedLocale } from "@repo/i18n";

export type MobileLocaleHeaders = Readonly<Record<string, string>>;

export function getMobileLocaleHeaders(
  locale: SupportedLocale,
): MobileLocaleHeaders {
  return {
    [localeHeaderName]: locale,
  };
}

export function withMobileLocaleHeader(
  headers: MobileLocaleHeaders | undefined,
  locale: SupportedLocale,
): MobileLocaleHeaders {
  return {
    ...(headers ?? {}),
    ...getMobileLocaleHeaders(locale),
  };
}
