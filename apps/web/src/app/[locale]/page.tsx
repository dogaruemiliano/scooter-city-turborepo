import type { Metadata } from "next";
import { messages } from "@repo/i18n";

import { resolveRouteLocale } from "../../i18n/paths";

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

  return (
    <div className="flex flex-1 items-center justify-center">
      <p className="text-sm text-muted-foreground">
        {messages[locale].dashboard.placeholder}
      </p>
    </div>
  );
}
