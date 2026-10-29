"use client";

import { v1 } from "@repo/api-shared";
import {
  Button,
  Label,
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components";
import { PencilIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId } from "react";

export type LogicalDocumentUpdate = (
  sourceId: string,
  documentId: string,
  patch: Partial<
    Pick<
      v1.scooters.LogicalDocumentExtraction,
      "vin" | "documentType" | "pages"
    >
  >,
) => void;

/** Classification corrections live beside the file, including mixed PDF children. */
export function ScooterDocumentTypeEditor({
  sourceId,
  fileName,
  type,
  documents,
  disabled,
  onType,
  onDocument,
  scooterVin,
  surface = "default",
}: {
  surface?: "default" | "media";
  sourceId: string;
  fileName: string;
  type: v1.scooters.ScooterDocumentType | null;
  documents?: v1.scooters.LogicalDocumentExtraction[];
  disabled: boolean;
  onType?: (type: v1.scooters.ScooterDocumentType) => void;
  onDocument?: LogicalDocumentUpdate;
  scooterVin?: string;
}) {
  const t = useTranslations("scooters.documents");
  const workspace = useTranslations("scooters.workspace");
  const id = useId();
  const logical = documents?.length ? documents : undefined;
  const editable = logical ? Boolean(onDocument) : Boolean(onType);
  const types = logical
    ? [...new Set(logical.map((document) => document.documentType))]
    : type
      ? [type]
      : [];
  const typeLabel = types.length
    ? types.map((value) => t(`compact.${value}`)).join(" · ")
    : t("batch.unknown");
  return (
    <div className="flex min-w-0 items-center gap-2">
      {editable ? (
        <Popover>
          <PopoverTrigger
            render={
              <Button
                type="button"
                variant="text"
                size="xs"
                className={
                  surface === "media"
                    ? "text-scrim-foreground hover:text-scrim-foreground"
                    : undefined
                }
                disabled={disabled}
                aria-label={t("batch.editType", { name: fileName })}
              />
            }
          >
            <span className="min-w-0 text-left">{typeLabel}</span>
            <PencilIcon className="size-3" aria-hidden="true" />
          </PopoverTrigger>
          <PopoverContent align="end" className="gap-4 p-4">
            <PopoverTitle>{workspace("documentType")}</PopoverTitle>
            {(logical ?? [{ id: sourceId, documentType: type, pages: [] }]).map(
              (document) => (
                <div key={document.id} className="grid gap-2">
                  <Label htmlFor={`${id}-${document.id}`}>
                    {logical
                      ? `${t(document.documentType!)} · ${workspace("pages", { pages: document.pages.join(", ") })}`
                      : fileName}
                  </Label>
                  <Select
                    value={document.documentType ?? ""}
                    disabled={disabled}
                    onValueChange={(value) => {
                      const parsed =
                        v1.scooters.scooterDocumentTypeSchema.safeParse(value);
                      if (!parsed.success) return;
                      if (logical)
                        onDocument?.(sourceId, document.id, {
                          documentType: parsed.data,
                        });
                      else onType?.(parsed.data);
                    }}
                  >
                    <SelectTrigger
                      id={`${id}-${document.id}`}
                      aria-label={t("batch.typeLabel", {
                        name: logical
                          ? `${fileName} · ${workspace("pages", { pages: document.pages.join(", ") })}`
                          : fileName,
                      })}
                    >
                      <SelectValue placeholder={t("batch.unknown")} />
                    </SelectTrigger>
                    <SelectContent>
                      {v1.scooters.SCOOTER_DOCUMENT_TYPES.map((value) => (
                        <SelectItem key={value} value={value}>
                          {t(value)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {logical &&
                  "vin" in document &&
                  document.vin &&
                  scooterVin &&
                  document.vin !== scooterVin &&
                  v1.scooters.scooterDocumentReadsVin(
                    document.documentType!,
                  ) ? (
                    <>
                      <p role="alert" className="text-sm text-destructive">
                        {workspace("vinConflictReading", {
                          vin: document.vin,
                          selected: scooterVin,
                        })}
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={disabled}
                        onClick={() =>
                          onDocument?.(sourceId, document.id, {
                            vin: scooterVin,
                          })
                        }
                      >
                        {workspace("useScooterVin")}
                      </Button>
                    </>
                  ) : null}
                </div>
              ),
            )}
          </PopoverContent>
        </Popover>
      ) : (
        <span
          className={`text-xs ${surface === "media" ? "text-scrim-foreground" : "text-muted-foreground"}`}
        >
          {typeLabel}
        </span>
      )}
    </div>
  );
}
