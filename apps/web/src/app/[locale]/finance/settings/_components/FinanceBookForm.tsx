"use client";

import { ApiError, v1 } from "@repo/api-shared";
import {
  Alert,
  AlertDescription,
  Button,
  FieldGroup,
  Spinner,
} from "@repo/ui/components";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState } from "react";
import { FormProvider } from "react-hook-form";
import { FormField } from "@/components/form/FormField";
import { FormInput } from "@/components/form/controls";
import { useZodForm } from "@/lib/form/use-zod-form";
import {
  createFinanceBook,
  updateFinanceBook,
} from "../_lib/finance-books-api";

type Values = v1.finance.UpdateFinanceBookInput;

export function FinanceBookForm({
  type,
  book,
  disabled,
  onSaved,
}: {
  type: v1.finance.FinanceBookType;
  book?: v1.finance.FinanceBook;
  disabled: boolean;
  onSaved: (book: v1.finance.FinanceBook) => void;
}) {
  const t = useTranslations("finance.configuration");
  const bookLabels = useTranslations("finance.books");
  const locale = useLocale();
  const router = useRouter();
  const headingId = useId();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<"saveFailed" | "conflict" | null>(null);
  const form = useZodForm<Values, Values>(
    v1.finance.updateFinanceBookInputSchema,
    {
      defaultValues: {
        names: { ro: book?.names.ro ?? "", en: book?.names.en ?? "" },
      },
      labelFor: (path) =>
        path === "names.ro" ? t("romanianName") : t("englishName"),
    },
  );
  const saving = form.formState.isSubmitting;
  async function onSubmit(values: Values) {
    setSaved(false);
    setError(null);
    try {
      const updated = book
        ? await updateFinanceBook(book.id, values)
        : await createFinanceBook({ type, ...values });
      onSaved(updated);
      form.reset({
        names: { ro: updated.names.ro, en: updated.names.en ?? "" },
      });
      setSaved(true);
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.status === 409
          ? "conflict"
          : "saveFailed",
      );
    }
  }
  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-5 border-t border-border pt-6"
    >
      <header>
        <h2 id={headingId} className="break-words text-base font-medium">
          {book ? v1.finance.financeBookName(book, locale) : bookLabels(type)}
        </h2>
      </header>
      <FormProvider {...form}>
        <form
          noValidate
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex flex-col gap-5"
          aria-label={bookLabels(type)}
        >
          <FieldGroup className="grid items-start gap-5 sm:grid-cols-2">
            <FormField name="names.ro" label={t("romanianName")} required>
              <FormInput
                autoComplete="off"
                maxLength={200}
                disabled={disabled || saving}
              />
            </FormField>
            <FormField name="names.en" label={t("englishName")}>
              <FormInput
                autoComplete="off"
                maxLength={200}
                disabled={disabled || saving}
              />
            </FormField>
          </FieldGroup>
          {!book && type === "COMPANY" ? (
            <p className="text-sm text-muted-foreground">{t("companySetup")}</p>
          ) : null}
          {disabled ? (
            <p className="text-sm text-muted-foreground">{t("companyFirst")}</p>
          ) : null}
          {saved && !form.formState.isDirty ? (
            <p role="status" className="text-sm text-muted-foreground">
              {t("saved")}
            </p>
          ) : null}
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{t(error)}</AlertDescription>
            </Alert>
          ) : null}
          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={
                disabled || saving || (!!book && !form.formState.isDirty)
              }
            >
              {saving ? <Spinner /> : null}
              {saving ? t("saving") : book ? t("save") : t("create")}
            </Button>
          </div>
        </form>
      </FormProvider>
    </section>
  );
}
