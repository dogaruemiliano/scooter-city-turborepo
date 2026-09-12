"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { Checkbox, Label } from "@repo/ui/components";
import type { LicenseNameDifference } from "./license-name-comparison";

export function LicenseNameConfirmation({
  differences,
  checked,
  disabled,
  onCheckedChange,
}: {
  differences: LicenseNameDifference[];
  checked: boolean;
  disabled: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const t = useTranslations("persons");
  const id = useId();
  return (
    <section
      aria-labelledby={`${id}-title`}
      className="grid gap-4 rounded-lg border border-warning bg-warning-subtle p-4"
    >
      <div className="grid gap-1">
        <h2 id={`${id}-title`} className="font-semibold">
          {t("licenseName.title")}
        </h2>
        <p className="text-sm">
          {t(
            differences.every((item) => item.formattingOnly)
              ? "licenseName.formatting"
              : "licenseName.different",
          )}
        </p>
      </div>
      {differences.map((item) => (
        <div
          key={`${item.source}:${item.field}:${item.licenseName}`}
          className="grid gap-2"
        >
          <h3 className="text-sm font-medium">{t(`fields.${item.field}`)}</h3>
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">
                {t("licenseName.identity")}
              </dt>
              <dd className="break-words font-medium">{item.identityName}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">
                {t("licenseName.license")}
              </dt>
              <dd className="break-words font-medium">{item.licenseName}</dd>
            </div>
          </dl>
        </div>
      ))}
      <div className="flex items-start gap-3">
        <Checkbox
          id={id}
          checked={checked}
          disabled={disabled}
          onCheckedChange={onCheckedChange}
        />
        <Label htmlFor={id} className="text-sm leading-normal">
          {t("licenseName.confirm")}
        </Label>
      </div>
    </section>
  );
}
