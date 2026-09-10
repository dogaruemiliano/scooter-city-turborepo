"use client";

import { ApiError, v1 } from "@repo/api-shared";
import {
  BottomSheet,
  BottomSheetBody,
  BottomSheetContent,
  BottomSheetFooter,
  BottomSheetHeader,
  BottomSheetTitle,
  BottomSheetTrigger,
  Button,
  Input,
  Label,
  Spinner,
} from "@repo/ui/components";
import { ArrowLeftIcon, CheckIcon, PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useRef, useState } from "react";

import { createSupplier, updateSupplier } from "../_lib/expense-api";

type PickerMode = "list" | "form";

interface ExpenseSupplierPickerProps {
  trigger: React.ReactElement;
  initialSuppliers: readonly v1.finance.Supplier[];
  selectedSupplierId: string;
  detectedName: string;
  detectedTaxIdentifier: string;
  onSupplierChange: (supplier: v1.finance.Supplier) => void;
}

export function ExpenseSupplierPicker({
  trigger,
  initialSuppliers,
  selectedSupplierId,
  detectedName,
  detectedTaxIdentifier,
  onSupplierChange,
}: ExpenseSupplierPickerProps) {
  const t = useTranslations("finance.expense.captureSheet.supplierPicker");
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<PickerMode>("list");
  const [suppliers, setSuppliers] = useState(() => [...initialSuppliers]);
  const [editingId, setEditingId] = useState<string>();
  const [name, setName] = useState("");
  const [taxIdentifier, setTaxIdentifier] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const nameInputRef = useRef<HTMLInputElement>(null);

  const visibleSuppliers = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return suppliers.filter((supplier) => supplier.isActive);
    return suppliers.filter(
      (supplier) =>
        supplier.isActive &&
        [supplier.name, supplier.taxIdentifier].some((value) =>
          value.toLocaleLowerCase().includes(query),
        ),
    );
  }, [search, suppliers]);

  function showForm(supplier?: v1.finance.Supplier) {
    setEditingId(supplier?.id);
    setName(supplier?.name ?? detectedName);
    setTaxIdentifier(supplier?.taxIdentifier ?? detectedTaxIdentifier);
    setError(undefined);
    setMode("form");
  }

  function preparePicker() {
    const selected = suppliers.find(
      (supplier) => supplier.id === selectedSupplierId,
    );
    if (selected) {
      showForm(selected);
    } else if (detectedName || detectedTaxIdentifier) {
      showForm();
    } else {
      setMode("list");
      setSearch("");
      setError(undefined);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const supplier = editingId
        ? await updateSupplier(editingId, { name, taxIdentifier })
        : await createSupplier({ name, taxIdentifier });
      setSuppliers((current) => {
        const exists = current.some((item) => item.id === supplier.id);
        return exists
          ? current.map((item) => (item.id === supplier.id ? supplier : item))
          : [...current, supplier].sort((left, right) =>
              left.name.localeCompare(right.name),
            );
      });
      onSupplierChange(supplier);
      setOpen(false);
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.message
          ? caught.message
          : t("saveFailed"),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet
      open={open}
      onOpenChange={(nextOpen) => {
        if (!busy) {
          if (nextOpen) preparePicker();
          setOpen(nextOpen);
        }
      }}
    >
      <BottomSheetTrigger render={trigger}>
        {t("chooseTitle")}
      </BottomSheetTrigger>
      <BottomSheetContent initialFocus={mode === "form" ? nameInputRef : true}>
        {mode === "list" ? (
          <>
            <BottomSheetHeader className="flex-row items-center justify-between gap-3">
              <BottomSheetTitle>{t("chooseTitle")}</BottomSheetTitle>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("add")}
                onClick={() => showForm()}
              >
                <PlusIcon aria-hidden="true" />
              </Button>
            </BottomSheetHeader>
            <BottomSheetBody safeAreaBottom className="gap-3 px-0">
              <div className="px-4">
                <Input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t("search")}
                  aria-label={t("search")}
                />
              </div>
              <div>
                {visibleSuppliers.length > 0 ? (
                  visibleSuppliers.map((supplier) => {
                    const selected = supplier.id === selectedSupplierId;
                    return (
                      <button
                        key={supplier.id}
                        type="button"
                        onClick={() => {
                          onSupplierChange(supplier);
                          setOpen(false);
                        }}
                        className="flex min-h-16 w-full items-center gap-3 border-b border-border px-4 py-3 text-left outline-none last:border-b-0 hover:bg-muted focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-base font-medium">
                            {supplier.name}
                          </span>
                          <span className="mt-0.5 block text-sm text-muted-foreground">
                            {supplier.taxIdentifier}
                          </span>
                        </span>
                        {selected ? (
                          <CheckIcon
                            className="size-5 shrink-0 text-primary"
                            aria-hidden="true"
                          />
                        ) : null}
                      </button>
                    );
                  })
                ) : (
                  <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                    {t("empty")}
                  </p>
                )}
              </div>
            </BottomSheetBody>
          </>
        ) : (
          <form onSubmit={submit} className="contents">
            <BottomSheetHeader className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("back")}
                disabled={busy}
                onClick={() => {
                  setMode("list");
                  setError(undefined);
                }}
              >
                <ArrowLeftIcon aria-hidden="true" />
              </Button>
              <BottomSheetTitle>
                {editingId ? t("editTitle") : t("createTitle")}
              </BottomSheetTitle>
              <span aria-hidden="true" className="size-12 md:size-11" />
            </BottomSheetHeader>
            <BottomSheetBody>
              <div className="grid gap-2">
                <Label htmlFor="expense-supplier-name">{t("name")}</Label>
                <Input
                  ref={nameInputRef}
                  id="expense-supplier-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  autoComplete="organization"
                  disabled={busy}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="expense-supplier-cif">{t("cif")}</Label>
                <Input
                  id="expense-supplier-cif"
                  value={taxIdentifier}
                  onChange={(event) => setTaxIdentifier(event.target.value)}
                  autoComplete="off"
                  autoCapitalize="characters"
                  disabled={busy}
                  required
                />
                {hasCountryPrefix(taxIdentifier) ? (
                  <p className="text-sm text-muted-foreground">
                    {t("vatDetected")}
                  </p>
                ) : null}
              </div>
              {error ? (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              ) : null}
            </BottomSheetBody>
            <BottomSheetFooter>
              <Button type="submit" disabled={busy || !name || !taxIdentifier}>
                {busy ? <Spinner /> : null}
                {busy ? t("saving") : t("save")}
              </Button>
            </BottomSheetFooter>
          </form>
        )}
      </BottomSheetContent>
    </BottomSheet>
  );
}

function hasCountryPrefix(value: string): boolean {
  const compact = value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/^(CODFISCAL|CUI|CIF|VAT|CF)/, "");
  return /^[A-Z]{2}[A-Z0-9]/.test(compact);
}
