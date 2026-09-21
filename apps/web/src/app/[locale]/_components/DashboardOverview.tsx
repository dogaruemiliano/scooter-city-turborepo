import { messages, type SupportedLocale } from "@repo/i18n";
import { buttonVariants, Card, Skeleton } from "@repo/ui/components";
import { ArrowRightIcon } from "lucide-react";

import { Link } from "@/i18n/navigation";
import { formatMinorAmount } from "@/lib/finance-format";
import { OperationList } from "../finance/_components/OperationList";
import { FINANCE_PATHS } from "../finance/_lib/links";
import type { DashboardOverviewData } from "../_lib/dashboard-server";

const ACCOUNT_PREVIEW_COUNT = 4;

export async function DashboardOverview({
  data,
  locale,
}: {
  data: Promise<DashboardOverviewData>;
  locale: SupportedLocale;
}) {
  const { cash, fleet, operations } = await data;
  const t = messages[locale].dashboard;
  const number = new Intl.NumberFormat(locale);

  return (
    <>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="min-w-0 gap-0 p-0 shadow-none">
          <section
            aria-labelledby="dashboard-cash"
            className="flex h-full flex-col"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 p-6 pb-4">
              <h2 id="dashboard-cash" className="text-base font-semibold">
                {t.cash.title}
              </h2>
              <Link
                href={FINANCE_PATHS.accounts}
                className={buttonVariants({ variant: "link", size: "sm" })}
              >
                {t.cash.view}
                <ArrowRightIcon aria-hidden="true" data-icon="inline-end" />
              </Link>
            </div>
            {cash ? (
              <>
                <div className="mx-6 flex flex-wrap items-baseline justify-between gap-2 border-b pb-5">
                  <p className="text-sm text-muted-foreground">
                    {t.cash.available}
                  </p>
                  <p className="min-w-0 text-2xl font-semibold tracking-tight wrap-anywhere tabular-nums">
                    {formatMinorAmount(cash.totalMinor, cash.currency, locale)}
                  </p>
                </div>
                {cash.accounts.length > 0 ? (
                  <dl className="divide-y px-6">
                    {cash.accounts
                      .slice(0, ACCOUNT_PREVIEW_COUNT)
                      .map((account) => (
                        <div
                          key={account.accountId}
                          className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3"
                        >
                          <dt className="min-w-0 text-sm wrap-anywhere">
                            {account.name}
                          </dt>
                          <dd className="min-w-0 text-sm font-semibold wrap-anywhere tabular-nums">
                            {formatMinorAmount(
                              account.displayBalanceMinor,
                              cash.currency,
                              locale,
                            )}
                          </dd>
                        </div>
                      ))}
                  </dl>
                ) : (
                  <p className="p-6 text-sm text-muted-foreground">
                    {t.cash.empty}
                  </p>
                )}
                <p className="mt-auto px-6 pt-3 pb-6 text-xs leading-relaxed text-muted-foreground">
                  {t.cash.description}
                </p>
              </>
            ) : (
              <p className="px-6 pb-6 text-sm leading-relaxed text-muted-foreground">
                {t.unavailable}
              </p>
            )}
          </section>
        </Card>

        <Card className="min-w-0 gap-0 p-0 shadow-none">
          <section
            aria-labelledby="dashboard-fleet"
            className="flex h-full flex-col"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 p-6 pb-4">
              <h2 id="dashboard-fleet" className="text-base font-semibold">
                {t.fleet.title}
              </h2>
              <Link
                href="/scooters"
                className={buttonVariants({ variant: "link", size: "sm" })}
              >
                {t.fleet.view}
                <ArrowRightIcon aria-hidden="true" data-icon="inline-end" />
              </Link>
            </div>
            {fleet ? (
              <>
                <div className="mx-6 flex flex-wrap items-baseline justify-between gap-2 border-b pb-5">
                  <p className="text-sm text-muted-foreground">
                    {t.fleet.total}
                  </p>
                  <p className="min-w-0 text-2xl font-semibold tracking-tight wrap-anywhere tabular-nums">
                    {number.format(fleet.totalScooters)}
                  </p>
                </div>
                <div className="mt-auto flex flex-col items-start gap-4 p-6">
                  {fleet.totalScooters === 0 ? (
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {t.fleet.empty}
                    </p>
                  ) : null}
                  <Link
                    href="/scooters/new"
                    className={buttonVariants({
                      variant: "outline",
                      size: "sm",
                    })}
                  >
                    {t.fleet.add}
                  </Link>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-start gap-4 px-6 pb-6">
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {t.unavailable}
                </p>
                <Link
                  href="/scooters/new"
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  {t.fleet.add}
                </Link>
              </div>
            )}
          </section>
        </Card>
      </div>

      <section
        aria-labelledby="dashboard-activity"
        className="flex flex-col gap-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="dashboard-activity" className="text-base font-semibold">
            {t.activity.title}
          </h2>
          <Link
            href={FINANCE_PATHS.operations}
            className={buttonVariants({ variant: "link", size: "sm" })}
          >
            {t.activity.view}
            <ArrowRightIcon aria-hidden="true" data-icon="inline-end" />
          </Link>
        </div>
        {operations ? (
          <OperationList
            items={operations.items}
            currency={operations.currency}
            locale={locale}
            emptyLabel={t.activity.empty}
          />
        ) : (
          <Card className="p-6 shadow-none">
            <p className="text-sm leading-relaxed text-muted-foreground">
              {t.unavailable}
            </p>
          </Card>
        )}
      </section>
    </>
  );
}

export function DashboardOverviewSkeleton({
  locale,
}: {
  locale: SupportedLocale;
}) {
  return (
    <div
      role="status"
      aria-label={messages[locale].dashboard.loading}
      className="flex flex-col gap-6"
    >
      <span className="sr-only">{messages[locale].dashboard.loading}</span>
      <div aria-hidden="true" className="grid gap-6 xl:grid-cols-2">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
      <Skeleton aria-hidden="true" className="h-64 rounded-xl" />
    </div>
  );
}
