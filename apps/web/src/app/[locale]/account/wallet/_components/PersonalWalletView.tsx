import type { v1 } from "@repo/api-shared";
import { messages, type SupportedLocale } from "@repo/i18n";
import {
  Badge,
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

import {
  formatFinanceDateTime,
  formatMoney,
} from "../../../../../lib/finance-format";

export function PersonalWalletView({
  locale,
  wallet,
}: {
  locale: SupportedLocale;
  wallet: v1.finance.Wallet;
}) {
  const t = messages[locale].finance;

  return (
    <main className="mx-auto flex w-full max-w-screen-xl flex-1 flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t.personalWallet.title}
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          {t.personalWallet.description}
        </p>
      </header>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <CardTitle>{wallet.name}</CardTitle>
              <CardDescription>{t.walletTypes[wallet.type]}</CardDescription>
            </div>
            <Badge variant={wallet.isActive ? "secondary" : "outline"}>
              {wallet.isActive
                ? t.personalWallet.active
                : t.personalWallet.inactive}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {wallet.balances.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              {t.personalWallet.noBalances}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.wallets.fields.bucket}</TableHead>
                  <TableHead>{t.wallets.fields.currency}</TableHead>
                  <TableHead className="text-right">
                    {t.wallets.fields.balance}
                  </TableHead>
                  <TableHead>{t.personalWallet.balanceUpdated}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {wallet.balances.map((balance) => (
                  <TableRow key={`${balance.bucket}:${balance.currency}`}>
                    <TableCell>{t.balanceBuckets[balance.bucket]}</TableCell>
                    <TableCell>{balance.currency}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatMoney(balance.balance, balance.currency, locale)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatFinanceDateTime(balance.updatedAt, locale)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
