"use client";

import { FileTextIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { inlineIconClassName } from "./constants";
import { DetailSectionCard } from "./DetailSection";

export function PersonNotesSection({ notes }: { notes: string | null }) {
  const t = useTranslations("persons");

  return (
    <DetailSectionCard
      title={t("fields.notes")}
      icon={<FileTextIcon aria-hidden="true" className={inlineIconClassName} />}
    >
      <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
        {notes || t("detail.emptyValue")}
      </p>
    </DetailSectionCard>
  );
}
