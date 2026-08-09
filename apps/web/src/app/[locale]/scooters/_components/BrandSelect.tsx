"use client";

import { v1 } from "@repo/api-shared";
import {
  BottomSheet,
  BottomSheetBody,
  BottomSheetClose,
  BottomSheetContent,
  BottomSheetFooter,
  BottomSheetHeader,
  BottomSheetTitle,
  BottomSheetTrigger,
  Button,
  Label,
} from "@repo/ui/components";
import { cn } from "@repo/ui/lib/utils";
import { ChevronDownIcon, PlusIcon, SearchIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { BrandFormSheet } from "./BrandFormSheet";

interface BrandSelectProps {
  id: string;
  label: string;
  value: string;
  onChange(value: string): void;
  brands: v1.scooterBrands.ScooterBrand[];
  error?: string;
  required?: boolean;
  disabled?: boolean;
}

export function BrandSelect({
  id,
  label,
  value,
  onChange,
  brands,
  error,
  required = false,
  disabled = false,
}: BrandSelectProps) {
  const t = useTranslations("scooters");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = useMemo(
    () => brands.find((brand) => brand.id === value),
    [brands, value],
  );

  const filteredBrands = useMemo(() => {
    if (!query.trim()) return brands;
    const lowerQuery = query.toLowerCase();
    return brands.filter(
      (brand) =>
        brand.name.toLowerCase().includes(lowerQuery) ||
        brand.code.toLowerCase().includes(lowerQuery),
    );
  }, [brands, query]);

  function select(brandId: string) {
    onChange(brandId);
    setOpen(false);
  }

  const triggerLabel = selected
    ? `${selected.name} (${selected.code})`
    : t("brandPicker.placeholder");

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1">
        <Label htmlFor={id}>{label}</Label>
        {required ? (
          <span aria-hidden="true" className="text-destructive">
            *
          </span>
        ) : null}
      </div>

      <BottomSheet open={open} onOpenChange={setOpen}>
        <BottomSheetTrigger
          render={
            <button
              type="button"
              id={id}
              disabled={disabled}
              // eslint-disable-next-line jsx-a11y/role-supports-aria-props -- this trigger gates a required selection, so assistive tech benefits from aria-required despite the strict role=button mapping
              aria-required={required || undefined}
              data-invalid={error ? true : undefined}
              aria-describedby={error ? `${id}-error` : undefined}
              className="flex w-full items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 py-2 text-base text-left outline-none transition-colors duration-fast ease-standard focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-disabled disabled:text-disabled-foreground data-invalid:border-destructive data-invalid:ring-2 data-invalid:ring-destructive md:text-sm"
            />
          }
        >
          <span className="truncate text-foreground">{triggerLabel}</span>
          <ChevronDownIcon
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground"
          />
        </BottomSheetTrigger>

        <BottomSheetContent>
          <BottomSheetHeader className="flex flex-row items-center justify-between gap-2">
            <BottomSheetTitle>{label}</BottomSheetTitle>
            <BrandFormSheet
              trigger={
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  aria-label={t("brandPicker.addNew")}
                >
                  <PlusIcon aria-hidden="true" />
                </Button>
              }
              onSaved={(brand) => select(brand.id)}
            />
          </BottomSheetHeader>

          <BottomSheetBody>
            <div className="flex flex-col gap-4">
              <div className="flex h-10 items-center rounded-lg border border-input bg-background px-3 transition-colors duration-fast ease-standard focus-within:border-ring focus-within:ring-2 focus-within:ring-ring">
                <SearchIcon
                  aria-hidden="true"
                  className="pointer-events-none size-4 shrink-0 text-muted-foreground"
                />
                <input
                  type="text"
                  placeholder={t("brandPicker.search")}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="min-w-0 flex-1 bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground"
                />
                {query ? (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground outline-none transition-colors duration-fast ease-standard hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <XIcon aria-hidden="true" className="size-4" />
                  </button>
                ) : null}
              </div>

              {filteredBrands.length === 0 ? (
                <div className="flex min-h-24 items-center justify-center text-center text-sm text-muted-foreground">
                  {t("brandPicker.empty")}
                </div>
              ) : (
                <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto overscroll-contain">
                  {filteredBrands.map((brand) => (
                    <li key={brand.id}>
                      <button
                        type="button"
                        onClick={() => select(brand.id)}
                        className={cn(
                          "flex w-full items-center justify-between gap-2 rounded px-3 py-2 text-left text-sm outline-none transition-colors duration-fast ease-standard focus-visible:ring-2 focus-visible:ring-ring",
                          value === brand.id
                            ? "bg-accent font-medium text-accent-foreground"
                            : "text-foreground hover:bg-accent/50",
                        )}
                      >
                        <span className="truncate">{brand.name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {brand.code}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </BottomSheetBody>

          <BottomSheetFooter>
            <BottomSheetClose
              render={<Button type="button" variant="outline" />}
            >
              {t("actions.close")}
            </BottomSheetClose>
          </BottomSheetFooter>
        </BottomSheetContent>
      </BottomSheet>

      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
