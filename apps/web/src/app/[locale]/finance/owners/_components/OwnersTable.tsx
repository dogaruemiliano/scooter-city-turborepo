import type { v1 } from "@repo/api-shared";
import type { SupportedLocale } from "@repo/i18n";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  buttonVariants,
} from "@repo/ui/components";
import { cn } from "@repo/ui/lib/utils";
import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { localizePath } from "@/i18n/paths";
import { financeUserLabel, formatMoney } from "@/lib/finance-format";
import { FinanceEmptyState } from "../../_components/FinanceEmptyState";

export async function OwnersTable({
  locale,
  balances,
}: {
  locale: SupportedLocale;
  balances: v1.finance.OwnerBalance[];
}) {
  const t = await getTranslations({ locale, namespace: "finance" });
  const claimsHref = localizePath("/finance/claims", locale);

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={claimsHref}
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "w-fit",
        )}
      >
        {t("owners.viewClaims")}
        <ArrowRightIcon data-icon="inline-end" />
      </Link>
      {balances.length === 0 ? (
        <FinanceEmptyState>{t("owners.list.empty")}</FinanceEmptyState>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("owners.columns.owner")}</TableHead>
                <TableHead>{t("owners.columns.currency")}</TableHead>
                <TableHead className="text-right">
                  {t("owners.columns.amount")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {balances.map((balance) => (
                <TableRow key={`${balance.userId}:${balance.currency}`}>
                  <TableCell>
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {financeUserLabel(balance.user)}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {balance.user.email}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>{balance.currency}</TableCell>
                  <TableCell className="text-right font-mono font-semibold tabular-nums">
                    {formatMoney(balance.amount, balance.currency, locale)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
