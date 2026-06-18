import {
  defaultRouteLocale,
  isSupportedLocale,
  type SupportedLocale,
} from "@repo/i18n";

const LOCAL_ORIGIN = "http://local.invalid";
const PUBLIC_PATHS = ["/sign-in"] as const;

export interface LocalePathInfo {
  readonly locale: SupportedLocale;
  readonly pathname: string;
  readonly unprefixedPathname: string;
}

export function safeLocalPath(
  value: string | null | undefined,
  fallback = "/",
): string {
  const safeFallback =
    fallback.startsWith("/") && !fallback.startsWith("//") ? fallback : "/";

  if (!value?.startsWith("/")) return safeFallback;

  try {
    const url = new URL(value, LOCAL_ORIGIN);
    if (url.origin !== LOCAL_ORIGIN) return safeFallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return safeFallback;
  }
}

export function safeNextPath(
  value: string | null | undefined,
  fallback = "/",
): string {
  return safeLocalPath(value, safeLocalPath(fallback));
}

export function getLocalePathInfo(pathname: string): LocalePathInfo {
  const normalizedPathname = normalizePathname(pathname);
  const [firstSegment = "", ...restSegments] = normalizedPathname
    .slice(1)
    .split("/");
  const decodedSegment = decodePathSegment(firstSegment);
  const locale = isSupportedLocale(decodedSegment)
    ? decodedSegment
    : defaultRouteLocale;
  const unprefixedPathname =
    isSupportedLocale(decodedSegment) && restSegments.length > 0
      ? `/${restSegments.join("/")}`
      : isSupportedLocale(decodedSegment)
        ? "/"
        : normalizedPathname;

  return {
    locale,
    pathname: normalizedPathname,
    unprefixedPathname,
  };
}

export function getLocaleFromPathname(pathname: string): SupportedLocale {
  return getLocalePathInfo(pathname).locale;
}

export function resolveRouteLocale(
  locale: string | null | undefined,
): SupportedLocale {
  return isSupportedLocale(locale) ? locale : defaultRouteLocale;
}

export function getUnprefixedPathname(pathname: string): string {
  return getLocalePathInfo(pathname).unprefixedPathname;
}

export function localizePath(
  path: string,
  locale: SupportedLocale,
): string {
  const safePath = safeLocalPath(path);
  const url = new URL(safePath, LOCAL_ORIGIN);
  const unprefixedPathname = getUnprefixedPathname(url.pathname);
  const localizedPathname =
    locale === defaultRouteLocale
      ? unprefixedPathname
      : prefixPathname(unprefixedPathname, locale);

  return `${localizedPathname}${url.search}${url.hash}`;
}

export function getLocalizedSignInPath(
  locale: SupportedLocale,
  next?: string | null,
): string {
  const signInPath = localizePath("/sign-in", locale);

  if (next == null) {
    return signInPath;
  }

  const url = new URL(signInPath, LOCAL_ORIGIN);
  url.searchParams.set("next", safeNextPath(next));
  return `${url.pathname}${url.search}${url.hash}`;
}

export function isPublicPathname(pathname: string): boolean {
  const unprefixedPathname = getUnprefixedPathname(pathname);

  return PUBLIC_PATHS.some(
    (publicPath) =>
      unprefixedPathname === publicPath ||
      unprefixedPathname.startsWith(`${publicPath}/`),
  );
}

export function isSignInPathname(pathname: string): boolean {
  return getUnprefixedPathname(pathname) === "/sign-in";
}

function normalizePathname(pathname: string): string {
  if (pathname.length === 0) {
    return "/";
  }

  return pathname.startsWith("/") ? pathname : `/${pathname}`;
}

function decodePathSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function prefixPathname(pathname: string, locale: SupportedLocale): string {
  return pathname === "/" ? `/${locale}` : `/${locale}${pathname}`;
}
