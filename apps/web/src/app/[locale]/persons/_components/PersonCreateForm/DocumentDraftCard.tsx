"use client";

import type { v1 } from "@repo/api-shared";
import { Badge, BottomSheetTrigger, Button } from "@repo/ui/components";
import {
  CarFrontIcon,
  ChevronRightIcon,
  FileTextIcon,
  IdCardIcon,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { PERSON_DOCUMENT_FORM_FIELD_KEYS } from "./constants";
import { documentFieldErrorKey, invalidAria } from "./errors";
import { isBlankDocumentDraft } from "./form-state";
import type { CreatePersonDocumentFormState, FormErrors } from "./types";

const documentTypeIcons = {
  passport: IdCardIcon,
  nationalId: IdCardIcon,
  driverLicense: CarFrontIcon,
  residencePermit: IdCardIcon,
  other: FileTextIcon,
} as const satisfies Record<v1.persons.PersonDocumentType, LucideIcon>;

export function DocumentDraftCard({
  document,
  documentId,
  disabled,
  fieldErrors,
  onOpen,
}: {
  document: CreatePersonDocumentFormState;
  documentId: string;
  disabled: boolean;
  fieldErrors: FormErrors;
  onOpen: () => void;
}) {
  const t = useTranslations("persons");
  const isBlank = isBlankDocumentDraft(document);
  const typeLabel = t(`documentTypes.${document.type}`);
  const actionLabel = isBlank
    ? t("documentForm.addDocument", { document: typeLabel })
    : t("documentForm.editDocument", { document: typeLabel });
  const error = firstDocumentError(document.key, fieldErrors);
  const errorId = `${documentId}-summary-error`;
  const DocumentIcon = documentTypeIcons[document.type];

  return (
    <div className="grid min-w-0 gap-2">
      <BottomSheetTrigger
        render={
          <Button
            type="button"
            variant="outline"
            className="h-auto w-full items-center justify-between rounded-xl p-4 text-left whitespace-normal shadow-sm md:h-auto"
            aria-label={actionLabel}
            aria-describedby={error ? errorId : undefined}
            aria-invalid={invalidAria(error)}
            disabled={disabled}
            onClick={onOpen}
          />
        }
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <DocumentIcon aria-hidden="true" />
          </span>
          <span className="grid min-w-0 gap-1.5">
            <span className="flex flex-wrap items-center gap-2">
              <span className="truncate font-semibold text-foreground">
                {typeLabel}
              </span>
              <Badge variant={error ? "destructive" : "secondary"}>
                {document.required
                  ? t("documentForm.required")
                  : t("documentForm.optional")}
              </Badge>
            </span>
            <span className="text-sm font-normal text-muted-foreground">
              {isBlank
                ? t("documentForm.notAdded")
                : t("documentForm.detailsAdded")}
            </span>
            {!isBlank ? (
              <Badge variant="outline">
                {t(`documentStatuses.${document.status}`)}
              </Badge>
            ) : null}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
          <span className="hidden sm:inline">
            {isBlank ? t("actions.addDocument") : t("actions.editDocument")}
          </span>
          <ChevronRightIcon aria-hidden="true" />
        </span>
      </BottomSheetTrigger>
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function firstDocumentError(
  documentKey: string,
  fieldErrors: FormErrors,
): string | undefined {
  for (const field of PERSON_DOCUMENT_FORM_FIELD_KEYS) {
    const error = fieldErrors[documentFieldErrorKey(documentKey, field)];
    if (error) return error;
  }

  return undefined;
}
