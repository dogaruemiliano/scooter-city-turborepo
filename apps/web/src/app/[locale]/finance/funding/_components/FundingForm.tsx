"use client";

import { v1 } from "@repo/api-shared";
import type { SupportedLocale } from "@repo/i18n";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Button,
  Input,
  InputGroup,
  InputGroupAddon,
  Label,
  Spinner,
} from "@repo/ui/components";
import { FileImageIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FormProvider, useWatch } from "react-hook-form";

import { FormField } from "@/components/form/FormField";
import {
  FormInput,
  FormSelect,
  FormTextarea,
} from "@/components/form/controls";
import { FormSummary } from "@/components/form/FormSummary";
import { localizePath, resolveRouteLocale } from "@/i18n/paths";
import { financeUserLabel } from "@/lib/finance-format";
import { useZodForm } from "@/lib/form/use-zod-form";
import { messageForError } from "../../expenses/_components/ExpenseForm";
import { FINANCE_PATHS } from "../../_lib/links";
import { FundingDestinationPicker } from "./FundingDestinationPicker";
import { FundingImpactPreview } from "./FundingImpactPreview";
import {
  createFunding,
  previewFunding,
  uploadFundingProof,
} from "../_lib/funding-api";
import {
  fundingFormDefaults,
  fundingFormSchema,
  toFundingInput,
  todayLocalDateOnly,
  type FundingFormValues,
} from "../_lib/funding-form";

const PREVIEW_DEBOUNCE_MS = 400;

