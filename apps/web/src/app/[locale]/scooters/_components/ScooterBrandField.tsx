"use client";

import { useOptionalSession } from "@/components/auth/SessionProvider";
import { canAccess } from "@/lib/access";

import { v1 } from "@repo/api-shared";
import { Button, SheetSelect } from "@repo/ui/components";
import { useIsMobile } from "@repo/ui/hooks/use-mobile";
import { PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useController, useFormContext } from "react-hook-form";

import { FormField, useFormFieldControl } from "@/components/form/FormField";
import { FormSearchSelect } from "@/components/form/FormSearchSelect";
import { useCivFieldHint } from "./useCivFieldHint";
import { BrandFormSheet } from "./BrandFormSheet";
import type { ScooterEditorValues } from "./scooter-editor-schema";

export function ScooterBrandField({
  brands,
  disabled,
  onBrandCreated,
}: {
  onBrandCreated: (brand: v1.scooterBrands.ScooterBrand) => void;
  brands: v1.scooterBrands.ScooterBrand[];
  disabled: boolean;
}) {
  const t = useTranslations("scooters");
  const labelHint = useCivFieldHint("brandId");
  return (
    <FormField
      name="brandId"
      label={t("fields.brand")}
      labelHint={labelHint}
      required
      disabled={disabled}
    >
      <BrandPicker brands={brands} onBrandCreated={onBrandCreated} />
    </FormField>
  );
}

function BrandPicker({
  brands,
  onBrandCreated,
}: {
  brands: v1.scooterBrands.ScooterBrand[];
  onBrandCreated: (brand: v1.scooterBrands.ScooterBrand) => void;
}) {
  const t = useTranslations("scooters");
  const mobile = useIsMobile();
  const canManage = canAccess(
    useOptionalSession()?.user,
    "scooter_brands.manage",
  );
  const { control, setValue } = useFormContext<ScooterEditorValues>();
  const { field } = useController({ control, name: "brandId" });
  const { id, disabled, error, errorId, required } = useFormFieldControl();
  const options = brands.map((brand) => ({
    value: brand.id,
    label: brand.name,
    description: brand.code,
    keywords: [brand.code],
  }));

  function createAction(select?: (value: string) => void) {
    if (!canManage) return null;
    return (
      <BrandFormSheet
        trigger={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-12"
            disabled={disabled}
            aria-label={t("brandPicker.addNew")}
          >
            <PlusIcon aria-hidden="true" className="size-6" />
          </Button>
        }
        onSaved={(brand) => {
          onBrandCreated(brand);
          setValue("brandId", brand.id, {
            shouldDirty: true,
            shouldTouch: true,
            shouldValidate: true,
          });
          select?.(brand.id);
        }}
      />
    );
  }

  if (mobile) {
    return (
      <SheetSelect
        id={id}
        triggerRef={field.ref}
        onBlur={field.onBlur}
        label={t("brandPicker.title")}
        labelledById={`${id}-label`}
        describedById={errorId}
        invalid={Boolean(error)}
        required={required}
        disabled={disabled}
        value={field.value}
        options={options}
        optionClassName="text-base"
        placeholder={t("brandPicker.placeholder")}
        searchPlaceholder={t("brandPicker.search")}
        clearSearchLabel={t("brandPicker.clearSearch")}
        emptyMessage={t("brandPicker.empty")}
        closeLabel={t("actions.close")}
        onValueChange={(value) => {
          field.onChange(value);
          field.onBlur();
        }}
        renderHeaderAction={canManage ? createAction : undefined}
      />
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <FormSearchSelect
          options={options}
          placeholder={t("brandPicker.placeholder")}
          searchPlaceholder={t("brandPicker.search")}
          emptyMessage={t("brandPicker.empty")}
          clearLabel={t("brandPicker.clear")}
          toggleLabel={t("brandPicker.toggle")}
        />
      </div>
      {createAction()}
    </div>
  );
}
