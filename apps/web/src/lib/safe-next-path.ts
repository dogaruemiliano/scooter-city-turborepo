const LOCAL_ORIGIN = "http://local.invalid";

export function safeNextPath(
  value: string | null | undefined,
  fallback = "/",
): string {
  if (!value?.startsWith("/")) return fallback;

  try {
    const url = new URL(value, LOCAL_ORIGIN);
    if (url.origin !== LOCAL_ORIGIN) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
