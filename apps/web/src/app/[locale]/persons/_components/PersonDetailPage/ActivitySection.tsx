"use client";

import { v1 } from "@repo/api-shared";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components";
import {
  FilePenLineIcon,
  FilePlus2Icon,
  FileTextIcon,
  FileX2Icon,
  ReplaceIcon,
  UserRoundPenIcon,
  UserRoundPlusIcon,
  UserRoundXIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { inlineIconClassName } from "./constants";
import { actorLabel, formatAuditChange, formatDateTime } from "./helpers";

const activityIcons = {
  PERSON_CREATED: UserRoundPlusIcon,
  PERSON_UPDATED: UserRoundPenIcon,
  PERSON_DELETED: UserRoundXIcon,
  PERSON_DOCUMENT_CREATED: FilePlus2Icon,
  PERSON_DOCUMENT_UPDATED: FilePenLineIcon,
  PERSON_DOCUMENT_DELETED: FileX2Icon,
  PERSON_DOCUMENT_REPLACED: ReplaceIcon,
} satisfies Record<v1.persons.PersonAuditEvent["type"], typeof FileTextIcon>;

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
          {events.map((event) => {
            const ActivityIcon = activityIcons[event.type];

            return (
              <li key={event.id}>
                <Accordion>
                  <AccordionItem className="border-0" value={event.id}>
                    <Card className="gap-0 pb-0" size="sm">
                      <CardHeader className="pb-3">
                        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-sm">
                          <span className="flex min-w-0 items-center gap-2">
                            <ActivityIcon
                              aria-hidden="true"
                              className="size-4 shrink-0 text-muted-foreground"
                              data-audit-event-icon={event.type}
                            />
                            {t(`detail.activity.eventTypes.${event.type}`)}
                          </span>
                          <span className="text-xs font-normal text-muted-foreground">
                            {formatDateTime(event.createdAt, locale)}
                          </span>
                        </CardTitle>
                      </CardHeader>
                      <AccordionContent className="pb-3">
                        <CardContent className="grid gap-2">
                          <p className="text-xs text-muted-foreground">
                            {actorLabel(event.actor, t)}
                          </p>
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
                      </AccordionContent>
                      <AccordionTrigger
                        aria-label={t("detail.activity.toggleDetails", {
                          event: t(`detail.activity.eventTypes.${event.type}`),
                        })}
                        className="mx-auto mb-1 size-8 min-h-0 flex-none justify-center rounded-md px-0 py-0 hover:bg-muted hover:no-underline md:min-h-0 md:px-0 md:py-0 **:data-[slot=accordion-trigger-icon]:ml-0"
                      />
                    </Card>
                  </AccordionItem>
                </Accordion>
              </li>
            );
          })}
        </ol>
      ) : (
        <Card size="sm">
          <CardContent className="text-muted-foreground">
            {t("detail.activity.empty")}
          </CardContent>
        </Card>
      )}
    </section>
  );
}
