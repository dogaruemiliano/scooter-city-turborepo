import type { v1 } from "@repo/api-shared";
import type { SupportedLocale } from "@repo/i18n";
import { Card } from "@repo/ui/components";
import { getTranslations } from "next-intl/server";

import { formatMinorAmount } from "@/lib/finance-format";

export interface AccountBalanceTableProps {
  balances: readonly v1.finance.LedgerAccountBalance[];
  currency: string;
  locale: SupportedLocale;
}

/**
 * Balances grouped by accounting category.
 *
 * The figure shown is `displayBalanceMinor`, not the raw signed balance: a
 * liability grows as a credit, so "Company owes Iusti 200" would otherwise
 * read as −200 and invite exactly the wrong conclusion.
 */
export async function AccountBalanceTable({
  balances,
  currency,
  locale,
}: AccountBalanceTableProps) {
  const t = await getTranslations("finance.accounts");

  const categories = [
    "ASSET",
    "LIABILITY",
    "REVENUE",
    "EXPENSE",
    "EQUITY",
  ] as const;

  const grouped = categories
    .map((category) => ({
      category,
      rows: balances.filter((balance) => balance.category === category),
    }))
    .filter((group) => group.rows.length > 0);

  if (grouped.length === 0) {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {grouped.map((group) => (
        <section key={group.category} className="flex flex-col gap-2">
          <h2 className="text-base font-medium">
            {t(`categories.${group.category}`)}
          </h2>

          <Card className="overflow-x-auto">
            <table className="w-full min-w-xl text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th scope="col" className="p-3 font-normal">
                    {t("columns.account")}
                  </th>
                  <th scope="col" className="p-3 font-normal">
                    {t("columns.role")}
                  </th>
                  <th scope="col" className="p-3 text-right font-normal">
                    {t("columns.balance")}
                  </th>
                  <th scope="col" className="p-3 text-right font-normal">
                    {t("columns.postings")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {group.rows.map((balance) => (
                  <tr
                    key={balance.accountId}
                    className="border-b last:border-b-0"
                  >
                    <td className="p-3">{balance.name}</td>
                    <td className="p-3 text-muted-foreground">
                      {t(`roles.${balance.role}`)}
                    </td>
                    <td className="p-3 text-right font-medium tabular-nums">
                      {formatMinorAmount(
                        balance.displayBalanceMinor,
                        currency,
                        locale,
                      )}
                    </td>
                    <td className="p-3 text-right tabular-nums text-muted-foreground">
                      {balance.postingCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </section>
      ))}
    </div>
  );
}
