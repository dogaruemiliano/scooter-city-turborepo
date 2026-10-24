"use client";

import { v1 } from "@repo/api-shared";
import { UserAvatar } from "@repo/ui/components/user-avatar";
import { ProfileImage } from "@repo/ui/components/profile-image";
import { userAvatarSrc } from "@/lib/user-avatar";
import { Badge } from "@repo/ui/components";
import { PencilIcon, Trash2Icon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { MoreActionsMenu } from "@/components/MoreActionsMenu";

import { ConfirmationDialog } from "./ConfirmationDialog";
import { formatDate } from "./helpers";
import { PersonContactSheet } from "@/components/PersonContactSheet";

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
  const hasImage = Boolean(person.avatarAssetId);
  const personEditHref = `${personsHref}/${encodeURIComponent(person.id)}/edit`;
  const [deletePersonOpen, setDeletePersonOpen] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      {hasImage ? (
        <div className="flex justify-center">
          <ProfileImage
            name={fullName}
            src={userAvatarSrc(person.avatarAssetId)}
          />
        </div>
      ) : null}
      <div className="flex flex-col gap-3">
        {person.deletedAt ? (
          <div
            className={`flex flex-wrap gap-2 ${hasImage ? "justify-center" : ""}`}
          >
            <Badge variant="outline">{t("recordStatus.deleted")}</Badge>
          </div>
        ) : null}

        <div className="relative flex min-w-0 items-center justify-between gap-3">
          <div
            className={`flex min-w-0 flex-1 items-center gap-3 ${hasImage ? "justify-center px-12 text-center" : ""}`}
          >
            {!hasImage ? (
              <UserAvatar name={fullName} size="lg" aria-hidden="true" />
            ) : null}
            <h1 className="min-w-0 break-words text-2xl font-semibold">
              {fullName}
            </h1>
          </div>
          <div className={hasImage ? "absolute end-0" : "shrink-0"}>
            <MoreActionsMenu
              ariaLabel={t("actions.moreActions")}
              groups={[
                [
                  {
                    key: "edit",
                    permission: "persons.update",
                    label: t("actions.editPerson"),
                    icon: <PencilIcon data-icon="inline-start" />,
                    disabled: busyAction !== null,
                    onClick: () => router.push(personEditHref),
                  },
                ],
                [
                  {
                    key: "delete",
                    permission: "persons.archive",
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
        </div>

        <div
          className={
            hasImage
              ? "flex flex-col items-center gap-3 text-center"
              : "flex flex-col gap-3 md:flex-row md:items-end md:justify-between"
          }
        >
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
