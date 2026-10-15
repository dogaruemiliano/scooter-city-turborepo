import type { ReactNode } from "react";
import { v1 } from "@repo/api-shared";
import { Badge, HorizontalScrollArea, ListItems } from "@repo/ui/components";
import { useTranslations } from "next-intl";

const statusTone = {
  open: "bg-muted-foreground",
  in_progress: "bg-primary",
  resolved: "bg-success",
  cancelled: "bg-muted-foreground",
} as const;

/** A single accessible collection: mobile cards become status lanes on desktop. */
export function ProblemList({
  items,
  status,
  empty,
  renderItem,
}: {
  items: readonly v1.problems.Problem[];
  status: v1.problems.Problem["status"] | "";
  empty: ReactNode;
  renderItem: (problem: v1.problems.Problem) => ReactNode;
}) {
  const t = useTranslations("workspace.problems");
  if (!items.length) return empty;
  if (status)
    return (
      <ListItems
        items={items}
        getItemKey={(item) => item.id}
        renderItem={renderItem}
        className="lg:grid lg:grid-cols-2 xl:grid-cols-3 lg:items-start"
      />
    );

  return (
    <HorizontalScrollArea
      label={t("boardLabel")}
      scrollRightLabel={t("scrollRight")}
    >
      <div className="flex min-w-0 flex-col gap-4 lg:grid lg:grid-cols-[repeat(4,minmax(var(--spacing-72),1fr))] lg:items-start lg:gap-6">
        {v1.problems.problemStatusSchema.options.map((lane) => {
          const problems = items.filter((problem) => problem.status === lane);
          return (
            <section
              key={lane}
              aria-label={t(lane)}
              className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-4"
            >
              <h2 className="hidden items-center gap-2 px-1 text-sm font-semibold text-muted-foreground lg:flex">
                <span
                  aria-hidden="true"
                  className={`size-2 shrink-0 rounded-full ${statusTone[lane]}`}
                />
                {t(lane)}
                <Badge variant="secondary" className="ml-auto">
                  {problems.length}
                </Badge>
              </h2>
              {problems.length ? (
                <ListItems
                  items={problems}
                  getItemKey={(problem) => problem.id}
                  renderItem={renderItem}
                />
              ) : (
                <div className="hidden min-h-32 items-center justify-center rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground lg:flex">
                  {t("boardEmpty")}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </HorizontalScrollArea>
  );
}
