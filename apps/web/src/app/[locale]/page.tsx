import type { Metadata } from "next";
import { messages } from "@repo/i18n";
import { ChartNoAxesCombinedIcon, LoaderCircleIcon } from "lucide-react";

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
    <main className="flex flex-1 items-center justify-center px-6 py-12">
      <div className="flex max-w-lg flex-col items-center gap-6 text-center">
        <div className="relative flex size-24 items-center justify-center text-primary">
          <LoaderCircleIcon
            aria-hidden="true"
            className="absolute inset-0 size-full animate-spin stroke-1 duration-slower ease-linear motion-reduce:animate-none"
          />
          <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/10">
            <ChartNoAxesCombinedIcon aria-hidden="true" className="size-7" />
          </span>
        </div>

        <div className="flex flex-col items-center gap-2">
          <h1 className="text-balance text-2xl font-semibold tracking-tight">
            {messages[locale].dashboard.title}
          </h1>
          <p className="max-w-md text-pretty text-sm leading-relaxed text-muted-foreground">
            {messages[locale].dashboard.description}
          </p>
        </div>

        <div className="flex items-end gap-1.5" aria-hidden="true">
          <span className="h-2 w-2 animate-pulse rounded-full bg-primary/40 duration-slower motion-reduce:animate-none" />
          <span className="h-2 w-2 animate-pulse rounded-full bg-primary/70 duration-slow motion-reduce:animate-none" />
          <span className="h-2 w-2 animate-pulse rounded-full bg-primary duration-normal motion-reduce:animate-none" />
        </div>
      </div>
    </main>
  );
}
