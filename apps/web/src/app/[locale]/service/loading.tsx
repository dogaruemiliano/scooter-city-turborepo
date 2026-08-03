import { Card, CardContent, CardHeader, Skeleton } from "@repo/ui/components";
import { useTranslations } from "next-intl";

const STAT_SKELETONS = ["total", "issues", "blocking", "overdue", "due"];

export default function ServiceLoading() {
  const t = useTranslations("service");

  return (
    <div
      aria-busy="true"
      aria-label={t("routeStates.loadingLabel")}
      className="mx-auto flex w-full max-w-screen-xl flex-1 flex-col gap-6 px-6 py-10"
    >
      <span className="sr-only">{t("routeStates.loadingLabel")}</span>
      <section aria-hidden="true" className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {STAT_SKELETONS.map((key) => (
            <Card key={key} size="sm">
              <CardHeader>
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-5 w-12" />
              </CardHeader>
            </Card>
          ))}
        </div>
        <div className="grid items-start gap-6 lg:grid-cols-2">
          {["issues", "schedule"].map((key) => (
            <Card key={key} size="sm">
              <CardHeader>
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-80 max-w-full" />
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
