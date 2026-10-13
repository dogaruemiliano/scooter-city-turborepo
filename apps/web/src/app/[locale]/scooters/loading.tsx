import { Card, CardContent, Skeleton } from "@repo/ui/components";
import { useTranslations } from "next-intl";

const LIST_SKELETONS = ["first", "second", "third"];

export default function ScootersLoading() {
  const t = useTranslations("scooters");

  return (
    <div
      aria-busy="true"
      aria-label={t("routeStates.loadingLabel")}
      className="mx-auto flex w-full max-w-screen-xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10"
    >
      <span className="sr-only">{t("routeStates.loadingLabel")}</span>

      <div className="flex justify-end">
        <Skeleton className="h-11 w-32" />
      </div>

      <section aria-hidden="true" className="flex flex-col gap-4">
        <div className="grid gap-3 lg:grid-cols-2">
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
        <div className="flex flex-col gap-4">
          {LIST_SKELETONS.map((key) => (
            <Card key={key} className="gap-0 py-0">
              <CardContent className="flex flex-col gap-4 p-4 sm:p-5">
                <div className="flex gap-4">
                  <Skeleton className="size-24 shrink-0 sm:h-32 sm:w-36" />
                  <div className="flex min-w-0 flex-1 flex-col gap-3 py-1">
                    <Skeleton className="h-6 w-32 max-w-full" />
                    <Skeleton className="h-4 w-full" />
                  </div>
                </div>
                <Skeleton className="h-4 w-64 max-w-full" />
                <div className="grid grid-cols-2 gap-3 border-t border-border pt-4">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
                <Skeleton className="h-11 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
