import { Card, CardContent, CardFooter, Skeleton } from "@repo/ui/components";
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
              <CardContent className="flex flex-col gap-5 p-5 sm:gap-6 sm:p-6">
                <div className="flex items-center gap-4 sm:gap-5">
                  <div className="flex min-w-0 flex-1 flex-col gap-3 py-1">
                    <Skeleton className="h-8 w-32 max-w-full" />
                    <Skeleton className="h-4 w-36 max-w-full" />
                    <Skeleton className="h-4 w-full" />
                  </div>
                  <div className="relative h-36 w-32 shrink-0 sm:h-48 sm:w-48">
                    <Skeleton className="absolute -inset-y-5 -right-5 w-64 rounded-xl sm:-inset-y-6 sm:-right-6 sm:w-72" />
                  </div>
                </div>
                <Skeleton className="h-4 w-64 max-w-full" />
                <div className="grid grid-cols-2 gap-4 border-t border-border pt-5 sm:gap-6 sm:pt-6">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              </CardContent>
              <CardFooter className="justify-between gap-4 bg-muted px-5 py-4 sm:px-6">
                <Skeleton className="h-11 w-36 max-w-full" />
                <Skeleton className="size-12 shrink-0 md:size-11" />
              </CardFooter>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
