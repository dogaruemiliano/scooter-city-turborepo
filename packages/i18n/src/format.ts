import {
  fallbackLocale,
  normalizeLocaleTag,
  type SupportedLocale,
} from "./locales";
import { messages, type MessageKey, type MessageTree } from "./messages";

export type InterpolationValue = string | number | boolean | Date;

export type InterpolationValues = Readonly<
  Record<string, InterpolationValue | null | undefined>
>;

export type CatalogsByLocale = Readonly<
  Partial<Record<SupportedLocale, MessageTree>>
>;

export interface FormatterOptions {
  readonly catalogs?: CatalogsByLocale;
  readonly fallback?: SupportedLocale;
  readonly missingMessage?: (key: MessageKey, locale: SupportedLocale) => string;
}

export interface Formatter {
  readonly locale: SupportedLocale;
  readonly fallbackLocale: SupportedLocale;
  format(key: MessageKey, values?: InterpolationValues): string;
  has(key: MessageKey): boolean;
}

const interpolationPattern = /\{([a-zA-Z][a-zA-Z0-9_.-]*)\}/g;

export function createFormatter(
  locale: string | null | undefined,
  options: FormatterOptions = {},
): Formatter {
  const resolvedLocale =
    normalizeLocaleTag(locale) ?? options.fallback ?? fallbackLocale;
  const resolvedFallback = options.fallback ?? fallbackLocale;

  return {
    locale: resolvedLocale,
    fallbackLocale: resolvedFallback,
    format(key, values) {
      return formatMessage(resolvedLocale, key, values, options);
    },
    has(key) {
      return getMessageTemplate(resolvedLocale, key, options) !== null;
    },
  };
}

export function formatMessage(
  locale: string | null | undefined,
  key: MessageKey,
  values: InterpolationValues = {},
  options: FormatterOptions = {},
): string {
  const resolvedLocale =
    normalizeLocaleTag(locale) ?? options.fallback ?? fallbackLocale;
  const template = getMessageTemplate(resolvedLocale, key, options);

  if (template === null) {
    return options.missingMessage?.(key, resolvedLocale) ?? key;
  }

  return interpolateMessage(template, values);
}

export function getMessageTemplate(
  locale: string | null | undefined,
  key: MessageKey,
  options: FormatterOptions = {},
): string | null {
  const resolvedLocale =
    normalizeLocaleTag(locale) ?? options.fallback ?? fallbackLocale;
  const resolvedFallback = options.fallback ?? fallbackLocale;
  const catalogs = options.catalogs ?? messages;
  const localizedTemplate = readMessage(catalogs[resolvedLocale], key);

  if (localizedTemplate !== null) {
    return localizedTemplate;
  }

  if (resolvedLocale === resolvedFallback) {
    return null;
  }

  return readMessage(catalogs[resolvedFallback], key);
}

export function interpolateMessage(
  template: string,
  values: InterpolationValues = {},
): string {
  return template.replace(interpolationPattern, (placeholder, name: string) => {
    const value = values[name];

    if (value == null) {
      return placeholder;
    }

    return value instanceof Date ? value.toISOString() : String(value);
  });
}

function readMessage(
  catalog: MessageTree | undefined,
  key: MessageKey,
): string | null {
  if (catalog === undefined) {
    return null;
  }

  const value = key
    .split(".")
    .reduce<string | MessageTree | undefined>((current, segment) => {
      if (typeof current === "string" || current === undefined) {
        return undefined;
      }

      return current[segment];
    }, catalog);

  return typeof value === "string" ? value : null;
}