export function FundingForm({
  book,
  accounts,
  currentUserId,
}: {
  book: v1.finance.FinanceBook;
  accounts: readonly v1.finance.LedgerAccount[];
  currentUserId: string;
}) {
  const t = useTranslations("finance.funding");
  const tErrors = useTranslations("finance.errors");
  const locale = resolveRouteLocale(useLocale());
  const router = useRouter();
  const associates = useMemo(
    () =>
      book.members.flatMap((member) =>
        member.associate ? [member.associate] : [],
      ),
    [book.members],
  );
  const destinations = useMemo(
    () =>
      accounts.filter(
        (account) =>
          account.bookId === book.id &&
          account.isActive &&
          ["BANK", "CASH_REGISTER", "COMPANY_CASH_CUSTODY"].includes(
            account.role,
          ),
      ),
    [accounts, book.id],
  );
  const defaultDestination =
    destinations.find(
      (account) => account.role === "BANK" && account.isDefault,
    ) ??
    destinations.find((account) => account.role === "BANK") ??
    destinations[0];
  const defaultAssociateId = associates.some(
    (associate) => associate.id === currentUserId,
  )
    ? currentUserId
    : "";

  const form = useZodForm<FundingFormValues, FundingFormValues>(
    fundingFormSchema,
    {
      defaultValues: fundingFormDefaults({
        associateId: defaultAssociateId,
        destinationAccountId: defaultDestination?.id ?? "",
        today: todayLocalDateOnly(),
      }),
      labelFor: (path) => path,
    },
  );
  const values = useWatch({ control: form.control }) as FundingFormValues;
  const [plan, setPlan] = useState<v1.finance.PostingPlan>();
  const [previewPending, setPreviewPending] = useState(false);
  const [previewError, setPreviewError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [proofToken, setProofToken] = useState<string>();
  const [proofName, setProofName] = useState<string>();
  const [proofPreview, setProofPreview] = useState<string>();
  const [proofUploading, setProofUploading] = useState(false);
  const proofInputRef = useRef<HTMLInputElement>(null);
  const [proofError, setProofError] = useState<string>();
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const associateNames = useMemo(
    () =>
      new Map(
        associates.map((associate) => [
          associate.id,
          financeUserLabel(associate),
        ]),
      ),
    [associates],
  );

  const refreshPreview = useCallback(
    async (signal?: AbortSignal) => {
      const parsed = fundingFormSchema.safeParse(form.getValues());
      if (!parsed.success) {
        setPlan(undefined);
        setPreviewError(undefined);
        return;
      }
      setPreviewPending(true);
      setPreviewError(undefined);
      try {
        setPlan(
          await previewFunding(toFundingInput(book.id, parsed.data), signal),
        );
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        setPlan(undefined);
        setPreviewError(messageForError(error, tErrors));
      } finally {
        setPreviewPending(false);
      }
    },
    [book.id, form, tErrors],
  );

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(
      () => void refreshPreview(controller.signal),
      PREVIEW_DEBOUNCE_MS,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [refreshPreview, values]);

  useEffect(
    () => () => {
      if (proofPreview) URL.revokeObjectURL(proofPreview);
    },
    [proofPreview],
  );

  async function selectProof(file: File | null) {
    if (!file) return;
    if (proofPreview) URL.revokeObjectURL(proofPreview);
    setProofPreview(URL.createObjectURL(file));
    setProofName(file.name);
    setProofToken(undefined);
    setProofError(undefined);
    setProofUploading(true);
    try {
      setProofToken(await uploadFundingProof(file));
    } catch {
      setProofError(t("proof.uploadFailed"));
    } finally {
      setProofUploading(false);
    }
  }

  function removeProof() {
    if (proofPreview) URL.revokeObjectURL(proofPreview);
    setProofPreview(undefined);
    setProofName(undefined);
    setProofToken(undefined);
    setProofError(undefined);
  }

  async function onSubmit(submitted: FundingFormValues) {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const operation = await createFunding(
        {
          ...toFundingInput(book.id, submitted),
          ...(proofToken ? { proofUploadToken: proofToken } : {}),
        },
        idempotencyKey,
      );
      router.push(localizePath(FINANCE_PATHS.operation(operation.id), locale));
      router.refresh();
    } catch (error) {
      setSubmitError(messageForError(error, tErrors));
    } finally {
      setSubmitting(false);
    }
  }

  const providerName =
    associateNames.get(values.associateId) ?? t("advanced.chooseProvider");
  const typeName = t(`types.${values.type}`);

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(19rem,22rem)]">
          <div className="flex min-w-0 flex-col">
            <section className="flex flex-col gap-6 pb-8">
              <FormField name="amount" label={t("fields.amount")} required>
                <InputGroup className="h-20 md:h-20">
                  <FormInput
                    autoFocus
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0.00"
                    data-slot="input-group-control"
                    className="h-full rounded-none border-0 bg-transparent px-4 text-4xl font-semibold tabular-nums shadow-none ring-0 focus-visible:border-transparent focus-visible:ring-0 md:h-full md:px-5 md:text-4xl"
                  />
                  <InputGroupAddon className="border-l border-border px-4 text-base text-foreground md:px-5">
                    {book.functionalCurrency}
                  </InputGroupAddon>
                </InputGroup>
              </FormField>

              <FormField
                name="destinationAccountId"
                label={t("fields.destination")}
                required
              >
                <FundingDestinationPicker
                  accounts={destinations}
                  labelFor={(account) => destinationCopy(account, t)}
                />
              </FormField>
            </section>

            <section className="flex flex-col gap-3 border-t border-border py-8">
              <div className="flex flex-col gap-1">
                <h2 className="text-base font-medium">{t("proof.title")}</h2>
                <p className="text-sm text-muted-foreground">
                  {t("proof.description")}
                </p>
              </div>
              <div className="relative overflow-hidden rounded-lg border border-border bg-background">
                <Input
                  ref={proofInputRef}
                  id="funding-proof"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  disabled={proofUploading || submitting}
                  onChange={(event) => {
                    void selectProof(event.target.files?.[0] ?? null);
                    event.currentTarget.value = "";
                  }}
                />
                {proofPreview ? (
                  <div className="flex min-h-20 flex-col gap-3 p-3 sm:flex-row sm:items-center">
                    {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview. */}
                    <img
                      src={proofPreview}
                      alt=""
                      className="size-16 shrink-0 rounded-lg object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {proofName}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {proofUploading
                          ? t("proof.uploading")
                          : proofToken
                            ? t("proof.ready")
                            : t("proof.uploadFailed")}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={proofUploading || submitting}
                        onClick={() => proofInputRef.current?.click()}
                      >
                        {t("proof.replace")}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={removeProof}
                      >
                        <Trash2Icon aria-hidden="true" /> {t("proof.remove")}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Label
                    htmlFor="funding-proof"
                    className="flex min-h-20 cursor-pointer items-center gap-4 p-3 transition-colors duration-fast ease-standard hover:bg-muted/50 sm:px-4"
                  >
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <FileImageIcon className="size-5" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">
                        {t("proof.add")}
                      </span>
                      <span className="mt-1 block text-xs font-normal text-muted-foreground">
                        {t("proof.formats")}
                      </span>
                    </span>
                  </Label>
                )}
              </div>
              {proofError ? (
                <p role="alert" className="text-sm text-destructive">
                  {proofError}
                </p>
              ) : null}
            </section>

            <section className="grid gap-4 border-t border-border py-8 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
              <FormField name="reference" label={t("fields.reference")}>
                <FormInput placeholder={t("referencePlaceholder")} />
              </FormField>
              <FormField name="notes" label={t("fields.notes")}>
                <FormTextarea placeholder={t("notesPlaceholder")} rows={3} />
              </FormField>
            </section>

            <section className="border-t border-border">
              <Accordion defaultValue={defaultAssociateId ? [] : ["advanced"]}>
                <AccordionItem value="advanced" className="border-0">
                  <AccordionTrigger className="py-4 hover:no-underline md:py-4">
                    <span className="flex min-w-0 flex-col gap-1">
                      <span>{t("advanced.title")}</span>
                      <span className="truncate text-xs font-normal text-muted-foreground">
                        {providerName} · {values.occurredAt} · {typeName}
                      </span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="grid gap-4 pt-3 sm:grid-cols-2">
                    <FormField
                      name="associateId"
                      label={t("fields.provider")}
                      required
                    >
                      <FormSelect
                        options={associates.map((associate) => ({
                          value: associate.id,
                          label: financeUserLabel(associate),
                        }))}
                        placeholder={t("advanced.chooseProvider")}
                      />
                    </FormField>
                    <FormField
                      name="occurredAt"
                      label={t("fields.date")}
                      required
                    >
                      <FormInput type="date" />
                    </FormField>
                    <FormField
                      name="type"
                      label={t("fields.type")}
                      required
                      className="sm:col-span-2"
                    >
                      <FormSelect
                        options={v1.finance.ASSOCIATE_FUNDING_TYPES.map(
                          (type) => ({
                            value: type,
                            label: t(`types.${type}`),
                          }),
                        )}
                      />
                    </FormField>
                    <p className="text-sm text-muted-foreground sm:col-span-2">
                      {t(`typeHints.${values.type}`)}
                    </p>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </section>

            <div className="pt-4">
              <FormSummary title={t("validationTitle")} />
              {submitError ? (
                <p role="alert" className="text-sm text-destructive">
                  {submitError}
                </p>
              ) : null}
            </div>

            <footer className="mt-4 flex flex-col-reverse gap-2 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
                disabled={submitting}
              >
                {t("cancel")}
              </Button>
              <Button
                type="submit"
                disabled={submitting || proofUploading || Boolean(proofError)}
              >
                {submitting ? <Spinner /> : null}
                {submitting ? t("submitting") : t("submit")}
              </Button>
            </footer>
          </div>

          <div className="border-t border-border pt-8 lg:sticky lg:top-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8">
            <FundingImpactPreview
              plan={plan}
              currency={book.functionalCurrency}
              locale={locale as SupportedLocale}
              providerName={providerName}
              type={values.type}
              pending={previewPending}
              error={previewError}
              onRetry={() => void refreshPreview()}
            />
          </div>
        </div>
      </form>
    </FormProvider>
  );
}

function destinationCopy(
  account: v1.finance.LedgerAccount,
  t: (key: string, values?: Record<string, string>) => string,
): { title: string; detail: string } {
  if (account.role === "BANK") {
    return { title: t("destination.bank"), detail: account.name };
  }
  if (account.role === "CASH_REGISTER") {
    return { title: t("destination.cashRegister"), detail: account.name };
  }
  const holder = account.associate
    ? financeUserLabel(account.associate)
    : account.name;
  return {
    title: t("destination.custody"),
    detail: holder,
  };
}
