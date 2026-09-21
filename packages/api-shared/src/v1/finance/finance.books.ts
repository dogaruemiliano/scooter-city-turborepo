import type { FinanceBook } from "./finance.schemas";

/** Book names always fall back to Romanian, independently of UI-copy fallback. */
export function financeBookName(
  book: Pick<FinanceBook, "names">,
  locale: string,
): string {
  const language = locale
    .trim()
    .toLowerCase()
    .replaceAll("_", "-")
    .split("-")[0];
  return (
    (language === "en" ? book.names.en?.trim() : undefined) || book.names.ro
  );
}
