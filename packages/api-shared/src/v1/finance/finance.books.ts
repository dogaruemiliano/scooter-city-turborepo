import type { FinanceAssociate, FinanceBook } from "./finance.schemas";

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

/** Membership rows are ownership history; selectors need one option per person. */
export function financeBookAssociates(
  book: Pick<FinanceBook, "members"> | undefined,
): FinanceAssociate[] {
  const associates = new Map<string, FinanceAssociate>();
  for (const member of book?.members ?? []) {
    if (member.associate) associates.set(member.associate.id, member.associate);
  }
  return [...associates.values()];
}
