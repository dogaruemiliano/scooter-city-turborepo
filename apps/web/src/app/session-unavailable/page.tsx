import { messages } from "@repo/i18n";
import { PageLayout } from "@repo/ui/components/page-layout";
import { CloudOff, ShieldCheck } from "lucide-react";
import { resolveRouteLocale } from "../../i18n/paths";
import { RetryConnection } from "./_components/retry-connection";

export default async function SessionUnavailablePage({
  searchParams,
}: {
  searchParams: Promise<{ locale?: string }>;
}) {
  const locale = resolveRouteLocale((await searchParams).locale);
  const copy = messages[locale].auth.sessionUnavailable;

  return (
    <PageLayout
      width="form"
      paddingTop="none"
      className="min-h-dvh justify-center py-12"
      lang={locale}
    >
      <div className="mx-auto flex w-full max-w-md flex-col gap-8">
        <div className="text-base font-semibold">ScooterCity</div>
        <section
          aria-labelledby="recovery-title"
          className="flex flex-col gap-6 rounded-2xl bg-card p-6 text-card-foreground sm:p-8"
        >
          <div className="flex size-16 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <CloudOff className="size-8" aria-hidden="true" />
          </div>
          <div className="space-y-3">
            <h1
              id="recovery-title"
              className="text-2xl font-semibold leading-tight text-balance"
            >
              {copy.title}
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {copy.description}
            </p>
          </div>
          <RetryConnection label={copy.retry} pendingLabel={copy.retrying} />
          <div className="flex items-start gap-3 border-t border-border pt-6">
            <ShieldCheck
              className="mt-0.5 size-5 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <div className="space-y-1">
              <p className="text-sm font-medium">{copy.preserved}</p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {copy.reassurance}
              </p>
            </div>
          </div>
        </section>
      </div>
    </PageLayout>
  );
}
