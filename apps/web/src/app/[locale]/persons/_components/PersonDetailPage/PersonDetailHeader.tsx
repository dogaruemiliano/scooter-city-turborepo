"use client";

import { v1 } from "@repo/api-shared";
import { Badge, buttonVariants } from "@repo/ui/components";
import { cn } from "@repo/ui/lib/utils";
import { ArrowLeftIcon, PencilIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { MoreActionsMenu } from "@/components/MoreActionsMenu";

import { ConfirmationDialog } from "./ConfirmationDialog";
import { formatDate } from "./helpers";
import { PersonContactSheet } from "./PersonContactSheet";
import { PersonFormDialog } from "./PersonFormDialog";

export function PersonDetailHeader({
  person,
  personsHref,
  busyAction,
  onUpdatePerson,
  onDeletePerson,
}: {
  person: v1.persons.Person;
  personsHref: string;
  busyAction: string | null;
  onUpdatePerson: (input: v1.persons.UpdatePersonInput) => Promise<boolean>;
  onDeletePerson: () => Promise<boolean>;
}) {
  const t = useTranslations("persons");
  const locale = useLocale();
  const fullName = `${person.firstName} ${person.lastName}`;
  const [editPersonOpen, setEditPersonOpen] = useState(false);
  const [editPersonDialogKey, setEditPersonDialogKey] = useState(0);
  const [deletePersonOpen, setDeletePersonOpen] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={personsHref}
        className={cn(
          buttonVariants({ variant: "ghost" }),
          "hidden w-fit text-muted-foreground md:inline-flex",
        )}
      >
        <ArrowLeftIcon data-icon="inline-start" />
        {t("actions.backToList")}
      </Link>

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
                  onClick: () => {
                    setEditPersonDialogKey((current) => current + 1);
                    setEditPersonOpen(true);
                  },
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

        <PersonFormDialog
          key={`edit-person-${editPersonDialogKey}`}
          person={person}
          busy={busyAction === "person:update"}
          open={editPersonOpen}
          onOpenChange={setEditPersonOpen}
          renderTrigger={false}
          onSubmit={onUpdatePerson}
        />
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
