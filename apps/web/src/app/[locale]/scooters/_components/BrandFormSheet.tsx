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
} from "@repo/ui/components";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactElement,
  type ReactNode,
} from "react";

import { webApi } from "@/lib/api";

const CODE_MAX_LENGTH = 6;

function suggestCode(name: string): string {
  return name
    .replace(/[^a-zA-Z]/g, "")
    .slice(0, 3)
    .toUpperCase();
}

export function BrandFormSheet({
  trigger,
  brand,
  onSaved,
}: {
  trigger: ReactElement<{ children?: ReactNode }>;
  brand?: v1.scooterBrands.ScooterBrand;
  onSaved?: (brand: v1.scooterBrands.ScooterBrand) => void;
}) {
  const t = useTranslations("scooters");
  const router = useRouter();
  const isEdit = brand !== undefined;
  const nameId = useId();
  const codeId = useId();
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(brand?.name ?? "");
  const [code, setCode] = useState(brand?.code ?? "");
  const [codeTouched, setCodeTouched] = useState(isEdit);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [feedback, setFeedback] = useState<
    { kind: "success" | "error"; message: string } | undefined
  >();

  function resetForm() {
    setName(brand?.name ?? "");
    setCode(brand?.code ?? "");
    setCodeTouched(isEdit);
    setFeedback(undefined);
    setConfirmOpen(false);
  }

  function changeOpen(nextOpen: boolean) {
    if (busy) return;
    if (nextOpen) resetForm();
    setOpen(nextOpen);
    if (!nextOpen) resetForm();
  }

  function changeName(value: string) {
    setName(value);
    if (!codeTouched) {
      setCode(suggestCode(value));
    }
  }

  function changeCode(value: string) {
    setCodeTouched(true);
    setCode(value.toUpperCase());
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    setFeedback(undefined);

    if (isEdit && brand.scooterCount > 0) {
      setConfirmOpen(true);
      return;
    }

    void save();
  }

  async function save() {
    const schema = isEdit
      ? v1.scooterBrands.updateScooterBrandInputSchema
      : v1.scooterBrands.createScooterBrandInputSchema;
    const input = schema.safeParse({ name, code });
    if (!input.success) {
      setConfirmOpen(false);
      setFeedback({ kind: "error", message: t("brands.form.error") });
      return;
    }

    setBusy(true);
    try {
      const saved = isEdit
        ? await webApi.fetch(
            v1.scooterBrands.ROUTES.update(brand.id),
            v1.scooterBrands.scooterBrandSchema,
            { method: "PATCH", json: input.data },
          )
        : await webApi.fetch(
            v1.scooterBrands.ROUTES.create,
            v1.scooterBrands.scooterBrandSchema,
            { method: "POST", json: input.data },
          );
      setConfirmOpen(false);
      onSaved?.(saved);
      setOpen(false);
      router.refresh();
    } catch (error) {
      setConfirmOpen(false);
      setFeedback({
        kind: "error",
        message:
          error instanceof ApiError ? error.message : t("brands.form.error"),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet open={open} onOpenChange={changeOpen}>
      <BottomSheetTrigger
        render={trigger}
        aria-label={
          isEdit ? `${t("brands.edit.trigger")}: ${brand.name}` : undefined
        }
      >
        {trigger.props.children}
      </BottomSheetTrigger>
      <BottomSheetContent initialFocus={nameInputRef}>
        <form onSubmit={submit} className="contents">
          <BottomSheetHeader>
            <BottomSheetTitle>
              {isEdit ? t("brands.edit.title") : t("brands.create.title")}
            </BottomSheetTitle>
            {isEdit ? (
              <BottomSheetDescription>
                {t("brands.edit.description")}
              </BottomSheetDescription>
            ) : null}
          </BottomSheetHeader>

          <BottomSheetBody>
            {feedback ? (
              <Alert
                variant={feedback.kind === "error" ? "destructive" : "default"}
              >
                <AlertDescription>{feedback.message}</AlertDescription>
              </Alert>
            ) : null}

            {isEdit && brand.scooterCount > 0 ? (
              <Alert variant="destructive">
                <AlertDescription>
                  {t("brands.form.inUseWarning", { count: brand.scooterCount })}
                </AlertDescription>
              </Alert>
            ) : null}

            <div className="grid gap-2">
              <Label htmlFor={nameId}>{t("brands.form.name")}</Label>
              <Input
                ref={nameInputRef}
                id={nameId}
                value={name}
                onChange={(event) => changeName(event.target.value)}
                disabled={busy}
                autoComplete="off"
                autoCapitalize="words"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={codeId}>{t("brands.form.code")}</Label>
              <Input
                id={codeId}
                value={code}
                onChange={(event) => changeCode(event.target.value)}
                disabled={busy}
                autoComplete="off"
                maxLength={CODE_MAX_LENGTH}
                required
              />
            </div>
          </BottomSheetBody>

          <BottomSheetFooter className="sm:flex-row-reverse sm:justify-start">
            <Button type="submit" disabled={busy}>
              {isEdit ? t("brands.form.save") : t("brands.form.submit")}
            </Button>
            <BottomSheetClose
              render={
                <Button type="button" variant="outline" disabled={busy} />
              }
            >
              {t("actions.cancel")}
            </BottomSheetClose>
          </BottomSheetFooter>
        </form>
      </BottomSheetContent>

      {isEdit ? (
        <BottomSheet
          open={confirmOpen}
          onOpenChange={(nextOpen) => {
            if (!busy) setConfirmOpen(nextOpen);
          }}
        >
          <BottomSheetContent>
            <BottomSheetHeader>
              <BottomSheetTitle>{t("brands.confirm.title")}</BottomSheetTitle>
              <BottomSheetDescription>
                {t("brands.confirm.description")}
              </BottomSheetDescription>
            </BottomSheetHeader>
            <BottomSheetFooter className="sm:flex-row-reverse sm:justify-start">
              <Button type="button" disabled={busy} onClick={() => void save()}>
                {t("brands.confirm.confirm")}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setConfirmOpen(false)}
              >
                {t("actions.cancel")}
              </Button>
            </BottomSheetFooter>
          </BottomSheetContent>
        </BottomSheet>
      ) : null}
    </BottomSheet>
  );
}
