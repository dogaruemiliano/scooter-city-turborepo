"use client";

import { v1 } from "@repo/api-shared";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components";
import { FileTextIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { inlineIconClassName } from "./constants";
import { actorLabel, formatAuditChange, formatDateTime } from "./helpers";

export function ActivitySection({
  events,
  locale,
}: {
  events: v1.persons.PersonAuditEvent[];
  locale: string;
}) {
  const t = useTranslations("persons");

  return (
    <section className="grid gap-4">
      <div className="flex items-center gap-2">
        <FileTextIcon aria-hidden="true" className={inlineIconClassName} />
        <h2 className="text-base font-semibold">
          {t("detail.activity.title")}
        </h2>
      </div>
      {events.length > 0 ? (
        <ol className="grid gap-3">
          {events.map((event) => (
            <li key={event.id}>
              <Card size="sm">
                <CardHeader className="gap-2">
                  <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span>{t(`detail.activity.eventTypes.${event.type}`)}</span>
                    <span className="text-xs font-normal text-muted-foreground">
                      {formatDateTime(event.createdAt, locale)}
                    </span>
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {actorLabel(event.actor, t)}
                  </p>
                </CardHeader>
                <CardContent>
                  {event.changes.length > 0 ? (
                    <ul className="grid gap-1 text-sm text-muted-foreground">
                      {event.changes.map((change) => (
                        <li key={`${event.id}-${change.field}`}>
                          {formatAuditChange(change, t)}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {t("detail.activity.noChanges")}
                    </p>
                  )}
                </CardContent>
              </Card>
            </li>
          ))}
        </ol>
      ) : (
        <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          {t("detail.activity.empty")}
        </div>
      )}
    </section>
  );
}
