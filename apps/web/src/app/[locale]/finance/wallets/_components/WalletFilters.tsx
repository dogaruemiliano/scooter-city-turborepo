import { v1 } from "@repo/api-shared";
import type { SupportedLocale } from "@repo/i18n";
import { Button, Input, Label } from "@repo/ui/components";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { localizePath } from "@/i18n/paths";

export async function WalletFilters({
  locale,
  query,
}: {
  locale: SupportedLocale;
  query: v1.finance.ListWalletsQuery;
}) {
  const t = await getTranslations({ locale, namespace: "finance" });

  return (
    <form
      method="get"
      className="grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_auto]"
    >
      <div className="grid gap-2">
        <Label htmlFor="wallet-search">{t("wallets.filters.search")}</Label>
        <Input
          id="wallet-search"
          name="search"
          defaultValue={query.search}
          type="search"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="wallet-type">{t("wallets.filters.type")}</Label>
        <select
          id="wallet-type"
          name="type"
          defaultValue={query.type ?? ""}
          className="h-8 w-full min-w-0 rounded-lg border border-input bg-background px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">{t("common.all")}</option>
          {v1.finance.WALLET_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(`enums.walletTypes.${type}`)}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="wallet-status">{t("wallets.filters.status")}</Label>
        <select
          id="wallet-status"
          name="isActive"
          defaultValue={
            query.isActive === undefined ? "" : String(query.isActive)
          }
          className="h-8 w-full min-w-0 rounded-lg border border-input bg-background px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">{t("common.all")}</option>
          <option value="true">{t("common.active")}</option>
          <option value="false">{t("common.inactive")}</option>
        </select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="wallet-owner-role">
          {t("wallets.filters.ownerRole")}
        </Label>
        <select
          id="wallet-owner-role"
          name="ownerRole"
          defaultValue={query.ownerRole ?? ""}
          className="h-8 w-full min-w-0 rounded-lg border border-input bg-background px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">{t("common.all")}</option>
          <option value="ADMIN">{t("wallets.filters.allAdmins")}</option>
        </select>
      </div>
      <div className="flex items-end gap-2 md:col-span-2 xl:col-span-1">
        <Button type="submit">{t("common.apply")}</Button>
        <Button
          variant="ghost"
          nativeButton={false}
          render={<Link href={localizePath("/finance/wallets", locale)} />}
        >
          {t("common.reset")}
        </Button>
      </div>
    </form>
  );
}
