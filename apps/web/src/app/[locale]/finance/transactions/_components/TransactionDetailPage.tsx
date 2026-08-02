"use client";

import { ApiError, v1 } from "@repo/api-shared";
import type { SupportedLocale } from "@repo/i18n";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
  buttonVariants,
} from "@repo/ui/components";
import { cn } from "@repo/ui/lib/utils";
import { ArrowLeftIcon, CheckCircle2Icon, RotateCcwIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useState, type FormEvent } from "react";

import { PageTitleOverride } from "@/components/PageTitleOverride";
import {
  financeUserLabel,
  formatFinanceDateTime,
  formatMoney,
} from "@/lib/finance-format";
import { webApi } from "@/lib/api";
import { FinanceEmptyState } from "../../_components/FinanceEmptyState";
import { FinanceStatusBadge } from "../../_components/FinanceStatusBadge";
import { availableTransactionActions } from "../_lib/transaction-actions";

interface TransactionDetailPageProps {
  locale: SupportedLocale;
  reverseIdempotencyKey: string;
  transaction: v1.finance.MoneyTransaction;
  transactionsHref: string;
}

interface Feedback {
  kind: "error" | "success";
  message: string;
}

export function TransactionDetailPage({
  locale,
  reverseIdempotencyKey,
  transaction,
  transactionsHref,
}: TransactionDetailPageProps) {
  const t = useTranslations("finance");
  const router = useRouter();
  const reverseDescriptionId = useId();
  const [current, setCurrent] = useState(transaction);
  const [busyAction, setBusyAction] = useState<"post" | "reverse" | null>(null);
  const [postDialogOpen, setPostDialogOpen] = useState(false);
  const [reverseDialogOpen, setReverseDialogOpen] = useState(false);
  const [reverseDescription, setReverseDescription] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const title = t(`enums.transactionTypes.${current.type}`);
  const { canPost, canReverse } = availableTransactionActions(current);

  async function postTransaction() {
    setBusyAction("post");
    setFeedback(null);
    try {
      const posted = await webApi.fetch(
        v1.finance.ROUTES.transactions.post(current.id),
        v1.finance.moneyTransactionSchema,
        {
          method: "POST",
        },
      );
      setCurrent(posted);
      setPostDialogOpen(false);
      setFeedback({
        kind: "success",
        message: t("transactions.detail.feedback.postSuccess"),
      });
      router.refresh();
    } catch (error) {
      setFeedback({
        kind: "error",
        message:
          error instanceof ApiError
            ? error.message
            : t("transactions.detail.feedback.genericError"),
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function reverseTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusyAction("reverse");
    setFeedback(null);
    try {
      const input = v1.finance.reverseMoneyTransactionInputSchema.parse({
        idempotencyKey: reverseIdempotencyKey,
        description: reverseDescription.trim() || null,
      });
      const reversal = await webApi.fetch(
        v1.finance.ROUTES.transactions.reverse(current.id),
        v1.finance.moneyTransactionSchema,
        {
          method: "POST",
          json: input,
        },
      );
      setCurrent((value) => ({
        ...value,
        status: "REVERSED",
        reversalTransactionId: reversal.id,
      }));
      setReverseDialogOpen(false);
      setFeedback({
        kind: "success",
        message: t("transactions.detail.feedback.reverseSuccess"),
      });
      router.refresh();
    } catch (error) {
      setFeedback({
        kind: "error",
        message:
          error instanceof ApiError
            ? error.message
            : t("transactions.detail.feedback.genericError"),
      });
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-screen-xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10">
      <PageTitleOverride title={title} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={transactionsHref}
          className={cn(
            buttonVariants({ variant: "ghost" }),
            "hidden w-fit text-muted-foreground md:inline-flex",
          )}
        >
          <ArrowLeftIcon data-icon="inline-start" />
          {t("transactions.detail.back")}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <FinanceStatusBadge
            status={current.status}
            label={t(`enums.transactionStatuses.${current.status}`)}
          />
          {canPost ? (
            <Button
              type="button"
              disabled={busyAction !== null}
              onClick={() => setPostDialogOpen(true)}
            >
              <CheckCircle2Icon data-icon="inline-start" />
              {t("transactions.detail.actions.post")}
            </Button>
          ) : null}
          {canReverse ? (
            <Button
              type="button"
              variant="outline"
              disabled={busyAction !== null}
              onClick={() => setReverseDialogOpen(true)}
            >
              <RotateCcwIcon data-icon="inline-start" />
              {t("transactions.detail.actions.reverse")}
            </Button>
          ) : null}
        </div>
      </div>

      {feedback ? (
        <Alert variant={feedback.kind === "error" ? "destructive" : "default"}>
          <AlertTitle>
            {feedback.kind === "error"
              ? t("transactions.detail.feedback.errorTitle")
              : t("transactions.detail.feedback.successTitle")}
          </AlertTitle>
          <AlertDescription>{feedback.message}</AlertDescription>
        </Alert>
      ) : null}

      {current.type === "PERSONAL_FUNDS_CLAIM" ? (
        <Alert>
          <AlertTitle>
            {t("enums.transactionTypes.PERSONAL_FUNDS_CLAIM")}
          </AlertTitle>
          <AlertDescription>
            {t("transactions.detail.description")}
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t("transactions.detail.sections.summary")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <DetailField
            label={t("transactions.detail.fields.amount")}
            value={formatMoney(current.amount, current.currency, locale)}
            emphasis
          />
          <DetailField
            label={t("transactions.detail.fields.scope")}
            value={t(`enums.financialScopes.${current.financialScope}`)}
          />
          <DetailField
            label={t("transactions.detail.fields.occurredAt")}
            value={formatFinanceDateTime(current.occurredAt, locale)}
          />
          <DetailField
            label={t("transactions.detail.fields.paymentMethod")}
            value={
              current.paymentMethod
                ? t(`enums.paymentMethods.${current.paymentMethod}`)
                : t("common.notProvided")
            }
          />
          <DetailField
            label={t("transactions.detail.fields.billingStatus")}
            value={t(`enums.billingStatuses.${current.billingStatus}`)}
          />
          <DetailField
            label={t("transactions.detail.fields.category")}
            value={current.category?.name ?? t("common.notProvided")}
          />
          <DetailField
            label={t("transactions.detail.fields.recordedBy")}
            value={
              current.recordedBy
                ? financeUserLabel(current.recordedBy)
                : t("common.notProvided")
            }
          />
          <DetailField
            label={t("transactions.detail.fields.description")}
            value={current.description ?? t("common.notProvided")}
            className="sm:col-span-2"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("transactions.detail.sections.parties")}</CardTitle>
        </CardHeader>
        <CardContent>
          {transactionParties(current).length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {transactionParties(current).map(({ label, user }) => (
                <DetailField
                  key={label}
                  label={t(`transactions.detail.fields.${label}`)}
                  value={financeUserLabel(user)}
                />
              ))}
            </div>
          ) : (
            <FinanceEmptyState>{t("common.notProvided")}</FinanceEmptyState>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {t("transactions.detail.sections.balanceChanges")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {current.balanceChanges.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    {t("transactions.detail.fields.wallet")}
                  </TableHead>
                  <TableHead>
                    {t("transactions.detail.fields.bucket")}
                  </TableHead>
                  <TableHead>
                    {t("transactions.detail.fields.change")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {current.balanceChanges.map((change) => (
                  <TableRow key={change.id}>
                    <TableCell>
                      <p className="font-medium">{change.wallet.name}</p>
                      {change.wallet.owner ? (
                        <p className="text-xs text-muted-foreground">
                          {financeUserLabel(change.wallet.owner)}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {t(`enums.balanceBuckets.${change.bucket}`)}
                    </TableCell>
                    <TableCell className="font-medium tabular-nums">
                      {formatMoney(change.amountDelta, change.currency, locale)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <FinanceEmptyState>{t("common.notProvided")}</FinanceEmptyState>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("transactions.detail.sections.references")}</CardTitle>
        </CardHeader>
        <CardContent>
          {current.references.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {current.references.map((reference) => (
                <div
                  key={reference.id}
                  className="rounded-lg border border-border p-3"
                >
                  <p className="text-xs font-medium text-muted-foreground">
                    {reference.referenceType}
                  </p>
                  <p className="mt-1 break-all font-mono text-sm">
                    {reference.referenceId}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <FinanceEmptyState>{t("common.notProvided")}</FinanceEmptyState>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("transactions.detail.sections.audit")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <DetailField
            label={t("transactions.detail.fields.transactionId")}
            value={current.id}
            mono
          />
          <DetailField
            label={t("transactions.detail.fields.idempotencyKey")}
            value={current.idempotencyKey}
            mono
          />
          <DetailField
            label={t("transactions.detail.fields.createdAt")}
            value={formatFinanceDateTime(current.createdAt, locale)}
          />
          <DetailField
            label={t("transactions.detail.fields.updatedAt")}
            value={formatFinanceDateTime(current.updatedAt, locale)}
          />
          <TransactionLinkField
            id={current.originTransactionId}
            label={t("transactions.detail.fields.originTransaction")}
            transactionsHref={transactionsHref}
            emptyValue={t("common.notProvided")}
          />
          <TransactionLinkField
            id={current.reversalOfTransactionId}
            label={t("transactions.detail.fields.reversalOf")}
            transactionsHref={transactionsHref}
            emptyValue={t("common.notProvided")}
          />
          <TransactionLinkField
            id={current.reversalTransactionId}
            label={t("transactions.detail.fields.reversalTransaction")}
            transactionsHref={transactionsHref}
            emptyValue={t("common.notProvided")}
          />
        </CardContent>
      </Card>

      <Dialog open={postDialogOpen} onOpenChange={setPostDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("transactions.detail.confirm.postTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("transactions.detail.confirm.postDescription")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose
              render={
                <Button variant="outline" disabled={busyAction !== null} />
              }
            >
              {t("common.cancel")}
            </DialogClose>
            <Button
              type="button"
              disabled={busyAction !== null}
              onClick={() => void postTransaction()}
            >
              {busyAction === "post"
                ? t("transactions.detail.actions.posting")
                : t("transactions.detail.actions.post")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reverseDialogOpen} onOpenChange={setReverseDialogOpen}>
        <DialogContent>
          <form onSubmit={(event) => void reverseTransaction(event)}>
            <DialogHeader>
              <DialogTitle>
                {t("transactions.detail.confirm.reverseTitle")}
              </DialogTitle>
              <DialogDescription>
                {t("transactions.detail.confirm.reverseDescription")}
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Label htmlFor={reverseDescriptionId}>
                {t("transactions.detail.confirm.reverseReason")}
              </Label>
              <Textarea
                id={reverseDescriptionId}
                className="mt-1 min-h-24"
                value={reverseDescription}
                maxLength={2_000}
                disabled={busyAction !== null}
                onChange={(event) =>
                  setReverseDescription(event.currentTarget.value)
                }
              />
            </div>
            <DialogFooter>
              <DialogClose
                render={
                  <Button variant="outline" disabled={busyAction !== null} />
                }
              >
                {t("common.cancel")}
              </DialogClose>
              <Button
                type="submit"
                variant="destructive"
                disabled={busyAction !== null}
              >
                {busyAction === "reverse"
                  ? t("transactions.detail.actions.reversing")
                  : t("transactions.detail.actions.reverse")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailField({
  className,
  emphasis = false,
  label,
  mono = false,
  value,
}: {
  className?: string;
  emphasis?: boolean;
  label: string;
  mono?: boolean;
  value: string;
}) {
  return (
    <div className={className}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 break-words text-sm",
          emphasis && "text-lg font-semibold tabular-nums",
          mono && "break-all font-mono",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function TransactionLinkField({
  emptyValue,
  id,
  label,
  transactionsHref,
}: {
  emptyValue: string;
  id: string | null;
  label: string;
  transactionsHref: string;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {id ? (
        <Link
          href={`${transactionsHref}/${encodeURIComponent(id)}`}
          className="mt-1 block break-all font-mono text-sm text-primary underline-offset-4 hover:underline"
        >
          {id}
        </Link>
      ) : (
        <p className="mt-1 text-sm">{emptyValue}</p>
      )}
    </div>
  );
}

function transactionParties(transaction: v1.finance.MoneyTransaction) {
  return [
    transaction.counterparty
      ? { label: "counterparty" as const, user: transaction.counterparty }
      : null,
    transaction.recipient
      ? { label: "recipient" as const, user: transaction.recipient }
      : null,
    transaction.debtor
      ? { label: "debtor" as const, user: transaction.debtor }
      : null,
    transaction.creditor
      ? { label: "creditor" as const, user: transaction.creditor }
      : null,
  ].filter(
    (
      item,
    ): item is {
      label: "counterparty" | "recipient" | "debtor" | "creditor";
      user: v1.finance.FinanceUserSummary;
    } => item !== null,
  );
}
