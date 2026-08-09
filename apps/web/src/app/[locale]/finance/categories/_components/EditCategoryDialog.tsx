"use client";

import { ApiError, v1 } from "@repo/api-shared";
import {
  Alert,
  AlertDescription,
  BottomSheet,
  BottomSheetBody,
  BottomSheetClose,
  BottomSheetContent,
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
  Switch,
} from "@repo/ui/components";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  useId,
  useState,
  type KeyboardEvent,
  type FormEvent,
  type ReactElement,
  type ReactNode,
} from "react";

import { webApi } from "@/lib/api";
import {
  CATEGORY_ICON_COMPONENTS,
  CATEGORY_ICON_NAMES,
} from "../../_lib/category-icons";
import { activeCategoryParentOptions } from "../_lib/category-edit";

type CategoryKind = v1.finance.FinancialCategoryKind;

const NO_PARENT = "none";
const NO_ICON = "none";
const CATEGORY_KIND_OPTIONS = ["INCOME", "EXPENSE"] as const;

const categoryKindIndicatorClassNames = {
  INCOME: "translate-x-0 bg-success",
  EXPENSE: "translate-x-full bg-destructive",
} as const satisfies Record<CategoryKind, string>;

const categoryKindLabelClassNames = {
  INCOME: {
    idle: "text-success",
    selected: "text-success-foreground",
  },
  EXPENSE: {
    idle: "text-destructive",
    selected: "text-destructive-foreground",
  },
} as const satisfies Record<CategoryKind, { idle: string; selected: string }>;

function CategoryKindSwitch({
  value,
  disabled,
  label,
  getOptionLabel,
  onChange,
}: {
  value: CategoryKind;
  disabled: boolean;
  label: string;
  getOptionLabel: (kind: CategoryKind) => string;
  onChange: (kind: CategoryKind) => void;
}) {
  function selectWithKeyboard(
    event: KeyboardEvent<HTMLButtonElement>,
    kind: CategoryKind,
  ) {
    const currentIndex = CATEGORY_KIND_OPTIONS.indexOf(kind);
    const lastIndex = CATEGORY_KIND_OPTIONS.length - 1;
    let nextIndex: number | undefined;

    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = currentIndex === 0 ? lastIndex : currentIndex - 1;
    } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = currentIndex === lastIndex ? 0 : currentIndex + 1;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = lastIndex;
    }

    if (nextIndex === undefined) return;

    event.preventDefault();
    const nextKind = CATEGORY_KIND_OPTIONS[nextIndex];
    if (!nextKind) return;

    onChange(nextKind);
    event.currentTarget.parentElement
      ?.querySelectorAll<HTMLButtonElement>("[role='radio']")
      [nextIndex]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="relative grid min-h-12 w-full grid-cols-2 rounded-lg border border-input bg-muted p-1 outline-none focus-within:border-ring focus-within:ring-2 focus-within:ring-ring"
    >
      <span
        aria-hidden="true"
        className={`absolute inset-y-1 left-1 w-[calc((100%-var(--spacing-2))/2)] rounded-md transition-[transform,background-color] duration-normal ease-standard motion-reduce:transition-none ${categoryKindIndicatorClassNames[value]}`}
      />
      {CATEGORY_KIND_OPTIONS.map((kind) => (
        <button
          key={kind}
          type="button"
          role="radio"
          aria-checked={value === kind}
          tabIndex={value === kind ? 0 : -1}
          disabled={disabled}
          className={`relative z-raised min-h-10 rounded-md px-2 text-sm font-medium outline-none transition-colors duration-normal ease-standard focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:text-disabled-foreground motion-reduce:transition-none ${
            categoryKindLabelClassNames[kind][
              value === kind ? "selected" : "idle"
            ]
          }`}
          onClick={() => onChange(kind)}
          onKeyDown={(event) => selectWithKeyboard(event, kind)}
        >
          {getOptionLabel(kind)}
        </button>
      ))}
    </div>
  );
}

