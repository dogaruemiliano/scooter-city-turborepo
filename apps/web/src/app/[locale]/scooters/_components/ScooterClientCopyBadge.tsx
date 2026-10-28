"use client";

import {
  Badge,
  Button,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components";
import {
  BottomSheet,
  BottomSheetBody,
  BottomSheetClose,
  BottomSheetContent,
  BottomSheetDescription,
  BottomSheetFooter,
  BottomSheetHeader,
  BottomSheetTitle,
  BottomSheetTrigger,
} from "@repo/ui/components/bottom-sheet";
import { ShieldIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import type {
  DocumentDraft,
  ScooterDocumentsEditor,
} from "./useScooterDocuments";

export function ScooterClientCopyBadge({
  draft,
  documents,
  disabled,
}: {
  draft: DocumentDraft;
  documents: ScooterDocumentsEditor;
  disabled: boolean;
}) {
  const t = useTranslations("scooters.workspace");
  const documentT = useTranslations("scooters.documents");
  const [open, setOpen] = useState(false);
  const id = useId();
  const originals = [
    ...documents.drafts,
    ...documents.existing
      .filter((doc) => !doc.clientCopy)
      .map((doc) => ({
        id: doc.id,
        file: { name: doc.fileName },
        version: "original" as const,
      })),
  ].filter(
    (original) =>
      original.version !== "client_copy" &&
      !documents.drafts.some(
        (copy) =>
          copy.id !== draft.id &&
          copy.version === "client_copy" &&
          copy.originalId === original.id,
      ),
  );
  return (
    <BottomSheet open={open} onOpenChange={setOpen}>
      <BottomSheetTrigger
        render={
          <Badge
            render={<button type="button" />}
            variant="default"
            className="cursor-pointer"
          />
        }
      >
        <ShieldIcon aria-hidden="true" />
        {documentT("clientCopy")}
      </BottomSheetTrigger>
      <BottomSheetContent>
        <BottomSheetHeader>
          <Badge variant="default">
            <ShieldIcon aria-hidden="true" />
            {documentT("clientCopy")}
          </Badge>
          <BottomSheetTitle>{t("copyDetailsTitle")}</BottomSheetTitle>
          <BottomSheetDescription>
            {t("copyExplanation")}
          </BottomSheetDescription>
        </BottomSheetHeader>
        <BottomSheetBody>
          <p className="truncate text-sm font-medium" title={draft.file.name}>
            {draft.file.name}
          </p>
          <div className="grid gap-2">
            <Label htmlFor={id}>{t("originalForCopy")}</Label>
            <Select
              value={draft.originalId ?? ""}
              disabled={disabled}
              onValueChange={(value) => {
                if (value) documents.setVersion(draft.id, "client_copy", value);
              }}
            >
              <SelectTrigger
                id={id}
                aria-label={t("originalForCopyFile", { name: draft.file.name })}
              >
                <SelectValue placeholder={t("chooseOriginal")} />
              </SelectTrigger>
              <SelectContent>
                {originals.map((original) => (
                  <SelectItem key={original.id} value={original.id}>
                    {original.file.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              {t(draft.originalId ? "copyAssigned" : "copyNeedsOriginal")}
            </p>
          </div>
        </BottomSheetBody>
        <BottomSheetFooter>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={() => {
              setOpen(false);
              documents.setVersion(draft.id, "original");
            }}
          >
            {t("useAsOriginal")}
          </Button>
          <BottomSheetClose render={<Button type="button" variant="text" />}>
            {documentT("closePreview")}
          </BottomSheetClose>
        </BottomSheetFooter>
      </BottomSheetContent>
    </BottomSheet>
  );
}
