import { userAvatarSrc } from "@/lib/user-avatar";
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

const difficultyAccent = {
  easy: "bg-difficulty-easy",
  medium: "bg-difficulty-medium",
  hard: "bg-difficulty-hard",
} as const;
const difficultyText = {
  easy: "dark:text-difficulty-easy",
  medium: "dark:text-difficulty-medium",
  hard: "dark:text-difficulty-hard",
} as const;

export function ProblemListItem({
  problem,
  expanded,
  onToggle,
  href,
  variant = "default",
}: {
  problem: v1.problems.Problem;
  expanded?: boolean;
  onToggle?: () => void;
  href?: string;
  /** Omits scooter identity and moves badges into the header. */
  variant?: "default" | "simple";
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
  const badges = (
    <>
      <Badge variant={statusVariant}>{t(problem.status)}</Badge>
      {problem.blocksUsage &&
      (problem.status === "open" || problem.status === "in_progress") ? (
        <Badge variant="destructive">{t("maintenanceHold")}</Badge>
      ) : null}
      {problem.assigneeNeedsReassignment ? (
        <Badge variant="destructive">{t("reassignRequired")}</Badge>
      ) : null}
    </>
  );

  return (
    <Card
      as="article"
      border={expanded ? "primary" : "default"}
      size="comfortable"
      className="relative isolate transition-colors duration-fast hover:border-border-strong"
    >
      {problem.difficulty ? (
        <CardAccent className={difficultyAccent[problem.difficulty]} />
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
            className={`font-semibold uppercase ${problem.difficulty ? difficultyText[problem.difficulty] : "text-muted-foreground"}`}
            title={
              problem.difficulty
                ? t(`difficultyDescriptions.${problem.difficulty}`)
                : undefined
            }
          >
            {problem.difficulty ? t(problem.difficulty) : t("unassessed")}
          </span>
        </div>
        <CardTitle role="heading" aria-level={3}>
          {problem.title}
        </CardTitle>
        {variant === "simple" ? (
          <CardAction className="flex max-w-32 flex-col items-end gap-2">
            {badges}
          </CardAction>
        ) : (
          <CardAction className="flex max-w-32 flex-col items-end gap-1 text-right">
            <span className="text-xl font-semibold leading-tight tabular-nums">
              {internalId}
            </span>
            <span className="text-xs font-normal leading-snug text-muted-foreground">
              {brandAndModel}
            </span>
          </CardAction>
        )}
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
      {variant === "default" ? (
        <CardContent className="flex flex-wrap gap-2">{badges}</CardContent>
      ) : null}
      <CardFooter className="mx-(--card-spacing) flex-wrap justify-between gap-3 rounded-none px-0 text-xs text-muted-foreground">
        <div className="flex min-w-0 items-center gap-2">
          <UserAvatar
            aria-hidden="true"
            name={assignee || undefined}
            src={userAvatarSrc(
              v1.problems.problemAssignees(problem)[0]?.avatarAssetId,
            )}
          />
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
