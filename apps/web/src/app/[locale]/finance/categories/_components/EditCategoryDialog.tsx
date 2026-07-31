"use client";

import { ApiError, v1 } from "@repo/api-shared";
import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components";
import { PencilIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useState, type FormEvent } from "react";

import { webApi } from "@/lib/api";
import { activeCategoryParentOptions } from "../_lib/category-edit";

type CategoryKind = v1.finance.FinancialCategoryKind;

const NO_PARENT = "none";

export function EditCategoryDialog({
  category,
  categories,
}: {
  category: v1.finance.FinancialCategory;
  categories: v1.finance.FinancialCategory[];
}) {
  const t = useTranslations("finance");
  const router = useRouter();
  const nameId = useId();
  const kindId = useId();
  const parentId = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(category.name);
  const [kind, setKind] = useState<CategoryKind>(category.kind);
  const [parentCategoryId, setParentCategoryId] = useState(
    category.parentCategoryId ?? NO_PARENT,
  );
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<
    { kind: "success" | "error"; message: string } | undefined
  >();
  const parentOptions = activeCategoryParentOptions(categories, category.id);
  const currentParent =
    category.parentCategoryId === null
      ? undefined
      : categories.find((item) => item.id === category.parentCategoryId);
  const currentParentIsUnavailable =
    currentParent !== undefined &&
    !parentOptions.some((item) => item.id === currentParent.id);

  function resetForm() {
    setName(category.name);
    setKind(category.kind);
    setParentCategoryId(category.parentCategoryId ?? NO_PARENT);
    setFeedback(undefined);
  }

  function changeOpen(nextOpen: boolean) {
    if (busy) return;
    if (nextOpen) resetForm();
    setOpen(nextOpen);
    if (!nextOpen) setFeedback(undefined);
  }

  async function updateCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(undefined);
    const initialParentCategoryId = category.parentCategoryId ?? NO_PARENT;
    const input = v1.finance.updateFinancialCategoryInputSchema.safeParse({
      name,
      kind,
      ...(parentCategoryId === initialParentCategoryId
        ? {}
        : {
            parentCategoryId:
              parentCategoryId === NO_PARENT ? null : parentCategoryId,
          }),
    });

    if (!input.success) {
      setFeedback({
        kind: "error",
        message: t("categories.edit.error"),
      });
      return;
    }

    setBusy(true);
    try {
      await webApi.fetch(
        v1.finance.ROUTES.categories.update(category.id),
        v1.finance.financialCategorySchema,
        {
          method: "PATCH",
          json: input.data,
        },
      );
      setFeedback({
        kind: "success",
        message: t("categories.edit.success"),
      });
      router.refresh();
    } catch (error) {
      setFeedback({
        kind: "error",
        message:
          error instanceof ApiError
            ? `${t("categories.edit.error")} ${error.message}`
            : t("categories.edit.error"),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`${t("categories.edit.trigger")}: ${category.name}`}
          />
        }
      >
        <PencilIcon data-icon="inline-start" />
        {t("categories.edit.trigger")}
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={updateCategory} className="contents">
          <DialogHeader>
            <DialogTitle>{t("categories.edit.title")}</DialogTitle>
            <DialogDescription>
              {t("categories.edit.description")}
            </DialogDescription>
          </DialogHeader>

          {feedback ? (
            <Alert
              variant={feedback.kind === "error" ? "destructive" : "default"}
            >
              <AlertDescription>{feedback.message}</AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor={nameId}>{t("categories.edit.name")}</Label>
              <Input
                id={nameId}
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={busy}
                autoComplete="off"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label id={kindId}>{t("categories.edit.kind")}</Label>
              <Select
                value={kind}
                onValueChange={(value) => setKind(value as CategoryKind)}
                disabled={busy}
              >
                <SelectTrigger aria-labelledby={kindId} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {v1.finance.FINANCIAL_CATEGORY_KINDS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {t(`enums.categoryKinds.${value}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label id={parentId}>{t("categories.edit.parent")}</Label>
              <Select
                value={parentCategoryId}
                onValueChange={(value) => setParentCategoryId(String(value))}
                disabled={busy}
              >
                <SelectTrigger aria-labelledby={parentId} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_PARENT}>
                    {t("categories.edit.noParent")}
                  </SelectItem>
                  {currentParentIsUnavailable && currentParent ? (
                    <SelectItem value={currentParent.id} disabled>
                      {currentParent.name}
                    </SelectItem>
                  ) : null}
                  {parentOptions.map((parent) => (
                    <SelectItem key={parent.id} value={parent.id}>
                      {parent.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <DialogClose
              render={
                <Button type="button" variant="outline" disabled={busy} />
              }
            >
              {t("common.cancel")}
            </DialogClose>
            <Button type="submit" disabled={busy}>
              {busy
                ? t("categories.edit.submitting")
                : t("categories.edit.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
