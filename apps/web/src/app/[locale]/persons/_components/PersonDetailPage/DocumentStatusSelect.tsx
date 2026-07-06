"use client";

import { v1 } from "@repo/api-shared";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components";
import { useTranslations } from "next-intl";

export function DocumentStatusSelect({
  value,
  disabled,
  onChange,
}: {
  value: v1.persons.PersonDocumentStatus;
  disabled: boolean;
  onChange: (status: v1.persons.PersonDocumentStatus) => Promise<boolean>;
}) {
  const t = useTranslations("persons");

  return (
    <Select
      value={value}
      onValueChange={(nextValue) =>
        void onChange(nextValue as v1.persons.PersonDocumentStatus)
      }
    >
      <SelectTrigger
        aria-label={t("fields.documentStatus")}
        size="sm"
        disabled={disabled}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {v1.persons.PERSON_DOCUMENT_STATUSES.map((status) => (
          <SelectItem key={status} value={status}>
            {t(`documentStatuses.${status}`)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
