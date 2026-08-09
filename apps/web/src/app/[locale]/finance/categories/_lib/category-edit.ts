import type { v1 } from "@repo/api-shared";

export function activeCategoryParentOptions(
  categories: v1.finance.FinancialCategory[],
  categoryId: string,
): v1.finance.FinancialCategory[] {
  return categories.filter(
    (category) => category.isActive && category.id !== categoryId,
  );
}
