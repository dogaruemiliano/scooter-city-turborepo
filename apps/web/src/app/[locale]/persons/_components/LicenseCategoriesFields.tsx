"use client";

import { v1 } from "@repo/api-shared";
import { Button, Input, Label } from "@repo/ui/components";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { useId } from "react";
import { useTranslations } from "next-intl";

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
  const id = useId();
  const available = v1.persons.PERSON_DRIVER_LICENSE_CATEGORIES.filter(
    (category) => !value.some((entry) => entry.category === category),
  );

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
      <legend className="mb-2 text-sm font-medium">{t("title")}</legend>
      <p className="text-sm text-muted-foreground">{t("reviewHelp")}</p>
      {value.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : null}
      {value.map((entry, index) => (
        <div
          key={index}
          className="grid min-w-0 gap-3 border-t border-border pt-3 sm:grid-cols-2"
        >
          <div className="grid gap-2">
            <Label htmlFor={`${id}-${index}-category`}>{t("category")}</Label>
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
                  category === entry.category || available.includes(category),
              ).map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>
          <Button
            type="button"
            variant="text"
            className="self-end justify-self-start text-destructive"
            onClick={() => onChange(value.filter((_, i) => i !== index))}
          >
            <Trash2Icon data-icon="inline-start" />
            {t("removeCategory", { category: entry.category })}
          </Button>
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
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor={`${id}-${index}-restrictions`}>
              {t("restrictions")}
            </Label>
            <Input
              id={`${id}-${index}-restrictions`}
              value={entry.restrictions ?? ""}
              onChange={(event) =>
                update(index, { restrictions: event.target.value || null })
              }
            />
          </div>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        className="justify-self-start"
        disabled={disabled || available.length === 0}
        onClick={() => {
          const category = available[0];
          if (category)
            onChange([...value, { category, issuedOn: null, expiresOn: null }]);
        }}
      >
        <PlusIcon data-icon="inline-start" />
        {t("addCategory")}
      </Button>
    </fieldset>
  );
}
