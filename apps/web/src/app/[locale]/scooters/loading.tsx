import { PageLayout } from "@repo/ui/components/page-layout";
import { ListLayout, Skeleton } from "@repo/ui/components";
import { useTranslations } from "next-intl";

import { ScooterCardSkeleton } from "./_components/ScooterCardSkeleton";

const LIST_SKELETONS = ["first", "second", "third"];

export default function ScootersLoading() {
  const t = useTranslations("scooters");

  return (
    <PageLayout aria-busy="true" aria-label={t("routeStates.loadingLabel")}>
      <span className="sr-only">{t("routeStates.loadingLabel")}</span>

      <ListLayout
        aria-hidden="true"
        filters={<Skeleton className="h-12 w-24 bg-border md:h-11" />}
        action={<Skeleton className="h-12 w-36 bg-border md:h-11" />}
        search={<Skeleton className="h-12 w-full bg-border md:h-11" />}
      >
        <div className="flex flex-col gap-4">
          {LIST_SKELETONS.map((key) => (
            <ScooterCardSkeleton key={key} />
          ))}
        </div>
      </ListLayout>
    </PageLayout>
  );
}
