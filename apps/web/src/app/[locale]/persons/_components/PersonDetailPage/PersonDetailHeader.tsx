"use client";

import { v1 } from "@repo/api-shared";
import {
  Badge,
  Button,
  buttonVariants,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components";
import { cn } from "@repo/ui/lib/utils";
import {
  ArrowLeftIcon,
  BadgeCheckIcon,
  CircleAlertIcon,
  EllipsisIcon,
  MailIcon,
  MessageCircleIcon,
  PencilIcon,
  PhoneIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { ConfirmationDialog } from "./ConfirmationDialog";
import { DocumentFormDialog } from "./DocumentFormDialog";
import { whatsappHrefForPhone } from "./helpers";
import { PersonFormDialog } from "./PersonFormDialog";

export function PersonDetailHeader({
  person,
  personsHref,
  readinessIsReady,
  busyAction,
  onUpdatePerson,
  onCreateDocument,
  onDeletePerson,
}: {
  person: v1.persons.Person;
  personsHref: string;
  readinessIsReady: boolean;
  busyAction: string | null;
  onUpdatePerson: (input: v1.persons.UpdatePersonInput) => Promise<boolean>;
  onCreateDocument: (
    input: v1.persons.CreatePersonDocumentInput,
  ) => Promise<boolean>;
  onDeletePerson: () => Promise<boolean>;
}) {
  const t = useTranslations("persons");
  const fullName = `${person.firstName} ${person.lastName}`;
  const whatsappHref = whatsappHrefForPhone(person.phone);
  const [editPersonOpen, setEditPersonOpen] = useState(false);
  const [editPersonDialogKey, setEditPersonDialogKey] = useState(0);
  const [addDocumentOpen, setAddDocumentOpen] = useState(false);
  const [addDocumentDialogKey, setAddDocumentDialogKey] = useState(0);
  const [deletePersonOpen, setDeletePersonOpen] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={personsHref}
        className={cn(
          buttonVariants({ variant: "ghost" }),
          "w-fit text-muted-foreground",
        )}
      >
        <ArrowLeftIcon data-icon="inline-start" />
        {t("actions.backToList")}
      </Link>

      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-semibold">{fullName}</h1>
          <p className="text-sm text-muted-foreground">
            {t("detail.description")}
          </p>
        </div>
        <div className="flex flex-col gap-2 md:items-end">
          <div className="flex flex-wrap gap-2 md:justify-end">
            <Badge variant="outline">
              {person.deletedAt
                ? t("recordStatus.deleted")
                : t("recordStatus.active")}
            </Badge>
            <Badge
              variant="outline"
              className={
                readinessIsReady
                  ? "border-success-subtle text-success"
                  : "border-warning-subtle text-warning"
              }
            >
              {readinessIsReady ? (
                <BadgeCheckIcon aria-hidden="true" data-icon="inline-start" />
              ) : (
                <CircleAlertIcon aria-hidden="true" data-icon="inline-start" />
              )}
              {readinessIsReady
                ? t("detail.readiness.readyTitle")
                : t("detail.readiness.reviewTitle")}
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
            <Link
              href={`tel:${person.phone}`}
              className={buttonVariants({
                size: "lg",
                className: "w-full sm:w-auto",
              })}
            >
              <PhoneIcon data-icon="inline-start" />
              {t("actions.call")}
            </Link>
            <Link
              href={whatsappHref}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({
                variant: "secondary",
                size: "lg",
                className: "w-full sm:w-auto",
              })}
            >
              <MessageCircleIcon data-icon="inline-start" />
              {t("actions.whatsapp")}
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="outline"
                    size="lg"
                    className="col-span-2 w-full sm:w-auto"
                  />
                }
              >
                <EllipsisIcon data-icon="inline-start" />
                {t("actions.moreActions")}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-auto min-w-48">
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    disabled={busyAction !== null}
                    onClick={() => {
                      setEditPersonDialogKey((current) => current + 1);
                      setEditPersonOpen(true);
                    }}
                  >
                    <PencilIcon data-icon="inline-start" />
                    {t("actions.editPerson")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={busyAction !== null}
                    onClick={() => {
                      setAddDocumentDialogKey((current) => current + 1);
                      setAddDocumentOpen(true);
                    }}
                  >
                    <PlusIcon data-icon="inline-start" />
                    {t("actions.addDocument")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    render={<a href={`mailto:${person.email}`} />}
                  >
                    <MailIcon data-icon="inline-start" />
                    {t("actions.email")}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    variant="destructive"
                    disabled={busyAction !== null}
                    onClick={() => setDeletePersonOpen(true)}
                  >
                    <Trash2Icon data-icon="inline-start" />
                    {t("actions.deletePerson")}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <PersonFormDialog
              key={`edit-person-${editPersonDialogKey}`}
              person={person}
              busy={busyAction === "person:update"}
              open={editPersonOpen}
              onOpenChange={setEditPersonOpen}
              renderTrigger={false}
              onSubmit={onUpdatePerson}
            />
            <DocumentFormDialog
              key={`add-document-${addDocumentDialogKey}`}
              title={t("detail.dialogs.addDocumentTitle")}
              busy={busyAction === "document:create"}
              open={addDocumentOpen}
              onOpenChange={setAddDocumentOpen}
              onSubmit={(input) =>
                onCreateDocument(input as v1.persons.CreatePersonDocumentInput)
              }
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
      </div>
    </div>
  );
}
