"use client";

import type { ReactNode } from "react";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "./accordion";
import { cn } from "@repo/ui/lib/utils";

function ActivityTimeline({
  title,
  count,
  summary,
  children,
  defaultOpen = false,
}: {
  title: string;
  count?: number;
  summary?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <Accordion
      defaultValue={defaultOpen ? ["activity"] : []}
      className="border-y border-border"
    >
      <AccordionItem value="activity">
        <AccordionTrigger className="gap-3 py-4 hover:no-underline md:py-4">
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="flex items-center gap-2 text-base font-semibold">
              {title}
              {count !== undefined ? (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {count}
                </span>
              ) : null}
            </span>
            {summary ? (
              <span className="truncate text-xs font-normal text-muted-foreground">
                {summary}
              </span>
            ) : null}
          </span>
        </AccordionTrigger>
        <AccordionContent>
          <div className="flex flex-col gap-4 pb-4">{children}</div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
const tones = {
  neutral: "bg-muted text-muted-foreground",
  info: "bg-info-subtle text-info",
  success: "bg-success-subtle text-success",
  warning: "bg-warning-subtle text-warning",
  destructive: "bg-destructive-subtle text-destructive",
};
function ActivityTimelineItem({
  icon,
  tone = "neutral",
  title,
  actor,
  timestamp,
  dateTime,
  children,
  detailsLabel,
  details,
}: {
  icon: ReactNode;
  tone?: keyof typeof tones;
  title: string;
  actor?: string;
  timestamp: string;
  dateTime: string;
  children?: ReactNode;
  detailsLabel?: string;
  details?: ReactNode;
}) {
  return (
    <li className="group/activity-item relative flex min-w-0 gap-3 pb-4 last:pb-0 after:absolute after:top-9 after:bottom-0 after:left-4 after:border-l after:border-border last:after:hidden">
      <span
        aria-hidden="true"
        className={cn(
          "relative z-raised flex size-8 shrink-0 items-center justify-center rounded-full [&_svg]:size-4",
          tones[tone],
        )}
      >
        {icon}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2 border-b border-border pb-4 group-last/activity-item:border-0 group-last/activity-item:pb-0">
        <div className="flex flex-col gap-1 md:flex-row md:items-baseline md:justify-between md:gap-4">
          <div className="min-w-0 text-sm wrap-anywhere">
            <span className="font-semibold">{title}</span>
            {actor ? (
              <span className="text-muted-foreground"> · {actor}</span>
            ) : null}
          </div>
          <time
            dateTime={dateTime}
            className="shrink-0 text-xs text-muted-foreground"
          >
            {timestamp}
          </time>
        </div>
        {children ? (
          <div className="text-sm text-muted-foreground wrap-anywhere">
            {children}
          </div>
        ) : null}
        {details ? (
          <details className="text-sm">
            <summary className="cursor-pointer rounded-sm text-xs font-medium text-link outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {detailsLabel}
            </summary>
            <div className="pt-3 whitespace-pre-wrap wrap-anywhere">
              {details}
            </div>
          </details>
        ) : null}
      </div>
    </li>
  );
}
export { ActivityTimeline, ActivityTimelineItem };
