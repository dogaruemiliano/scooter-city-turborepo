export const supportedLocales = ["ro", "en"] as const;

export type SupportedLocale = (typeof supportedLocales)[number];

export const defaultRouteLocale = "ro" satisfies SupportedLocale;
export const fallbackLocale = "en" satisfies SupportedLocale;

export const localeCookieName = "locale";
export const localeHeaderName = "X-Locale";

export const localeLabels = {
  ro: {
    label: "Română",
    shortLabel: "RO",
  },
  en: {
    label: "English",
    shortLabel: "EN",
  },
} as const satisfies Record<
  SupportedLocale,
  {
    readonly label: string;
    readonly shortLabel: string;
  }
>;

export type LocaleLabel = (typeof localeLabels)[SupportedLocale];

export type LocalePreference = string | null | undefined;

export type HeaderValue =
  | string
  | readonly string[]
  | number
  | null
  | undefined;

export type HeaderSource =
  | Headers
  | ReadonlyMap<string, HeaderValue>
  | Readonly<Record<string, HeaderValue>>
  | Iterable<readonly [string, HeaderValue]>;

export interface LocaleMatchOptions {
  readonly fallback?: SupportedLocale | null;
}

export interface LocaleHeaderResolutionOptions {
  readonly fallback?: SupportedLocale;
}

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return (
    typeof value === "string" &&
    supportedLocales.includes(value as SupportedLocale)
  );
}

export function normalizeLocaleTag(
  value: LocalePreference,
): SupportedLocale | null {
  if (typeof value !== "string") {
    return null;
  }

  const tag = value.trim();

  if (tag.length === 0) {
    return null;
  }

  const [language] = tag.toLowerCase().replaceAll("_", "-").split("-");

  return isSupportedLocale(language) ? language : null;
}

export function matchLocale(
  preferences: Iterable<LocalePreference>,
  options: LocaleMatchOptions = {},
): SupportedLocale | null {
  for (const preference of preferences) {
    const locale = normalizeLocaleTag(preference);

    if (locale !== null) {
      return locale;
    }
  }

  return options.fallback ?? null;
}

export function parseAcceptLanguage(value: string | null | undefined): string[] {
  if (typeof value !== "string" || value.trim().length === 0) {
    return [];
  }

  return value
    .split(",")
    .map((part, index) => {
      const [rawTag, ...rawParameters] = part.trim().split(";");
      const qParameter = rawParameters.find((parameter) =>
        parameter.trim().toLowerCase().startsWith("q="),
      );
      const parsedQuality =
        qParameter === undefined
          ? 1
          : Number.parseFloat(qParameter.trim().slice(2));

      return {
        index,
        quality:
          Number.isFinite(parsedQuality) && parsedQuality >= 0
            ? parsedQuality
            : 0,
        tag: rawTag?.trim() ?? "",
      };
    })
    .filter((preference) => preference.tag.length > 0 && preference.quality > 0)
    .sort((left, right) => {
      if (right.quality !== left.quality) {
        return right.quality - left.quality;
      }

      return left.index - right.index;
    })
    .map((preference) => preference.tag);
}

export function resolveLocaleFromHeaders(
  headers: HeaderSource | null | undefined,
  options: LocaleHeaderResolutionOptions = {},
): SupportedLocale {
  const fallback = options.fallback ?? defaultRouteLocale;
  const explicitLocale = readHeader(headers, localeHeaderName);
  const normalizedExplicitLocale = normalizeLocaleTag(explicitLocale);

  if (normalizedExplicitLocale !== null) {
    return normalizedExplicitLocale;
  }

  return (
    matchLocale(parseAcceptLanguage(readHeader(headers, "accept-language")), {
      fallback,
    }) ?? fallback
  );
}

function readHeader(
  headers: HeaderSource | null | undefined,
  name: string,
): string | null {
  if (headers == null) {
    return null;
  }

  const normalizedName = name.toLowerCase();

  if (isIterableHeaderSource(headers)) {
    for (const [key, value] of headers) {
      if (key.toLowerCase() === normalizedName) {
        return normalizeHeaderValue(value);
      }
    }

    return null;
  }

  if (hasGetMethod(headers)) {
    const value = headers.get(name);
    return normalizeHeaderValue(value);
  }

  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === normalizedName) {
      return normalizeHeaderValue(value);
    }
  }

  return null;
}

function hasGetMethod(
  headers: HeaderSource,
): headers is HeaderSource & { get: (name: string) => HeaderValue } {
  return typeof (headers as { get?: unknown }).get === "function";
}

function isIterableHeaderSource(
  headers: HeaderSource,
): headers is Iterable<readonly [string, HeaderValue]> {
  return (
    typeof (headers as { [Symbol.iterator]?: unknown })[Symbol.iterator] ===
    "function"
  );
}

function normalizeHeaderValue(value: HeaderValue): string | null {
  if (Array.isArray(value)) {
    return value.join(",");
  }

  if (value == null) {
    return null;
  }

  return String(value);
}
