import type { v1 } from "@repo/api-shared";
import type { SupportedLocale } from "@repo/i18n";
import {
  Badge,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components";
import { cn } from "@repo/ui/lib/utils";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { formatFinanceDate, formatMinorAmount } from "@/lib/finance-format";
import { FINANCE_PATHS } from "../_lib/links";

export interface OperationListProps {
  items: readonly v1.finance.FinancialOperationListItem[];
  currency: string;
  locale: SupportedLocale;
  emptyLabel: string;
}

/**
 * A reversed operation stays in the list rather than disappearing. It is
 * struck through so it reads as history that was corrected, not as a record
 * that never existed.
 */
export async function OperationList({
  items,
  currency,
  locale,
  emptyLabel,
}: OperationListProps) {
  const t = await getTranslations("finance.operations");

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="flex min-h-36 items-center justify-center text-center">
          <p className="text-sm text-muted-foreground">{emptyLabel}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="gap-0 py-0 md:hidden">
        <ul>
          {items.map((item) => (
            <li key={item.id} className="border-b last:border-b-0">
              <Link
                href={FINANCE_PATHS.operation(item.id)}
                className="block min-h-16 p-5 outline-none transition-colors duration-fast ease-standard hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    {formatFinanceDate(item.occurredAt, locale)}
                  </p>
                  <Badge
                    variant={item.status === "POSTED" ? "outline" : "secondary"}
                  >
                    {t(`statuses.${item.status}`)}
                  </Badge>
                </div>

                <p className="mt-3 font-medium wrap-anywhere">
                  {item.description ?? t(`kinds.${item.kind}`)}
                </p>
                <p className="mt-1 text-xs leading-relaxed wrap-anywhere text-muted-foreground">
                  {[
                    t(`kinds.${item.kind}`),
                    item.categoryName,
                    item.costObjectName,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <p
                  className={cn(
                    "mt-3 text-base font-semibold wrap-anywhere tabular-nums",
                    item.status === "REVERSED" &&
                      "text-muted-foreground line-through",
                  )}
                >
                  {formatMinorAmount(item.amountMinor, currency, locale)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="hidden py-0 md:flex">
        <Table className="min-w-(--breakpoint-sm)">
          <TableHeader>
            <TableRow>
              <TableHead scope="col" className="px-5 py-3">
                {t("columns.date")}
              </TableHead>
              <TableHead scope="col" className="px-5 py-3">
                {t("columns.description")}
              </TableHead>
              <TableHead scope="col" className="px-5 py-3">
                {t("columns.category")}
              </TableHead>
              <TableHead scope="col" className="px-5 py-3 text-right">
                {t("columns.amount")}
              </TableHead>
              <TableHead scope="col" className="px-5 py-3">
                {t("columns.status")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="px-5 py-4">
                  <span className="text-muted-foreground">
                    {formatFinanceDate(item.occurredAt, locale)}
                  </span>
                </TableCell>
                <TableCell className="px-5 py-4 whitespace-normal">
                  <Link
                    href={FINANCE_PATHS.operation(item.id)}
                    className="rounded-sm font-medium wrap-anywhere underline-offset-4 outline-none hover:text-link hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {item.description ?? t(`kinds.${item.kind}`)}
                  </Link>
                  <span className="mt-1 block text-xs leading-relaxed wrap-anywhere text-muted-foreground">
                    {t(`kinds.${item.kind}`)}
                    {item.costObjectName ? ` · ${item.costObjectName}` : ""}
                  </span>
                </TableCell>
                <TableCell className="px-5 py-4 whitespace-normal">
                  <span className="wrap-anywhere text-muted-foreground">
                    {item.categoryName ?? "—"}
                  </span>
                </TableCell>
                <TableCell className="px-5 py-4 text-right">
                  <span
                    className={cn(
                      "font-semibold tabular-nums",
                      item.status === "REVERSED" &&
                        "text-muted-foreground line-through",
                    )}
                  >
                    {formatMinorAmount(item.amountMinor, currency, locale)}
                  </span>
                </TableCell>
                <TableCell className="px-5 py-4">
                  <Badge
                    variant={item.status === "POSTED" ? "outline" : "secondary"}
                  >
                    {t(`statuses.${item.status}`)}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
