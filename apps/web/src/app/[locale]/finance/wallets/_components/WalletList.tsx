import { v1 } from "@repo/api-shared";
import type { SupportedLocale } from "@repo/i18n";
import {
  Badge,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components";
import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { localizePath } from "@/i18n/paths";
import { financeUserLabel, formatMoney } from "@/lib/finance-format";
import { FinanceEmptyState } from "../../_components/FinanceEmptyState";
import { FinancePagination } from "../../_components/FinancePagination";

export async function WalletList({
  locale,
  list,
  query,
}: {
  locale: SupportedLocale;
  list: v1.finance.WalletList;
  query: v1.finance.ListWalletsQuery;
}) {
  const t = await getTranslations({ locale, namespace: "finance" });
  const pageCount = Math.max(1, Math.ceil(list.total / list.pageSize));

  if (list.items.length === 0) {
    return <FinanceEmptyState>{t("wallets.list.empty")}</FinanceEmptyState>;
  }

  return (
    <section className="space-y-4">
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("wallets.list.columns.name")}</TableHead>
              <TableHead>{t("wallets.list.columns.type")}</TableHead>
              <TableHead>{t("wallets.list.columns.owner")}</TableHead>
              <TableHead>{t("wallets.list.columns.status")}</TableHead>
              <TableHead>{t("wallets.list.columns.balances")}</TableHead>
              <TableHead>
                <span className="sr-only">
                  {t("wallets.list.columns.actions")}
                </span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.items.map((wallet) => (
              <TableRow key={wallet.id}>
                <TableCell className="font-medium">{wallet.name}</TableCell>
                <TableCell>{t(`enums.walletTypes.${wallet.type}`)}</TableCell>
                <TableCell className="text-muted-foreground">
                  {wallet.owner
                    ? financeUserLabel(wallet.owner)
                    : t("common.noOwner")}
                </TableCell>
                <TableCell>
                  <Badge variant={wallet.isActive ? "secondary" : "outline"}>
                    {wallet.isActive
                      ? t("common.active")
                      : t("common.inactive")}
                  </Badge>
                </TableCell>
                <TableCell>
                  {wallet.balances.length === 0 ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <ul className="space-y-1">
                      {wallet.balances.map((balance) => (
                        <li
                          key={`${balance.bucket}:${balance.currency}`}
                          className="flex items-center justify-between gap-3"
                        >
                          <span className="text-xs text-muted-foreground">
                            {t(`enums.balanceBuckets.${balance.bucket}`)}
                          </span>
                          <span className="font-mono text-xs font-medium tabular-nums">
                            {formatMoney(
                              balance.balance,
                              balance.currency,
                              locale,
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    nativeButton={false}
                    render={
                      <Link
                        href={localizePath(
                          `/finance/wallets/${encodeURIComponent(wallet.id)}`,
                          locale,
                        )}
                        aria-label={t("wallets.list.view")}
                      />
                    }
                  >
                    <ArrowRightIcon />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {t("wallets.list.total", { total: list.total })}
        </p>
        <FinancePagination
          pageCount={pageCount}
          previousHref={
            list.page > 1
              ? walletPageHref(locale, query, list.page - 1)
              : undefined
          }
          nextHref={
            list.page < pageCount
              ? walletPageHref(locale, query, list.page + 1)
              : undefined
          }
          previousLabel={t("common.previous")}
          nextLabel={t("common.next")}
          pageLabel={t("common.pageOf", {
            page: list.page,
            pageCount,
          })}
        />
      </div>
    </section>
  );
}

function walletPageHref(
  locale: SupportedLocale,
  query: v1.finance.ListWalletsQuery,
  page: number,
): string {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(query.pageSize),
  });
  if (query.search) params.set("search", query.search);
  if (query.type) params.set("type", query.type);
  if (query.isActive !== undefined) {
    params.set("isActive", String(query.isActive));
  }
  if (query.ownerRole) params.set("ownerRole", query.ownerRole);
  if (query.ownerIsActive !== undefined) {
    params.set("ownerIsActive", String(query.ownerIsActive));
  }
  if (query.ownerUserId) params.set("ownerUserId", query.ownerUserId);

  return localizePath(`/finance/wallets?${params}`, locale);
}