export function EditCategoryDialog({
  category,
  categories,
  trigger,
}: {
  category: v1.finance.FinancialCategory;
  categories: v1.finance.FinancialCategory[];
  trigger: ReactElement<{ children?: ReactNode }>;
}) {
  const t = useTranslations("finance");
  const router = useRouter();
  const nameId = useId();
  const kindId = useId();
  const iconId = useId();
  const parentId = useId();
  const statusId = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(category.name);
  const [kind, setKind] = useState<CategoryKind>(category.kind);
  const [icon, setIcon] = useState(category.icon ?? NO_ICON);
  const [parentCategoryId, setParentCategoryId] = useState(
    category.parentCategoryId ?? NO_PARENT,
  );
  const [isActive, setIsActive] = useState(category.isActive);
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
    setIcon(category.icon ?? NO_ICON);
    setParentCategoryId(category.parentCategoryId ?? NO_PARENT);
    setIsActive(category.isActive);
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
    const initialIcon = category.icon ?? NO_ICON;
    const input = v1.finance.updateFinancialCategoryInputSchema.safeParse({
      name,
      kind,
      isActive,
      ...(icon === initialIcon ? {} : { icon: icon === NO_ICON ? null : icon }),
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
    <BottomSheet open={open} onOpenChange={changeOpen}>
      <BottomSheetTrigger
        render={trigger}
        aria-label={`${t("categories.edit.trigger")}: ${category.name}`}
      >
        {trigger.props.children}
      </BottomSheetTrigger>
      <BottomSheetContent>
        <form onSubmit={updateCategory} className="contents">
          <BottomSheetHeader>
            <BottomSheetTitle>{t("categories.edit.title")}</BottomSheetTitle>
          </BottomSheetHeader>

          <BottomSheetBody>
            {feedback ? (
              <Alert
                variant={feedback.kind === "error" ? "destructive" : "default"}
              >
                <AlertDescription>{feedback.message}</AlertDescription>
              </Alert>
            ) : null}

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
              <CategoryKindSwitch
                value={kind}
                disabled={busy}
                label={t("categories.edit.kind")}
                getOptionLabel={(value) => t(`enums.categoryKinds.${value}`)}
                onChange={setKind}
              />
            </div>
            <div className="grid gap-2">
              <Label id={iconId}>{t("categories.edit.icon")}</Label>
              <Select
                value={icon}
                onValueChange={(value) => setIcon(String(value))}
                disabled={busy}
              >
                <SelectTrigger aria-labelledby={iconId} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_ICON}>
                    {t("categories.edit.noIcon")}
                  </SelectItem>
                  {CATEGORY_ICON_NAMES.map((name) => {
                    const Icon = CATEGORY_ICON_COMPONENTS[name];
                    return (
                      <SelectItem key={name} value={name}>
                        <Icon aria-hidden="true" className="size-4" />
                        {t(`categories.icons.${name}`)}
                      </SelectItem>
                    );
                  })}
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
            <div className="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-input bg-background px-3 py-2">
              <div className="grid gap-0.5">
                <Label htmlFor={statusId}>
                  {t("categories.columns.status")}
                </Label>
                <span className="text-xs text-muted-foreground">
                  {isActive ? t("common.active") : t("common.inactive")}
                </span>
              </div>
              <Switch
                id={statusId}
                checked={isActive}
                disabled={busy}
                onCheckedChange={setIsActive}
              />
            </div>
          </BottomSheetBody>

          <BottomSheetFooter className="sm:flex-row-reverse sm:justify-start">
            <Button type="submit" disabled={busy}>
              {busy
                ? t("categories.edit.submitting")
                : t("categories.edit.submit")}
            </Button>
            <BottomSheetClose
              render={
                <Button type="button" variant="outline" disabled={busy} />
              }
            >
              {t("common.cancel")}
            </BottomSheetClose>
          </BottomSheetFooter>
        </form>
      </BottomSheetContent>
    </BottomSheet>
  );
}
