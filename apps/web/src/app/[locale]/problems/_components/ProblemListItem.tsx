import Link from "next/link";
import { v1 } from "@repo/api-shared";
import {
  UserAvatar,
  Badge,
  Button,
  Card,
  CardAccent,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@repo/ui/components";
import { Clock, Paperclip } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { memberName } from "./ProblemForms";

const severityAccent = {
  low: "bg-severity-low",
  moderate: "bg-severity-medium",
  high: "bg-severity-high",
  critical: "bg-severity-critical",
} as const;
const severityText = {
  low: "dark:text-severity-low",
  moderate: "dark:text-severity-medium",
  high: "dark:text-severity-high",
  critical: "dark:text-severity-critical",
} as const;

export function ProblemListItem({
  problem,
  expanded,
  onToggle,
  href,
}: {
  problem: v1.problems.Problem;
  expanded?: boolean;
  onToggle?: () => void;
  href?: string;
}) {
  const t = useTranslations("workspace.problems");
  const format = useFormatter();
  const assignee = v1.problems
    .problemAssignees(problem)
    .map(memberName)
    .join(", ");
  const internalId = v1.scooters.scooterDisplayCode(problem.scooter);
  const brandAndModel = [problem.scooter.brandName, problem.scooter.model]
    .filter(Boolean)
    .join(" ");
  const scooter = `${problem.scooter.brandName} ${problem.scooter.model ?? ""} · ${internalId}`;
  const statusVariant =
    problem.status === "resolved"
      ? "success"
      : problem.status === "in_progress"
        ? "default"
        : "secondary";
  const date = problem.createdAt ? new Date(problem.createdAt) : null;

  return (
    <Card
      as="article"
      border={expanded ? "primary" : "default"}
      size="comfortable"
      className="relative isolate transition-colors duration-fast hover:border-border-strong"
    >
      {problem.severity ? (
        <CardAccent className={severityAccent[problem.severity]} />
      ) : null}
      {href ? (
        <Link
          href={href}
          className="absolute inset-0 z-raised rounded-xl focus-visible:outline-ring"
          aria-label={`${problem.title} · ${scooter}`}
        />
      ) : (
        <Button
          variant="ghost"
          className="absolute inset-0 z-raised h-full w-full rounded-xl p-0 hover:bg-transparent aria-expanded:bg-transparent focus-visible:ring-inset"
          aria-label={`${problem.title} · ${scooter}`}
          aria-haspopup="dialog"
          aria-expanded={expanded}
          onClick={onToggle}
        />
      )}
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span
            className={`font-semibold uppercase ${problem.severity ? severityText[problem.severity] : "text-muted-foreground"}`}
            title={
              problem.severity
                ? t(`severityDescriptions.${problem.severity}`)
                : undefined
            }
          >
            {problem.severity ? t(problem.severity) : t("unassessed")}
          </span>
        </div>
        <CardTitle role="heading" aria-level={3}>
          {problem.title}
        </CardTitle>
        <CardAction className="flex max-w-32 flex-col items-end gap-1 text-right">
          <span className="text-xl font-semibold leading-tight tabular-nums">
            {internalId}
          </span>
          <span className="text-xs font-normal leading-snug text-muted-foreground">
            {brandAndModel}
          </span>
        </CardAction>
      </CardHeader>
      {problem.description ? (
        <CardContent>
          <p
            className={
              expanded
                ? "whitespace-pre-wrap text-sm wrap-anywhere"
                : "line-clamp-2 whitespace-pre-wrap text-sm text-muted-foreground wrap-anywhere"
            }
          >
            {problem.description}
          </p>
        </CardContent>
      ) : null}
      <CardContent className="flex flex-wrap gap-2">
        <Badge variant={statusVariant}>{t(problem.status)}</Badge>
        {problem.blocksUsage ? (
          <Badge variant="destructive">{t("maintenanceHold")}</Badge>
        ) : null}
        {problem.assigneeNeedsReassignment ? (
          <Badge variant="destructive">{t("reassignRequired")}</Badge>
        ) : null}
      </CardContent>
      <CardFooter className="mx-(--card-spacing) flex-wrap justify-between gap-3 rounded-none px-0 text-xs text-muted-foreground">
        <div className="flex min-w-0 items-center gap-2">
          <UserAvatar aria-hidden="true" />
          <span className="min-w-0 wrap-anywhere">
            {assignee || t("unassigned")}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {problem.photos?.length ? (
            <span
              className="flex items-center gap-1"
              aria-label={`${t("photos")}: ${problem.photos.length}`}
            >
              <Paperclip aria-hidden="true" className="size-3" />
              {problem.photos.length}
            </span>
          ) : null}
          {date && !Number.isNaN(date.getTime()) ? (
            <time
              dateTime={problem.createdAt}
              className="flex items-center gap-1"
            >
              <Clock aria-hidden="true" className="size-3" />
              {format.dateTime(date, {
                month: "short",
                day: "numeric",
                timeZone: "UTC",
              })}
            </time>
          ) : null}
        </div>
      </CardFooter>
    </Card>
  );
}
