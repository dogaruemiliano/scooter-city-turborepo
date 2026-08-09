"use client";

import { v1 } from "@repo/api-shared";
import { Badge } from "@repo/ui/components";
import { PencilIcon, Trash2Icon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { MoreActionsMenu } from "@/components/MoreActionsMenu";

import { ConfirmationDialog } from "./ConfirmationDialog";
import { formatDate } from "./helpers";
import { PersonContactSheet } from "./PersonContactSheet";

export function PersonDetailHeader({
  person,
  personsHref,
  busyAction,
  onDeletePerson,
}: {
  person: v1.persons.Person;
  personsHref: string;
  busyAction: string | null;
  onDeletePerson: () => Promise<boolean>;
}) {
  const t = useTranslations("persons");
  const locale = useLocale();
  const router = useRouter();
  const fullName = `${person.firstName} ${person.lastName}`;
  const personEditHref = `${personsHref}/${encodeURIComponent(person.id)}/edit`;
  const [deletePersonOpen, setDeletePersonOpen] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        {person.deletedAt ? (
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{t("recordStatus.deleted")}</Badge>
          </div>
        ) : null}

        <div className="flex min-w-0 items-center justify-between gap-3">
          <h1 className="min-w-0 break-words text-2xl font-semibold">
            {fullName}
          </h1>
          <MoreActionsMenu
            ariaLabel={t("actions.moreActions")}
            groups={[
              [
                {
                  key: "edit",
                  label: t("actions.editPerson"),
                  icon: <PencilIcon data-icon="inline-start" />,
                  disabled: busyAction !== null,
                  onClick: () => router.push(personEditHref),
                },
              ],
              [
                {
                  key: "delete",
                  label: t("actions.deletePerson"),
                  icon: <Trash2Icon data-icon="inline-start" />,
                  variant: "destructive",
                  disabled: busyAction !== null,
                  onClick: () => setDeletePersonOpen(true),
                },
              ],
            ]}
          />
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <p className="text-sm text-muted-foreground">
            {t("detail.registeredSince", {
              date: formatDate(person.createdAt, locale),
            })}
          </p>
          <div className="sm:flex sm:justify-end">
            <PersonContactSheet person={person} />
          </div>
        </div>

        <ConfirmationDialog
          open={deletePersonOpen}
          onOpenChange={setDeletePersonOpen}
          title={t("detail.dialogs.deletePersonTitle")}
          description={t("detail.dialogs.deletePersonDescription")}
          confirmLabel={t("actions.deletePerson")}
          busy={busyAction === "person:delete"}
          onConfirm={onDeletePerson}
        />
      </div>
    </div>
  );
}
