"use client";

import { v1 } from "@repo/api-shared";
import {
  Badge,
  BottomSheet,
  BottomSheetBody,
  BottomSheetClose,
  BottomSheetContent,
  BottomSheetDescription,
  BottomSheetFooter,
  BottomSheetHeader,
  BottomSheetTitle,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input,
  Label,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
} from "@repo/ui/components";
import {
  BanknoteIcon,
  CoinsIcon,
  FileTextIcon,
  HandshakeIcon,
  ReceiptTextIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  useEffect,
  useId,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";

import {
  cancelScooterSale,
  getPersonalOwnerOptions,
  getScooterSaleDocument,
  prepareScooterSaleBill,
  recordScooterSalePayment,
  sellScooter,
  SCOOTER_SALE_BILL_CONTENT_TYPES,
  uploadScooterSaleBill,
} from "../_lib/scooter-sale-api";
import { ScooterBuyerSelect } from "./ScooterBuyerSelect";
import { FeedbackAlert } from "./ScooterCreateForm";
import { DatePartsField } from "@/components/DateField";

interface ScooterSalesSectionProps {
  scooter: v1.scooters.Scooter;
  financials: v1.finance.ScooterFinancials;
  companyWallets: v1.finance.WalletOption[];
}

interface MutationFeedback {
  kind: "success" | "error";
  title: string;
  messages: string[];
}

type SaleField = "buyerCounterpartyId" | "saleAmount" | "soldOn";
type PaymentField =
  | "amount"
  | "paidOn"
  | "companyWalletId"
  | "personalAmount"
  | "personalOwnerUserId";

export function ScooterSalesSection({
  scooter,
  financials,
  companyWallets,
}: ScooterSalesSectionProps) {
  const t = useTranslations("scooters.sales");
  const locale = useLocale();
  const router = useRouter();
  const [feedback, setFeedback] = useState<MutationFeedback | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [sellOpen, setSellOpen] = useState(false);
  const [sellDialogKey, setSellDialogKey] = useState(0);
  const [sellDialogError, setSellDialogError] =
    useState<MutationFeedback | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentDialogKey, setPaymentDialogKey] = useState(0);
  const [paymentDialogError, setPaymentDialogError] =
    useState<MutationFeedback | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);

  const sale = financials.sale;
  const canSell = !sale;
  const canRecordPayment =
    sale && (sale.status === "OPEN" || sale.status === "PARTIALLY_PAID");
  const canCancel =
    sale && sale.status !== "CANCELLED" && sale.paidAmount === "0.00";

  async function sell(
    input: v1.finance.CreateScooterSaleInput,
  ): Promise<boolean> {
    setBusyAction("sale:create");
    setFeedback(null);
    setSellDialogError(null);
    try {
      await sellScooter(input);
      setFeedback({
        kind: "success",
        title: t("feedback.saleCreatedTitle"),
        messages: [t("feedback.saleCreatedMessage")],
      });
      router.refresh();
      return true;
    } catch (error) {
      const next = mutationError(t("feedback.saleErrorTitle"), error, t);
      setFeedback(next);
      setSellDialogError(next);
      return false;
    } finally {
      setBusyAction(null);
    }
  }

  async function recordPayment(
    saleId: string,
    input: v1.finance.RecordScooterSalePaymentInput,
  ): Promise<boolean> {
    setBusyAction("sale:payment");
    setFeedback(null);
    setPaymentDialogError(null);
    try {
      await recordScooterSalePayment(saleId, input);
      setFeedback({
        kind: "success",
        title: t("feedback.paymentCreatedTitle"),
        messages: [t("feedback.paymentCreatedMessage")],
      });
      router.refresh();
      return true;
    } catch (error) {
      const next = mutationError(t("feedback.paymentErrorTitle"), error, t);
      setFeedback(next);
      setPaymentDialogError(next);
      return false;
    } finally {
      setBusyAction(null);
    }
  }

  async function cancelSale(saleId: string): Promise<boolean> {
    setBusyAction("sale:cancel");
    setFeedback(null);
    try {
      await cancelScooterSale(saleId);
      setFeedback({
        kind: "success",
        title: t("feedback.cancelSuccessTitle"),
        messages: [],
      });
      router.refresh();
      return true;
    } catch (error) {
      setFeedback(mutationError(t("feedback.cancelErrorTitle"), error, t));
      return false;
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <section aria-labelledby="sales-title" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="sales-title" className="text-xl font-semibold">
          {t("title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>

      {feedback ? <FeedbackAlert feedback={feedback} /> : null}

      <Card>
        <CardHeader>
          <CardTitle>{t("costs.title")}</CardTitle>
          <CardDescription>{t("costs.description")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {financials.costBreakdown.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("costs.empty")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {financials.costBreakdown.map((row) => (
                <li
                  key={`${row.categoryId ?? "uncategorized"}-${row.currency}`}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span className="min-w-0 truncate">
                    {row.categoryName ?? t("costs.uncategorized")}
                  </span>
                  <span className="shrink-0 font-medium">
                    {formatMoney(
                      row.totalAllocatedGrossAmount,
                      row.currency,
                      locale,
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {financials.totalCost.length > 0 ? (
            <div className="flex flex-col gap-1 border-t border-border pt-3">
              {financials.totalCost.map((total) => (
                <div
                  key={total.currency}
                  className="flex items-center justify-between gap-2 text-sm font-semibold"
                >
                  <span>{t("costs.total")}</span>
                  <span>
                    {formatMoney(total.amount, total.currency, locale)}
                  </span>
                </div>
              ))}
            </div>
          ) : null}

          <div className="rounded-lg border border-dashed border-border p-3">
            <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <CoinsIcon aria-hidden="true" className="size-4 shrink-0" />
              {t("costs.rentalIncomeTitle")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("costs.rentalIncomeDescription")}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>{t("receivable.title")}</CardTitle>
              <CardDescription>
                {sale ? null : t("receivable.empty")}
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              {canSell ? (
                <Button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={() => {
                    setSellDialogError(null);
                    setSellDialogKey((current) => current + 1);
                    setSellOpen(true);
                  }}
                >
                  <HandshakeIcon data-icon="inline-start" />
                  {t("actions.sell")}
                </Button>
              ) : null}
              {canRecordPayment ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busyAction !== null}
                  onClick={() => {
                    setPaymentDialogError(null);
                    setPaymentDialogKey((current) => current + 1);
                    setPaymentOpen(true);
                  }}
                >
                  <BanknoteIcon data-icon="inline-start" />
                  {t("actions.recordPayment")}
                </Button>
              ) : null}
              {canCancel ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busyAction !== null}
                  onClick={() => setCancelOpen(true)}
                >
                  {t("actions.cancelSale")}
                </Button>
              ) : null}
            </div>
          </div>
        </CardHeader>
        {sale ? (
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2">
              <ReceivableField
                label={t("receivable.buyer")}
                value={sale.buyer?.label ?? sale.buyerCounterpartyId}
              />
              <ReceivableField
                label={t("receivable.status")}
                value={<SaleStatusBadge status={sale.status} />}
              />
              <ReceivableField
                label={t("receivable.saleAmount")}
                value={formatMoney(sale.saleAmount, sale.currency, locale)}
              />
              <ReceivableField
                label={t("receivable.paidAmount")}
                value={formatMoney(sale.paidAmount, sale.currency, locale)}
              />
              <ReceivableField
                label={t("receivable.paidBusinessAmount")}
                value={formatMoney(
                  sale.paidBusinessAmount,
                  sale.currency,
                  locale,
                )}
              />
              <ReceivableField
                label={t("receivable.paidPersonalAmount")}
                value={formatMoney(
                  sale.paidPersonalAmount,
                  sale.currency,
                  locale,
                )}
              />
              <ReceivableField
                label={t("receivable.outstandingAmount")}
                value={formatMoney(
                  sale.outstandingAmount,
                  sale.currency,
                  locale,
                )}
              />
              <ReceivableField
                label={t("receivable.soldOn")}
                value={formatDate(sale.soldOn, locale)}
              />
            </dl>
          </CardContent>
        ) : null}
      </Card>

      {sale ? <ScooterSaleBillCard saleId={sale.id} /> : null}

      <SellScooterDialog
        key={`sell-scooter-${sellDialogKey}`}
        scooter={scooter}
        open={sellOpen}
        busy={busyAction === "sale:create"}
        errorFeedback={sellDialogError}
        onOpenChange={setSellOpen}
        onSubmit={sell}
      />
      {sale ? (
        <RecordScooterPaymentDialog
          key={`sale-payment-${paymentDialogKey}`}
          sale={sale}
          companyWallets={companyWallets}
          open={paymentOpen}
          busy={busyAction === "sale:payment"}
          errorFeedback={paymentDialogError}
          onOpenChange={setPaymentOpen}
          onSubmit={(input) => recordPayment(sale.id, input)}
        />
      ) : null}
      {sale ? (
        <CancelSaleDialog
          open={cancelOpen}
          busy={busyAction === "sale:cancel"}
          onOpenChange={setCancelOpen}
          onConfirm={() => cancelSale(sale.id)}
        />
      ) : null}
    </section>
  );
}

function SellScooterDialog({
  scooter,
  open,
  busy,
  errorFeedback,
  onOpenChange,
  onSubmit,
}: {
  scooter: v1.scooters.Scooter;
  open: boolean;
  busy: boolean;
  errorFeedback: MutationFeedback | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: v1.finance.CreateScooterSaleInput) => Promise<boolean>;
}) {
  const t = useTranslations("scooters.sales");
  const locale = useLocale();
  const formId = useId();
  const [buyerCounterpartyId, setBuyerCounterpartyId] = useState("");
  const [saleAmount, setSaleAmount] = useState("");
  const [soldOn, setSoldOn] = useState(todayDateOnly);
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Partial<Record<SaleField, string>>>({});

  function changeOpen(nextOpen: boolean) {
    if (busy) return;
    onOpenChange(nextOpen);
    if (nextOpen) {
      setBuyerCounterpartyId("");
      setSaleAmount("");
      setSoldOn(todayDateOnly());
      setNotes("");
      setErrors({});
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = v1.finance.createScooterSaleInputSchema.safeParse({
      scooterId: scooter.id,
      buyerCounterpartyId,
      saleAmount,
      soldOn,
      notes: notes || undefined,
    });

    if (!result.success) {
      setErrors(saleErrors(result.error.issues, buyerCounterpartyId, t));
      return;
    }

    if (await onSubmit(result.data)) {
      onOpenChange(false);
    }
  }

  return (
    <BottomSheet open={open} onOpenChange={changeOpen}>
      <BottomSheetContent className="lg:w-xl">
        <form
          noValidate
          onSubmit={(event) => void submit(event)}
          className="contents"
        >
          <BottomSheetHeader>
            <BottomSheetTitle>{t("dialogs.sell.title")}</BottomSheetTitle>
            <BottomSheetDescription>
              {t("dialogs.sell.description")}
            </BottomSheetDescription>
          </BottomSheetHeader>
          <BottomSheetBody>
            {errorFeedback ? <FeedbackAlert feedback={errorFeedback} /> : null}
            <FieldGroup>
              <Field
                data-invalid={Boolean(errors.buyerCounterpartyId) || undefined}
              >
                <ScooterBuyerSelect
                  id={`${formId}-buyer`}
                  value={buyerCounterpartyId}
                  disabled={busy}
                  error={errors.buyerCounterpartyId}
                  onChange={(id) => {
                    setBuyerCounterpartyId(id);
                    setErrors((current) => ({
                      ...current,
                      buyerCounterpartyId: undefined,
                    }));
                  }}
                />
              </Field>
              <Field data-invalid={Boolean(errors.saleAmount) || undefined}>
                <FieldLabel htmlFor={`${formId}-sale-amount`}>
                  {t("fields.saleAmount")}
                </FieldLabel>
                <Input
                  id={`${formId}-sale-amount`}
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  value={saleAmount}
                  disabled={busy}
                  aria-invalid={Boolean(errors.saleAmount) || undefined}
                  onChange={(event) => setSaleAmount(event.target.value)}
                />
                <FieldError>{errors.saleAmount}</FieldError>
              </Field>
              <Field data-invalid={Boolean(errors.soldOn) || undefined}>
                <FieldLabel htmlFor={`${formId}-sold-on-day`}>
                  {t("fields.soldOn")}
                </FieldLabel>
                <DatePartsField
                  baseId={`${formId}-sold-on`}
                  label={t("fields.soldOn")}
                  locale={locale}
                  value={soldOn}
                  disabled={busy}
                  invalid={Boolean(errors.soldOn)}
                  onChange={setSoldOn}
                />
                <FieldError>{errors.soldOn}</FieldError>
              </Field>
              <Field>
                <FieldLabel htmlFor={`${formId}-notes`}>
                  {t("fields.notes")}
                </FieldLabel>
                <Textarea
                  id={`${formId}-notes`}
                  value={notes}
                  disabled={busy}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </Field>
            </FieldGroup>
          </BottomSheetBody>
          <BottomSheetFooter className="sm:flex-row-reverse sm:justify-start">
            <Button type="submit" disabled={busy}>
              {busy ? t("actions.selling") : t("actions.sell")}
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
    </BottomSheet>
  );
}

function RecordScooterPaymentDialog({
  sale,
  companyWallets,
  open,
  busy,
  errorFeedback,
  onOpenChange,
  onSubmit,
}: {
  sale: v1.finance.ScooterSale;
  companyWallets: v1.finance.WalletOption[];
  open: boolean;
  busy: boolean;
  errorFeedback: MutationFeedback | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (
    input: v1.finance.RecordScooterSalePaymentInput,
  ) => Promise<boolean>;
}) {
  const t = useTranslations("scooters.sales");
  const locale = useLocale();
  const formId = useId();
  const [amount, setAmount] = useState(sale.outstandingAmount);
  const [splitWithOwner, setSplitWithOwner] = useState(false);
  const [personalAmount, setPersonalAmount] = useState("0.00");
  const [personalOwnerUserId, setPersonalOwnerUserId] = useState("");
  const [owners, setOwners] = useState<v1.finance.OwnerBalance[]>([]);
  const [paidOn, setPaidOn] = useState(todayDateOnly);
  const [paymentMethod, setPaymentMethod] =
    useState<v1.finance.PaymentMethod>("BANK_TRANSFER");
  const [companyWalletId, setCompanyWalletId] = useState(
    () => companyWallets[0]?.id ?? "",
  );
  const [errors, setErrors] = useState<Partial<Record<PaymentField, string>>>(
    {},
  );

  function changeOpen(nextOpen: boolean) {
    if (busy) return;
    onOpenChange(nextOpen);
    if (nextOpen) {
      setAmount(sale.outstandingAmount);
      setSplitWithOwner(false);
      setPersonalAmount("0.00");
      setPersonalOwnerUserId("");
      setPaidOn(todayDateOnly());
      setPaymentMethod("BANK_TRANSFER");
      setCompanyWalletId(companyWallets[0]?.id ?? "");
      setErrors({});
      getPersonalOwnerOptions()
        .then(setOwners)
        .catch(() => setOwners([]));
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const effectivePersonalAmount = splitWithOwner ? personalAmount : "0.00";
    const businessAmount = subtractMoney(amount, effectivePersonalAmount);
    const result = v1.finance.recordScooterSalePaymentInputSchema.safeParse({
      businessAmount,
      personalAmount: effectivePersonalAmount,
      personalOwnerUserId: splitWithOwner
        ? personalOwnerUserId || undefined
        : undefined,
      paidOn,
      paymentMethod,
      companyWalletId: companyWalletId || undefined,
      idempotencyKey: `${sale.id}:payment:${crypto.randomUUID()}`,
    });

    if (!result.success) {
      setErrors(
        paymentErrors(
          result.error.issues,
          companyWalletId,
          splitWithOwner,
          personalOwnerUserId,
          t,
        ),
      );
      return;
    }

    if (await onSubmit(result.data)) {
      onOpenChange(false);
    }
  }

  return (
    <BottomSheet open={open} onOpenChange={changeOpen}>
      <BottomSheetContent className="lg:w-xl">
        <form
          noValidate
          onSubmit={(event) => void submit(event)}
          className="contents"
        >
          <BottomSheetHeader>
            <BottomSheetTitle>{t("dialogs.payment.title")}</BottomSheetTitle>
            <BottomSheetDescription>
              {t("dialogs.payment.description")}
            </BottomSheetDescription>
          </BottomSheetHeader>
          <BottomSheetBody>
            {errorFeedback ? <FeedbackAlert feedback={errorFeedback} /> : null}
            <FieldGroup>
              <Field data-invalid={Boolean(errors.amount) || undefined}>
                <FieldLabel htmlFor={`${formId}-payment-amount`}>
                  {t("fields.paymentAmount")}
                </FieldLabel>
                <Input
                  id={`${formId}-payment-amount`}
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  value={amount}
                  disabled={busy}
                  aria-invalid={Boolean(errors.amount) || undefined}
                  onChange={(event) => setAmount(event.target.value)}
                />
                <FieldError>{errors.amount}</FieldError>
              </Field>
              <div className="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-input bg-background px-3 py-2">
                <div className="grid gap-0.5">
                  <Label htmlFor={`${formId}-split-with-owner`}>
                    {t("fields.splitWithOwner")}
                  </Label>
                  <span className="text-xs text-muted-foreground">
                    {t("fields.splitWithOwnerDescription")}
                  </span>
                </div>
                <Switch
                  id={`${formId}-split-with-owner`}
                  checked={splitWithOwner}
                  disabled={busy}
                  onCheckedChange={setSplitWithOwner}
                />
              </div>
              {splitWithOwner ? (
                <>
                  <Field
                    data-invalid={Boolean(errors.personalAmount) || undefined}
                  >
                    <FieldLabel htmlFor={`${formId}-personal-amount`}>
                      {t("fields.personalAmount")}
                    </FieldLabel>
                    <Input
                      id={`${formId}-personal-amount`}
                      type="number"
                      min={0}
                      step="0.01"
                      inputMode="decimal"
                      value={personalAmount}
                      disabled={busy}
                      aria-invalid={Boolean(errors.personalAmount) || undefined}
                      onChange={(event) =>
                        setPersonalAmount(event.target.value)
                      }
                    />
                    <FieldError>{errors.personalAmount}</FieldError>
                  </Field>
                  <Field
                    data-invalid={
                      Boolean(errors.personalOwnerUserId) || undefined
                    }
                  >
                    <FieldLabel htmlFor={`${formId}-personal-owner`}>
                      {t("fields.personalOwner")}
                    </FieldLabel>
                    <Select
                      value={personalOwnerUserId}
                      disabled={busy}
                      onValueChange={(value) =>
                        value && setPersonalOwnerUserId(value)
                      }
                    >
                      <SelectTrigger
                        id={`${formId}-personal-owner`}
                        className="w-full"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {owners.map((owner) => (
                            <SelectItem key={owner.userId} value={owner.userId}>
                              {ownerLabel(owner.user)}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <FieldError>{errors.personalOwnerUserId}</FieldError>
                  </Field>
                </>
              ) : null}
              <Field data-invalid={Boolean(errors.paidOn) || undefined}>
                <FieldLabel htmlFor={`${formId}-paid-on-day`}>
                  {t("fields.paidOn")}
                </FieldLabel>
                <DatePartsField
                  baseId={`${formId}-paid-on`}
                  label={t("fields.paidOn")}
                  locale={locale}
                  value={paidOn}
                  disabled={busy}
                  invalid={Boolean(errors.paidOn)}
                  onChange={setPaidOn}
                />
                <FieldError>{errors.paidOn}</FieldError>
              </Field>
              <Field>
                <FieldLabel htmlFor={`${formId}-payment-method`}>
                  {t("fields.paymentMethod")}
                </FieldLabel>
                <Select
                  value={paymentMethod}
                  disabled={busy}
                  onValueChange={(value) =>
                    value && setPaymentMethod(value as v1.finance.PaymentMethod)
                  }
                >
                  <SelectTrigger
                    id={`${formId}-payment-method`}
                    className="w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {v1.finance.PAYMENT_METHODS.map((method) => (
                        <SelectItem key={method} value={method}>
                          {t(`paymentMethods.${method}`)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field
                data-invalid={Boolean(errors.companyWalletId) || undefined}
              >
                <FieldLabel htmlFor={`${formId}-company-wallet`}>
                  {t("fields.companyWallet")}
                </FieldLabel>
                <Select
                  value={companyWalletId}
                  disabled={busy}
                  onValueChange={(value) => value && setCompanyWalletId(value)}
                >
                  <SelectTrigger
                    id={`${formId}-company-wallet`}
                    className="w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {companyWallets.map((wallet) => (
                        <SelectItem key={wallet.id} value={wallet.id}>
                          {wallet.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FieldError>{errors.companyWalletId}</FieldError>
              </Field>
            </FieldGroup>
          </BottomSheetBody>
          <BottomSheetFooter className="sm:flex-row-reverse sm:justify-start">
            <Button type="submit" disabled={busy}>
              {busy ? t("actions.recording") : t("actions.recordPayment")}
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
    </BottomSheet>
  );
}

function ScooterSaleBillCard({ saleId }: { saleId: string }) {
  const t = useTranslations("scooters.sales");
  const inputId = useId();
  const [billDocument, setDocument] = useState<
    v1.finance.ScooterSaleDocument | null | undefined
  >(undefined);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getScooterSaleDocument(saleId)
      .then((doc) => {
        if (!cancelled) setDocument(doc);
      })
      .catch(() => {
        if (!cancelled) setDocument(null);
      });
    return () => {
      cancelled = true;
    };
  }, [saleId]);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setUploading(true);
    setError(null);
    try {
      const evidence = await prepareScooterSaleBill(file);
      const updated = await uploadScooterSaleBill(saleId, evidence);
      setDocument(updated);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error &&
          (uploadError.message === "UNSUPPORTED_TYPE" ||
            uploadError.message === "FILE_TOO_LARGE")
          ? t(`bill.errors.${uploadError.message}`)
          : t("bill.errors.uploadFailed"),
      );
    } finally {
      setUploading(false);
    }
  }

  const asset = billDocument?.asset ?? null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("bill.title")}</CardTitle>
        <CardDescription>{t("bill.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {billDocument === undefined ? (
          <p className="text-sm text-muted-foreground">{t("bill.loading")}</p>
        ) : asset ? (
          <div className="flex items-center gap-3 rounded-lg border border-border p-3">
            <FileTextIcon
              aria-hidden="true"
              className="size-8 shrink-0 text-muted-foreground"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {t("bill.attached")}
              </p>
              <p className="text-xs text-muted-foreground">
                {asset.contentType} · {Math.ceil(asset.byteSize / 1024)} KB
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("bill.empty")}</p>
        )}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div>
          <Label htmlFor={inputId} className="sr-only">
            {t("bill.title")}
          </Label>
          <input
            id={inputId}
            type="file"
            accept={SCOOTER_SALE_BILL_CONTENT_TYPES.join(",")}
            disabled={uploading}
            onChange={(event) => void handleFileChange(event)}
            className="hidden"
          />
          <Button
            type="button"
            variant="outline"
            disabled={uploading}
            onClick={() => document.getElementById(inputId)?.click()}
          >
            {uploading
              ? t("bill.uploading")
              : asset
                ? t("bill.replace")
                : t("bill.attach")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CancelSaleDialog({
  open,
  busy,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<boolean>;
}) {
  const t = useTranslations("scooters.sales");

  async function confirm() {
    if (await onConfirm()) {
      onOpenChange(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => !busy && onOpenChange(nextOpen)}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("dialogs.cancel.title")}</DialogTitle>
          <DialogDescription>
            {t("dialogs.cancel.description")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose
            render={<Button type="button" variant="outline" disabled={busy} />}
          >
            {t("actions.cancel")}
          </DialogClose>
          <Button
            type="button"
            variant="destructive"
            disabled={busy}
            onClick={() => void confirm()}
          >
            {busy ? t("actions.cancelling") : t("actions.cancelSale")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SaleStatusBadge({
  status,
}: {
  status: v1.finance.ScooterSaleStatus;
}) {
  const t = useTranslations("scooters.sales");
  const variant =
    status === "PAID"
      ? "secondary"
      : status === "CANCELLED"
        ? "outline"
        : "outline";

  return <Badge variant={variant}>{t(`statuses.${status}`)}</Badge>;
}

export function ScooterSoldBadge() {
  const t = useTranslations("scooters.sales");
  return (
    <Badge variant="secondary">
      <ReceiptTextIcon data-icon="inline-start" />
      {t("badge")}
    </Badge>
  );
}

function ReceivableField({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-sm font-medium">{value}</dd>
    </div>
  );
}

function mutationError(
  title: string,
  error: unknown,
  t: ReturnType<typeof useTranslations>,
): MutationFeedback {
  return {
    kind: "error",
    title,
    messages: [
      error instanceof Error ? error.message : t("feedback.genericError"),
    ],
  };
}

function saleErrors(
  issues: ReadonlyArray<{ path: PropertyKey[] }>,
  buyerCounterpartyId: string,
  t: ReturnType<typeof useTranslations>,
): Partial<Record<SaleField, string>> {
  const result: Partial<Record<SaleField, string>> = {};
  if (!buyerCounterpartyId) {
    result.buyerCounterpartyId = t("validation.buyerRequired");
  }
  for (const issue of issues) {
    const field = issue.path[0];
    if ((field === "saleAmount" || field === "soldOn") && !result[field]) {
      result[field] = t("validation.invalid", {
        field: t(`fields.${field}`),
      });
    }
  }
  return result;
}

function paymentErrors(
  issues: ReadonlyArray<{ path: PropertyKey[] }>,
  companyWalletId: string,
  splitWithOwner: boolean,
  personalOwnerUserId: string,
  t: ReturnType<typeof useTranslations>,
): Partial<Record<PaymentField, string>> {
  const result: Partial<Record<PaymentField, string>> = {};
  if (splitWithOwner && !personalOwnerUserId) {
    result.personalOwnerUserId = t("validation.ownerRequired");
  }
  for (const issue of issues) {
    const field = issue.path[0];
    if (field === "businessAmount" && !result.amount) {
      result.amount = t("validation.invalid", {
        field: t("fields.paymentAmount"),
      });
    } else if (field === "personalAmount" && !result.personalAmount) {
      result.personalAmount = t("validation.invalid", {
        field: t("fields.personalAmount"),
      });
    } else if (field === "paidOn" && !result.paidOn) {
      result.paidOn = t("validation.invalid", { field: t("fields.paidOn") });
    } else if (field === "companyWalletId" && !result.companyWalletId) {
      result.companyWalletId = t("validation.walletRequired");
    } else if (field === "personalOwnerUserId" && !result.personalOwnerUserId) {
      result.personalOwnerUserId = t("validation.ownerRequired");
    }
  }
  return result;
}

function subtractMoney(a: string, b: string): string {
  const cents = Math.round(Number(a) * 100) - Math.round(Number(b) * 100);
  return (cents / 100).toFixed(2);
}

function ownerLabel(user: v1.finance.FinanceUserSummary): string {
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return name || user.email;
}

function todayDateOnly(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function formatMoney(value: string, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(Number(value));
}
