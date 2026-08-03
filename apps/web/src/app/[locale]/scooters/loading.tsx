import { Card, CardHeader, Skeleton } from "@repo/ui/components";
import { useTranslations } from "next-intl";

const LIST_SKELETONS = ["first", "second", "third"];

export default function ScootersLoading() {
  const t = useTranslations("scooters");

  return (
    <div
      aria-busy="true"
      aria-label={t("routeStates.loadingLabel")}
      className="mx-auto flex w-full max-w-screen-xl flex-1 flex-col gap-6 px-6 py-10"
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
        <div className="flex flex-col gap-3">
          {LIST_SKELETONS.map((key) => (
            <Card key={key} size="sm">
              <CardHeader className="gap-3">
                <Skeleton className="h-5 w-48 max-w-full" />
                <Skeleton className="h-4 w-full" />
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
