import { canAccess } from "@/lib/access";
import type { Metadata } from "next";
import { messages } from "@repo/i18n";
import { buttonVariants, Card } from "@repo/ui/components";
import { ArrowRightIcon, PlusIcon } from "lucide-react";
import { Suspense } from "react";

import { Link } from "@/i18n/navigation";
import { resolveRouteLocale } from "@/i18n/paths";
import {
  DashboardOverview,
  DashboardOverviewSkeleton,
} from "./_components/DashboardOverview";
import { loadDashboard } from "./_lib/dashboard-server";
import { FINANCE_PATHS } from "./finance/_lib/links";

interface DashboardPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: DashboardPageProps): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = resolveRouteLocale(rawLocale);

  return {
    title: messages[locale].appShell.pages.dashboard,
  };
}

export default async function DashboardPage({ params }: DashboardPageProps) {
  const { locale: rawLocale } = await params;
  const locale = resolveRouteLocale(rawLocale);
  const { user, overview } = await loadDashboard(locale);
  const t = messages[locale].dashboard;

  if (!overview) {
    return (
      <div className="flex min-w-0 flex-col gap-8 px-4 pt-4 md:px-8 md:pt-8">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {t.account.title}
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {t.account.description}
          </p>
        </header>

        <Card className="max-w-(--breakpoint-sm) gap-5 p-6 shadow-none">
          <h2 className="text-base font-semibold">{t.account.heading}</h2>
          <div className="flex flex-col gap-1">
            <p className="text-sm text-muted-foreground">
              {t.account.signedInAs}
            </p>
            <p className="break-all text-base">{user.email}</p>
          </div>
          <Link
            href="/account/settings"
            className={buttonVariants({ className: "self-start" })}
          >
            {t.account.settings}
            <ArrowRightIcon aria-hidden="true" data-icon="inline-end" />
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-8 px-4 pt-4 md:px-8 md:pt-8">
      {canAccess(user, "finance.expenses.create") ? (
        <div className="flex justify-end">
          <Link href={FINANCE_PATHS.newExpense} className={buttonVariants()}>
            <PlusIcon aria-hidden="true" data-icon="inline-start" />
            {t.newExpense}
          </Link>
        </div>
      ) : null}

      <nav
        aria-label={t.shortcuts}
        className="flex flex-wrap items-center gap-2"
      >
        {canAccess(user, "finance.funding.create") ? (
          <Link
            href={FINANCE_PATHS.newFunding}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            {t.links.funding}
          </Link>
        ) : null}
        {canAccess(user, "scooters.read", "ALL") ? (
          <Link
            href="/scooters"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            {t.links.scooters}
          </Link>
        ) : null}
        {canAccess(user, "persons.read") ? (
          <Link
            href="/persons"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            {t.links.people}
          </Link>
        ) : null}
        {canAccess(user, "problems.read") ? (
          <Link
            href="/problems"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            {messages[locale].appShell.nav.problems}
          </Link>
        ) : null}
        {canAccess(user, "portal.rentals.read") ? (
          <Link
            href="/my-rentals"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            {messages[locale].appShell.nav.myRentals}
          </Link>
        ) : null}
        {canAccess(user, "rentals.read") ? (
          <Link
            href="/rentals"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            {messages[locale].appShell.nav.rentals}
          </Link>
        ) : null}
        {user.isSuperAdmin ? (
          <Link
            href="/users"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            {messages[locale].appShell.nav.users}
          </Link>
        ) : null}
      </nav>

      {canAccess(user, "finance.accounts.read") ||
      canAccess(user, "finance.operations.read") ||
      canAccess(user, "scooters.read", "ALL") ? (
        <Suspense fallback={<DashboardOverviewSkeleton locale={locale} />}>
          <DashboardOverview data={overview} locale={locale} />
        </Suspense>
      ) : null}
    </div>
  );
}
