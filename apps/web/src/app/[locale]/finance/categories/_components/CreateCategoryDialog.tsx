"use client";

import { ApiError, v1 } from "@repo/api-shared";
import {
  Alert,
  AlertDescription,
  BottomSheet,
  BottomSheetBody,
  BottomSheetClose,
  BottomSheetContent,
  BottomSheetDescription,
  BottomSheetFooter,
  BottomSheetHeader,
  BottomSheetTitle,
  BottomSheetTrigger,
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components";
import { PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useState, type FormEvent } from "react";

import { webApi } from "@/lib/api";

type CategoryKind = v1.finance.FinancialCategoryKind;

const NO_PARENT = "none";

export function CreateCategoryDialog({
  categories,
}: {
  categories: v1.finance.FinancialCategory[];
}) {
  const t = useTranslations("finance");
  const router = useRouter();
  const nameId = useId();
  const kindId = useId();
  const parentId = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<CategoryKind>("EXPENSE");
  const [parentCategoryId, setParentCategoryId] = useState(NO_PARENT);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<
    { kind: "success" | "error"; message: string } | undefined
  >();

  function changeOpen(nextOpen: boolean) {
    if (busy) return;
    setOpen(nextOpen);
    if (!nextOpen) setFeedback(undefined);
  }

  async function createCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(undefined);
    const input = v1.finance.createFinancialCategoryInputSchema.safeParse({
      name,
      kind,
      parentCategoryId:
        parentCategoryId === NO_PARENT ? null : parentCategoryId,
    });

    if (!input.success) {
      setFeedback({
        kind: "error",
        message: t("categories.create.error"),
      });
      return;
    }

    setBusy(true);
    try {
      await webApi.fetch(
        v1.finance.ROUTES.categories.create,
        v1.finance.financialCategorySchema,
        {
          method: "POST",
          json: input.data,
        },
      );
      setName("");
      setKind("EXPENSE");
      setParentCategoryId(NO_PARENT);
      setFeedback({
        kind: "success",
        message: t("categories.create.success"),
      });
      router.refresh();
    } catch (error) {
      setFeedback({
        kind: "error",
        message:
          error instanceof ApiError
            ? error.message
            : t("feedback.genericError"),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet open={open} onOpenChange={changeOpen}>
      <BottomSheetTrigger render={<Button type="button" />}>
        <PlusIcon data-icon="inline-start" />
        {t("categories.createButton")}
      </BottomSheetTrigger>
      <BottomSheetContent>
        <form onSubmit={createCategory} className="contents">
          <BottomSheetHeader>
            <BottomSheetTitle>{t("categories.create.title")}</BottomSheetTitle>
            <BottomSheetDescription>
              {t("categories.create.description")}
            </BottomSheetDescription>
          </BottomSheetHeader>

          <BottomSheetBody>
            {feedback ? (
              <Alert
                variant={feedback.kind === "error" ? "destructive" : "default"}
              >
                <AlertDescription>{feedback.message}</AlertDescription>
              </Alert>
            ) : null}

            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor={nameId}>{t("categories.create.name")}</Label>
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
                <Label id={kindId}>{t("categories.create.kind")}</Label>
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
                <Label id={parentId}>{t("categories.create.parent")}</Label>
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
                      {t("categories.create.noParent")}
                    </SelectItem>
                    {categories
                      .filter((category) => category.isActive)
                      .map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </BottomSheetBody>

          <BottomSheetFooter>
            <BottomSheetClose
              render={
                <Button type="button" variant="outline" disabled={busy} />
              }
            >
              {t("common.cancel")}
            </BottomSheetClose>
            <Button type="submit" disabled={busy}>
              {t("categories.create.submit")}
            </Button>
          </BottomSheetFooter>
        </form>
      </BottomSheetContent>
    </BottomSheet>
  );
}
