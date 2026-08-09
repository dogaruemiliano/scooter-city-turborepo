"use client";

import { ApiError, v1 } from "@repo/api-shared";
import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo/ui/components";
import { Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { webApi } from "@/lib/api";
import { BrandFormSheet } from "./BrandFormSheet";

function BrandRowContent({
  brand,
  scooterCountLabel,
}: {
  brand: v1.scooterBrands.ScooterBrand;
  scooterCountLabel: string;
}) {
  return (
    <span className="flex w-full min-w-0 items-center justify-between gap-3">
      <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
        <span className="max-w-full truncate font-medium text-foreground">
          {brand.name}
        </span>
        <span className="text-xs text-muted-foreground">{brand.code}</span>
      </span>
      <span className="shrink-0 text-xs text-muted-foreground">
        {scooterCountLabel}
      </span>
    </span>
  );
}

function DeleteBrandButton({
  brand,
}: {
  brand: v1.scooterBrands.ScooterBrand;
}) {
  const t = useTranslations("scooters");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const disabled = brand.scooterCount > 0 || busy;

  async function deleteBrand() {
    setBusy(true);
    setError(null);
    try {
      await webApi.fetch(
        v1.scooterBrands.ROUTES.delete(brand.id),
        v1.common.noContentSchema,
        { method: "DELETE" },
      );
      router.refresh();
    } catch (fetchError) {
      setError(
        fetchError instanceof ApiError
          ? fetchError.message
          : t("brands.list.deleteError"),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={disabled}
              aria-label={`${t("brands.list.delete")}: ${brand.name}`}
              onClick={() => void deleteBrand()}
            />
          }
        >
          <Trash2Icon aria-hidden="true" />
        </TooltipTrigger>
        <TooltipContent>
          {brand.scooterCount > 0
            ? t("brands.list.deleteBlocked")
            : t("brands.list.delete")}
        </TooltipContent>
      </Tooltip>
      {error ? (
        <p
          role="alert"
          className="max-w-32 text-right text-xs text-destructive"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function BrandTable({
  brands,
}: {
  brands: v1.scooterBrands.ScooterBrand[];
}) {
  const t = useTranslations("scooters");

  if (brands.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
        {t("brands.list.empty")}
      </div>
    );
  }

  return (
    <section>
      <div className="hidden overflow-hidden rounded-xl border border-border bg-card md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("brands.columns.name")}</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {brands.map((brand) => {
              const scooterCountLabel = t("brands.list.scooterCount", {
                count: brand.scooterCount,
              });
              return (
                <TableRow key={brand.id}>
                  <TableCell className="p-0">
                    <BrandFormSheet
                      brand={brand}
                      trigger={
                        <button
                          type="button"
                          className="flex min-h-16 w-full items-center px-2 py-2 text-left outline-none transition-colors duration-fast ease-standard focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                        >
                          <BrandRowContent
                            brand={brand}
                            scooterCountLabel={scooterCountLabel}
                          />
                        </button>
                      }
                    />
                  </TableCell>
                  <TableCell className="p-2">
                    <DeleteBrandButton brand={brand} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <ul className="grid gap-2 md:hidden">
        {brands.map((brand) => {
          const scooterCountLabel = t("brands.list.scooterCount", {
            count: brand.scooterCount,
          });
          return (
            <li
              key={brand.id}
              className="flex items-center gap-1 overflow-hidden rounded-xl border border-border bg-card transition-colors duration-fast ease-standard hover:bg-muted"
            >
              <BrandFormSheet
                brand={brand}
                trigger={
                  <button
                    type="button"
                    className="flex min-h-16 flex-1 items-center p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    <BrandRowContent
                      brand={brand}
                      scooterCountLabel={scooterCountLabel}
                    />
                  </button>
                }
              />
              <div className="pr-2">
                <DeleteBrandButton brand={brand} />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
