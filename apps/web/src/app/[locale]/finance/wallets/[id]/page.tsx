import { v1 } from "@repo/api-shared";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components";
import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { localizePath, resolveRouteLocale } from "@/i18n/paths";
import { webApi } from "@/lib/api";
import {
  financeUserLabel,
  formatFinanceDateTime,
  formatMoney,
} from "@/lib/finance-format";
import { FinanceEmptyState } from "../../_components/FinanceEmptyState";
import { FinancePageHeader } from "../../_components/FinancePageHeader";
import {
  financeCookieHeader,
  handleFinanceApiErrors,
  requireFinanceAdmin,
} from "../../_lib/server";

interface WalletDetailPageProps {
  params: Promise<{ locale: string; id: string }>;
}

export default async function WalletDetailPage({
  params,
}: WalletDetailPageProps) {
  const { locale: rawLocale, id } = await params;
  const locale = resolveRouteLocale(rawLocale);
  const returnPath = `/finance/wallets/${encodeURIComponent(id)}`;
  await requireFinanceAdmin(locale, returnPath);
  const cookieHeader = await financeCookieHeader();
  const wallet = await handleFinanceApiErrors(
    locale,
    returnPath,
    () =>
      webApi.fetch(v1.finance.ROUTES.wallets.get(id), v1.finance.walletSchema, {
        headers: { cookie: cookieHeader },
        cache: "no-store",
      }),
    { notFoundOn404: true },
  );
  const t = await getTranslations({ locale, namespace: "finance" });

  return (
    <main className="mx-auto flex w-full max-w-screen-lg flex-1 flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
      <Button
        variant="ghost"
        className="w-fit"
        nativeButton={false}
        render={<Link href={localizePath("/finance/wallets", locale)} />}
      >
        <ArrowLeftIcon data-icon="inline-start" />
        {t("wallets.detail.back")}
      </Button>

      <FinancePageHeader
        title={wallet.name}
        description={t("wallets.detail.description")}
        action={
          <Badge variant={wallet.isActive ? "secondary" : "outline"}>
            {wallet.isActive ? t("common.active") : t("common.inactive")}
          </Badge>
        }
      />

      <section className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("wallets.detail.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4">
              <DetailRow
                label={t("wallets.create.type")}
                value={t(`enums.walletTypes.${wallet.type}`)}
              />
              <DetailRow
                label={t("wallets.detail.owner")}
                value={
                  wallet.owner
                    ? financeUserLabel(wallet.owner)
                    : t("common.noOwner")
                }
              />
              <DetailRow
                label={t("wallets.detail.createdAt")}
                value={formatFinanceDateTime(wallet.createdAt, locale)}
              />
              <DetailRow
                label={t("wallets.detail.updatedAt")}
                value={formatFinanceDateTime(wallet.updatedAt, locale)}
              />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("wallets.detail.balances")}</CardTitle>
            <CardDescription>
              {t("wallets.detail.balancesDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {wallet.balances.length === 0 ? (
              <FinanceEmptyState>
                {t("wallets.detail.noBalances")}
              </FinanceEmptyState>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("wallets.detail.bucket")}</TableHead>
                    <TableHead className="text-right">
                      {t("wallets.detail.balance")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {wallet.balances.map((balance) => (
                    <TableRow key={`${balance.bucket}:${balance.currency}`}>
                      <TableCell>
                        {t(`enums.balanceBuckets.${balance.bucket}`)}
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium tabular-nums">
                        {formatMoney(balance.balance, balance.currency, locale)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="text-sm font-medium">{value}</dd>
    </div>
  );
}
