import type { ReactNode } from "react";
import type { v1 } from "@repo/api-shared";
import { Badge, Button } from "@repo/ui/components";
import { useTranslations } from "next-intl";

export function ProblemListItem({
  problem,
  expanded,
  onToggle,
  children,
}: {
  problem: v1.problems.Problem;
  expanded: boolean;
  onToggle: () => void;
  children?: ReactNode;
}) {
  const t = useTranslations("workspace.problems");
  return (
    <article className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          variant="link"
          className="justify-start"
          aria-expanded={expanded}
          onClick={onToggle}
        >
          {problem.scooter.brandName} {problem.scooter.model} ·{" "}
          {problem.scooter.fleetNumber}
        </Button>
        <div className="flex flex-wrap gap-2">
          {problem.assigneeNeedsReassignment ? (
            <Badge variant="destructive">{t("reassignRequired")}</Badge>
          ) : null}
          <Badge variant="secondary">{t(problem.status)}</Badge>
          <Badge variant="outline">{t(problem.priority)}</Badge>
        </div>
      </div>
      <p className="whitespace-pre-wrap text-sm">{problem.description}</p>
      {children}
    </article>
  );
}
