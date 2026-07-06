"use client";

import { FileTextIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { inlineIconClassName } from "./constants";

export function PersonNotesSection({ notes }: { notes: string | null }) {
  const t = useTranslations("persons");

  return (
    <section className="grid min-w-0 gap-4 rounded-lg bg-muted p-4 md:grid-cols-3 md:gap-6">
      <div className="flex items-center gap-2">
        <FileTextIcon aria-hidden="true" className={inlineIconClassName} />
        <h2 className="text-base font-semibold md:text-sm">
          {t("fields.notes")}
        </h2>
      </div>
      <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground md:col-span-2">
        {notes || t("detail.emptyValue")}
      </p>
    </section>
  );
}
