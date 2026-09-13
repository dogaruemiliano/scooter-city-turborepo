"use client";

import { v1 } from "@repo/api-shared";
import { Button, Label } from "@repo/ui/components";
import { CheckIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useId, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { TextInputField } from "./PersonDetailPage/TextInputField";

export function LicenseCategoriesFields({
  value,
  onChange,
  disabled = false,
}: {
  value: v1.persons.PersonDriverLicenseCategoryEntry[];
  onChange: (value: v1.persons.PersonDriverLicenseCategoryEntry[]) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("persons.license");
  const locale = useLocale();
  const id = useId();
  const [editing, setEditing] = useState<number | null>(null);
  const available = v1.persons.PERSON_DRIVER_LICENSE_CATEGORIES.filter(
    (category) => !value.some((entry) => entry.category === category),
  );
  const formatter = new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
  function dateLabel(value: string | null | undefined) {
    if (!value) return t("missingDate");
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isNaN(date.getTime())
      ? t("missingDate")
      : formatter.format(date);
  }
  function update(
    index: number,
    patch: Partial<v1.persons.PersonDriverLicenseCategoryEntry>,
  ) {
    onChange(
      value.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)),
    );
  }

  return (
    <fieldset className="grid min-w-0 gap-3 sm:col-span-2" disabled={disabled}>
      <legend className="sr-only">{t("title")}</legend>
      {value.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : null}
      {value.map((entry, index) => (
        <div
          key={index}
          className="min-w-0 rounded-lg border border-border p-3"
        >
          <div className="flex min-w-0 items-center gap-3">
            {editing === index ? (
              <div className="min-w-0 flex-1">
                <Label className="sr-only" htmlFor={`${id}-${index}-category`}>
                  {t("category")}
                </Label>
                <select
                  id={`${id}-${index}-category`}
                  className="h-12 w-full rounded-lg border border-input bg-transparent px-3 text-base md:h-11 md:text-sm"
                  value={entry.category}
                  onChange={(event) =>
                    update(index, {
                      category: event.target
                        .value as v1.persons.PersonDriverLicenseCategory,
                    })
                  }
                >
                  {v1.persons.PERSON_DRIVER_LICENSE_CATEGORIES.filter(
                    (category) =>
                      category === entry.category ||
                      available.includes(category),
                  ).map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <>
                <span className="min-w-8 shrink-0 text-lg font-semibold">
                  {entry.category}
                </span>
                <dl className="grid min-w-0 flex-1 grid-cols-2 gap-3">
                  {[
                    { label: t("issuedOn"), value: entry.issuedOn },
                    { label: t("expiresOn"), value: entry.expiresOn },
                  ].map((date) => (
                    <div key={date.label} className="min-w-0">
                      <dt className="text-xs text-muted-foreground">
                        {date.label}
                      </dt>
                      <dd className="mt-1 text-sm tabular-nums">
                        {dateLabel(date.value)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </>
            )}
            {editing === index ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t("removeCategory", { category: entry.category })}
                  onClick={() => {
                    onChange(value.filter((_, i) => i !== index));
                    setEditing(null);
                  }}
                  className="text-destructive"
                >
                  <Trash2Icon aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t("doneEditing", { category: entry.category })}
                  onClick={() => setEditing(null)}
                  className="text-primary"
                >
                  <CheckIcon aria-hidden="true" />
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("editCategory", { category: entry.category })}
                onClick={() => setEditing(index)}
              >
                <PencilIcon aria-hidden="true" />
              </Button>
            )}
          </div>
          {editing === index ? (
            <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2">
              <TextInputField
                date
                disabled={disabled}
                label={`${t("issuedOn")} (${entry.category})`}
                value={entry.issuedOn ?? ""}
                onChange={(date) => update(index, { issuedOn: date || null })}
              />
              <TextInputField
                date
                disabled={disabled}
                label={`${t("expiresOn")} (${entry.category})`}
                value={entry.expiresOn ?? ""}
                onChange={(date) => update(index, { expiresOn: date || null })}
              />
            </div>
          ) : null}
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        className="justify-self-start"
        disabled={disabled || available.length === 0}
        onClick={() => {
          const category = available[0];
          if (category) {
            onChange([...value, { category, issuedOn: null, expiresOn: null }]);
            setEditing(value.length);
          }
        }}
      >
        <PlusIcon data-icon="inline-start" />
        {t("addCategory")}
      </Button>
    </fieldset>
  );
}
