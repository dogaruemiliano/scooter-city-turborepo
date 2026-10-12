import type { v1 } from "@repo/api-shared";
import { formatMessage, messages, type SupportedLocale } from "@repo/i18n";
import { ListPagination } from "@repo/ui/components";

import { localizePath } from "@/i18n/paths";
import {
  operationListHref,
  type OperationFilters,
} from "../_lib/operation-list-query";

interface OperationPaginationProps {
  operations: v1.finance.FinancialOperationList;
  locale: SupportedLocale;
  pathname: string;
  search: URLSearchParams;
  filters: OperationFilters;
  fixedKind?: v1.finance.FinancialOperationKind;
}

export function OperationPagination({
  operations,
  locale,
  pathname,
  search,
  filters,
  fixedKind,
}: OperationPaginationProps) {
  const { page, pageSize, total } = operations;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const t = messages[locale].finance.common;
  const href = (nextPage: number) =>
    localizePath(
      operationListHref(pathname, search, filters, nextPage, fixedKind),
      locale,
    );

  return (
    <ListPagination
      canPrevious={page > 1}
      canNext={page < pageCount}
      previousHref={href(Math.min(page - 1, pageCount))}
      nextHref={href(page + 1)}
      previousLabel={t.previous}
      nextLabel={t.next}
      label={formatMessage(locale, "finance.common.pageOf", {
        page,
        pageCount,
      })}
    />
  );
}
