import type { v1 } from "@repo/api-shared";
import type { SupportedLocale } from "@repo/i18n";
import { Badge, Card } from "@repo/ui/components";
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
      <Card className="p-6">
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      </Card>
    );
  }

  return (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-2xl text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th scope="col" className="p-3 font-normal">
              {t("columns.date")}
            </th>
            <th scope="col" className="p-3 font-normal">
              {t("columns.description")}
            </th>
            <th scope="col" className="p-3 font-normal">
              {t("columns.category")}
            </th>
            <th scope="col" className="p-3 text-right font-normal">
              {t("columns.amount")}
            </th>
            <th scope="col" className="p-3 font-normal">
              {t("columns.status")}
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b last:border-b-0">
              <td className="p-3 whitespace-nowrap">
                {formatFinanceDate(item.occurredAt, locale)}
              </td>
              <td className="p-3">
                <Link
                  href={FINANCE_PATHS.operation(item.id)}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {item.description ?? t(`kinds.${item.kind}`)}
                </Link>
                <span className="block text-xs text-muted-foreground">
                  {t(`kinds.${item.kind}`)}
                  {item.costObjectName ? ` · ${item.costObjectName}` : ""}
                </span>
              </td>
              <td className="p-3">{item.categoryName ?? "—"}</td>
              <td
                className={`p-3 text-right tabular-nums ${
                  item.status === "REVERSED" ? "line-through" : ""
                }`}
              >
                {formatMinorAmount(item.amountMinor, currency, locale)}
              </td>
              <td className="p-3">
                <Badge
                  variant={item.status === "POSTED" ? "outline" : "secondary"}
                >
                  {t(`statuses.${item.status}`)}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
