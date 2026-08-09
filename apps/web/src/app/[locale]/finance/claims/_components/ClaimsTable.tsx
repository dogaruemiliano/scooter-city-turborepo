import type { v1 } from "@repo/api-shared";
import type { SupportedLocale } from "@repo/i18n";
import {
  Button,
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
import { claimSettlementHref } from "../../_lib/links";

export async function ClaimsTable({
  locale,
  claims,
}: {
  locale: SupportedLocale;
  claims: v1.finance.OutstandingPersonalClaim[];
}) {
  const t = await getTranslations({ locale, namespace: "finance" });
  const ownersHref = localizePath("/finance/owners", locale);

  const viewOwnersLink = (
    <Link
      href={ownersHref}
      className={cn(
        buttonVariants({ variant: "outline", size: "sm" }),
        "w-fit",
      )}
    >
      {t("claims.viewOwners")}
      <ArrowRightIcon data-icon="inline-end" />
    </Link>
  );

  if (claims.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {viewOwnersLink}
        <FinanceEmptyState>{t("claims.list.empty")}</FinanceEmptyState>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {viewOwnersLink}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("claims.columns.debtor")}</TableHead>
              <TableHead>{t("claims.columns.creditor")}</TableHead>
              <TableHead className="text-right">
                {t("claims.columns.amount")}
              </TableHead>
              <TableHead>
                <span className="sr-only">{t("claims.columns.actions")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {claims.map((claim) => (
              <TableRow
                key={`${claim.debtorUserId}:${claim.creditorUserId}:${claim.currency}`}
              >
                <TableCell>
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {financeUserLabel(claim.debtor)}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {claim.debtor.email}
                    </p>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {financeUserLabel(claim.creditor)}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {claim.creditor.email}
                    </p>
                  </div>
                </TableCell>
                <TableCell className="text-right font-mono font-semibold tabular-nums">
                  {formatMoney(claim.amount, claim.currency, locale)}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    nativeButton={false}
                    render={<Link href={claimSettlementHref(claim, locale)} />}
                  >
                    {t("claims.settle")}
                    <ArrowRightIcon data-icon="inline-end" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
