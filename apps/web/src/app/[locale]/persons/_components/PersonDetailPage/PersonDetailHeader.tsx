"use client";

import { v1 } from "@repo/api-shared";
import { UserAvatar } from "@repo/ui/components/user-avatar";
import { DocumentViewer } from "@repo/ui/components/document-viewer";
import { userAvatarSrc } from "@/lib/user-avatar";
import { Badge, Button } from "@repo/ui/components";
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
  const avatarSrc = userAvatarSrc(person.avatarAssetId);
  const [previewOpen, setPreviewOpen] = useState(false);
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

        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto]">
          <div className="col-start-1 row-start-1 flex min-w-0 items-center gap-3">
            {avatarSrc ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="rounded-full p-0"
                aria-label={`${t("actions.view")}: ${fullName}`}
                aria-haspopup="dialog"
                onClick={() => setPreviewOpen(true)}
              >
                <UserAvatar
                  name={fullName}
                  src={avatarSrc}
                  size="lg"
                  aria-hidden="true"
                />
              </Button>
            ) : (
              <UserAvatar name={fullName} size="lg" aria-hidden="true" />
            )}
            <h1 className="min-w-0 break-words text-2xl font-semibold">
              {fullName}
            </h1>
          </div>
          <div className="col-span-full row-start-3 sm:flex sm:justify-end md:col-span-1 md:col-start-3 md:row-start-1">
            <PersonContactSheet person={person} />
          </div>
          <div className="col-start-2 row-start-1 shrink-0">
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
          <p className="col-span-full row-start-2 text-sm text-muted-foreground">
            {t("detail.registeredSince", {
              date: formatDate(person.createdAt, locale),
            })}
          </p>
        </div>

        {avatarSrc ? (
          <DocumentViewer
            open={previewOpen}
            onOpenChange={setPreviewOpen}
            src={avatarSrc}
            title={fullName}
            imageAlt={fullName}
            closeLabel={t("actions.cancel")}
            openFileLabel={t("documentForm.openFile")}
            actionsLabel={t("documentForm.documentActions")}
            pdfLabels={{
              error: t("documentForm.pdfPreviewError"),
              previousPage: t("documentForm.previousPage"),
              nextPage: t("documentForm.nextPage"),
            }}
            zoomLabels={{
              zoomIn: t("documentForm.zoomIn"),
              zoomOut: t("documentForm.zoomOut"),
              resetZoom: t("documentForm.resetZoom"),
            }}
          />
        ) : null}

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
