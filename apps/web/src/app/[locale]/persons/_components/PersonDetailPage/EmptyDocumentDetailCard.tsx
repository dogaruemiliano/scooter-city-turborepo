"use client";

import { v1 } from "@repo/api-shared";
import {
  Badge,
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components";
import { PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { documentTypeIcons, inlineIconClassName } from "./constants";
import { DocumentFormDialog } from "./DocumentFormDialog";

type DocumentSlot = "identity" | "driverLicense";

const slotTypes = {
  identity: v1.persons.PERSON_IDENTITY_DOCUMENT_TYPES,
  driverLicense: [v1.persons.PERSON_DRIVER_LICENSE_DOCUMENT_TYPE],
} as const satisfies Record<
  DocumentSlot,
  readonly v1.persons.PersonDocumentType[]
>;

const slotInitialTypes = {
  identity: "nationalId",
  driverLicense: "driverLicense",
} as const satisfies Record<DocumentSlot, v1.persons.PersonDocumentType>;

export function EmptyDocumentDetailCard({
  slot,
  busy,
  onCreate,
}: {
  slot: DocumentSlot;
  busy: boolean;
  onCreate: (input: v1.persons.CreatePersonDocumentInput) => Promise<boolean>;
}) {
  const t = useTranslations("persons");
  const [open, setOpen] = useState(false);
  const initialType = slotInitialTypes[slot];
  const typeLabel =
    slot === "identity"
      ? t("list.identityDocument")
      : t("documentTypes.driverLicense");
  const actionLabel = t("documentForm.addDocument", {
    document: typeLabel,
  });
  const DocumentIcon = documentTypeIcons[initialType];

  return (
    <>
      <button
        type="button"
        aria-label={actionLabel}
        className="group/document-card w-full rounded-xl text-left outline-none"
        disabled={busy}
        onClick={() => setOpen(true)}
      >
        <Card
          size="sm"
          className="pointer-events-none relative border-dashed transition-colors group-hover/document-card:bg-muted group-focus-visible/document-card:bg-muted/60 group-active/document-card:bg-muted/60 group-disabled/document-card:opacity-50"
        >
          <CardHeader className="pr-10">
            <CardTitle className="flex min-w-0 items-center gap-2">
              <DocumentIcon
                aria-hidden="true"
                className={inlineIconClassName}
              />
              <span className="min-w-0 truncate">{typeLabel}</span>
              <Badge variant="secondary" className="w-fit shrink-0">
                {t("documentForm.notAdded")}
              </Badge>
            </CardTitle>
            <CardAction className="absolute right-(--card-spacing) top-1/2 -translate-y-1/2 self-center">
              <PlusIcon
                aria-hidden="true"
                className="size-6 shrink-0 text-muted-foreground"
              />
            </CardAction>
          </CardHeader>
          <CardContent className="pr-10">
            <span className="block min-w-0 truncate text-xs font-medium text-muted-foreground">
              {actionLabel}
            </span>
          </CardContent>
        </Card>
      </button>

      <DocumentFormDialog
        title={t("detail.dialogs.addDocumentTitle")}
        initialType={initialType}
        allowedTypes={slotTypes[slot]}
        busy={busy}
        open={open}
        onOpenChange={setOpen}
        onSubmit={(input) =>
          onCreate(input as v1.persons.CreatePersonDocumentInput)
        }
      />
    </>
  );
}
