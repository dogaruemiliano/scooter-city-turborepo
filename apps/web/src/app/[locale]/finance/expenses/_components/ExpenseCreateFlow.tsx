"use client";

import { ApiError } from "@repo/api-shared";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  ToggleGroup,
  ToggleGroupItem,
} from "@repo/ui/components";
import {
  AlertCircleIcon,
  ArrowRightIcon,
  Building2Icon,
  CheckIcon,
  LoaderCircleIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useReducer, useRef, useState, type FormEvent } from "react";

import { PageTitleOverride } from "@/components/PageTitleOverride";
import {
  ExpenseCompletionPendingError,
  recordExpense,
  type ExpenseCompletionStage,
  type SelectedExpenseEvidence,
} from "../_lib/expense-api";
import {
  buildCompactExpensePayload,
  clearExpenseErrorsForAction,
  createExpenseFormState,
  expenseFormReducer,
  hasExpenseFormErrors,
  validateExpenseDetails,
  validateExpenseEvidence,
  type CompactExpenseCreatePayload,
  type ExpenseFormAction,
  type ExpenseFormErrors,
} from "../_lib/expense-form";
import {
  isVatRegisteredOn,
  walletsForExpenseSource,
  type ExpenseFormBootstrap,
} from "../_lib/expense-options";
import { ExpenseDetailsStep } from "./ExpenseDetailsStep";
import { ExpenseEvidenceStep } from "./ExpenseEvidenceStep";
import { QuickExpenseForm } from "./QuickExpenseForm";

interface ExpenseCreateFlowProps {
  advancedTransactionHref: string;
  bootstrap: ExpenseFormBootstrap;
  categoriesHref: string;
  expensesHref: string;
  idempotencyKey: string;
  settingsHref: string;
}

interface ExpenseSubmissionSnapshot {
  evidence: {
    fiscal: SelectedExpenseEvidence | null;
    pos: SelectedExpenseEvidence | null;
  };
  payload: CompactExpenseCreatePayload;
}

interface PendingExpenseCompletion extends ExpenseSubmissionSnapshot {
  expenseId: string;
  stage: ExpenseCompletionStage;
}

export function ExpenseCreateFlow({
  advancedTransactionHref,
  bootstrap,
  categoriesHref,
  expensesHref,
  idempotencyKey,
  settingsHref,
}: ExpenseCreateFlowProps) {
  const t = useTranslations("finance.expenses.form");
  const router = useRouter();
  const [state, dispatch] = useReducer(
    expenseFormReducer,
    bootstrap,
    createInitialState,
  );
  const [errors, setErrors] = useState<ExpenseFormErrors>({});
  const [fiscalEvidence, setFiscalEvidence] =
    useState<SelectedExpenseEvidence | null>(null);
  const [posEvidence, setPosEvidence] =
    useState<SelectedExpenseEvidence | null>(null);
  const [fiscalPreparing, setFiscalPreparing] = useState(false);
  const [posPreparing, setPosPreparing] = useState(false);
  const fiscalPreparingRef = useRef(false);
  const posPreparingRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pendingCompletion, setPendingCompletion] =
    useState<PendingExpenseCompletion | null>(null);

  const entity = bootstrap.entities.find(
    (item) => item.id === state.businessEntityId,
  );
  const isVatRegistered = isVatRegisteredOn(
    bootstrap.vatPeriods,
    state.businessEntityId,
    state.documentDate || state.expenseDate,
  );

  if (bootstrap.entities.length === 0) {
    return <ExpenseSetupRequired settingsHref={settingsHref} />;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (fiscalPreparingRef.current || posPreparingRef.current) {
      setFeedback(t("feedback.evidencePreparing"));
      return;
    }

    let submission: ExpenseSubmissionSnapshot | null = pendingCompletion
      ? {
          payload: pendingCompletion.payload,
          evidence: pendingCompletion.evidence,
        }
      : null;

    if (!submission) {
      const detailsErrors = validateExpenseDetails(
        state,
        t("validation.required"),
        t("validation.invalidAmount"),
        t("validation.invalidCombination"),
      );
      if (state.hasCompanyCui === "YES" && !entity?.taxIdentifier?.trim()) {
        detailsErrors.hasCompanyCui = t(
          "validation.companyTaxIdentifierMissing",
        );
      }
      const evidenceErrors = validateExpenseEvidence(
        state,
        { fiscalEvidence, posEvidence },
        t("validation.required"),
        t("validation.invalidVatLine"),
      );
      const nextErrors = { ...detailsErrors, ...evidenceErrors };
      setErrors(nextErrors);
      setFeedback(null);
      if (hasExpenseFormErrors(nextErrors)) {
        focusFirstInvalidControl();
        return;
      }

      const posSubmissionEvidence =
        state.hasCompanyCui === "YES" && state.paymentSource === "COMPANY_CARD"
          ? posEvidence
          : null;
      const payload = buildCompactExpensePayload(state, {
        idempotencyKey,
        fiscalEvidence,
        posEvidence: posSubmissionEvidence,
        legalEntityTaxIdentifier: entity?.taxIdentifier,
        isVatRegistered,
        postImmediately: false,
      });
      if (!payload) {
        setFeedback(t("feedback.invalid"));
        return;
      }
      submission = {
        payload,
        evidence: {
          fiscal: fiscalEvidence,
          pos: posSubmissionEvidence,
        },
      };
    }

    setSubmitting(true);
    try {
      await recordExpense(submission.payload, submission.evidence);
      router.push(expensesHref);
      router.refresh();
    } catch (error) {
      if (error instanceof ExpenseCompletionPendingError) {
        setPendingCompletion({
          ...submission,
          expenseId: error.expenseId,
          stage: error.stage,
        });
        setFeedback(
          t("feedback.completionPending", { expenseId: error.expenseId }),
        );
      } else if (pendingCompletion) {
        setFeedback(
          t("feedback.completionPending", {
            expenseId: pendingCompletion.expenseId,
          }),
        );
      } else {
        setFeedback(
          error instanceof ApiError ? error.message : t("feedback.generic"),
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleAction(action: ExpenseFormAction) {
    if (
      action.type === "SET_COMPANY_CUI_ANSWER" ||
      action.type === "SET_BUSINESS_ENTITY"
    ) {
      setFiscalEvidence(null);
      setPosEvidence(null);
    } else if (action.type === "SET_PAYMENT_SOURCE") {
      setPosEvidence(null);
    }

    dispatch(action);
    setErrors((current) => clearExpenseErrorsForAction(current, action));
    setFeedback(null);
  }

  function handleFiscalEvidenceChange(
    evidence: SelectedExpenseEvidence | null,
  ) {
    setFiscalEvidence(evidence);
    setPosEvidence(null);
    dispatch({ type: "RESET_FISCAL_ASSERTIONS" });
    setErrors((current) => {
      const next = clearExpenseErrorsForAction(current, {
        type: "RESET_FISCAL_ASSERTIONS",
      });
      delete next.fiscalEvidence;
      delete next.posEvidence;
      return next;
    });
    setFeedback(null);
  }

  function handlePosEvidenceChange(evidence: SelectedExpenseEvidence | null) {
    setPosEvidence(evidence);
    setErrors((current) => {
      const next = { ...current };
      delete next.posEvidence;
      return next;
    });
    setFeedback(null);
  }

  function handleFiscalProcessingChange(processing: boolean) {
    fiscalPreparingRef.current = processing;
    setFiscalPreparing(processing);
    if (!processing && !posPreparingRef.current) {
      setFeedback((current) =>
        current === t("feedback.evidencePreparing") ? null : current,
      );
    }
  }

  function handlePosProcessingChange(processing: boolean) {
    posPreparingRef.current = processing;
    setPosPreparing(processing);
    if (!processing && !fiscalPreparingRef.current) {
      setFeedback((current) =>
        current === t("feedback.evidencePreparing") ? null : current,
      );
    }
  }

  const evidencePreparing = fiscalPreparing || posPreparing;
  const formDisabled =
    submitting || evidencePreparing || Boolean(pendingCompletion);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10">
      <PageTitleOverride title={t("title")} />

      {feedback ? (
        <Alert variant="destructive">
          <AlertCircleIcon aria-hidden="true" />
          <AlertTitle>
            {pendingCompletion
              ? t("feedback.completionTitle")
              : t("feedback.title")}
          </AlertTitle>
          <AlertDescription>{feedback}</AlertDescription>
        </Alert>
      ) : null}

      <ToggleGroup
        aria-label={t("mode.label")}
        value={[state.mode]}
        className="grid w-full grid-cols-2"
        onValueChange={(values) => {
          const next = values[0];
          if (next === "QUICK" || next === "FULL") {
            handleAction({
              type: "SET_MODE",
              value: next,
              currentUserId: bootstrap.currentUserId,
            });
          }
        }}
      >
        <ToggleGroupItem value="QUICK" size="lg">
          {t("mode.quick")}
        </ToggleGroupItem>
        <ToggleGroupItem value="FULL" size="lg">
          {t("mode.full")}
        </ToggleGroupItem>
      </ToggleGroup>

      <form
        noValidate
        aria-busy={submitting || evidencePreparing}
        onSubmit={(event) => void submit(event)}
        className="overflow-hidden rounded-xl border border-border bg-card"
      >
        {state.mode === "QUICK" ? (
          <QuickExpenseForm
            bootstrap={bootstrap}
            state={state}
            errors={errors}
            dispatch={handleAction}
            disabled={formDisabled}
          />
        ) : (
          <>
            <ExpenseDetailsStep
              bootstrap={bootstrap}
              categoriesHref={categoriesHref}
              state={state}
              errors={errors}
              dispatch={handleAction}
              disabled={formDisabled}
              settingsHref={settingsHref}
              onBusinessEntityChange={(businessEntityId, currency) =>
                handleAction({
                  type: "SET_BUSINESS_ENTITY",
                  businessEntityId,
                  currency,
                })
              }
              onCompanyCuiAnswerChange={(value) =>
                handleAction({
                  type: "SET_COMPANY_CUI_ANSWER",
                  value,
                  currentUserId: bootstrap.currentUserId,
                })
              }
            />

            {state.hasCompanyCui ? (
              <ExpenseEvidenceStep
                state={state}
                errors={errors}
                dispatch={handleAction}
                disabled={formDisabled}
                fiscalEvidence={fiscalEvidence}
                posEvidence={posEvidence}
                isVatRegistered={isVatRegistered}
                onFiscalEvidenceChange={handleFiscalEvidenceChange}
                onFiscalProcessingChange={handleFiscalProcessingChange}
                onPosEvidenceChange={handlePosEvidenceChange}
                onPosProcessingChange={handlePosProcessingChange}
              />
            ) : null}
          </>
        )}

        <footer className="flex flex-col-reverse gap-3 border-t border-border bg-muted p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <Button
            type="button"
            variant="ghost"
            nativeButton={false}
            render={<Link href={advancedTransactionHref} />}
          >
            {t("advancedTransaction")}
          </Button>
          <Button type="submit" disabled={submitting || evidencePreparing}>
            {submitting || evidencePreparing ? (
              <LoaderCircleIcon
                aria-hidden="true"
                data-icon="inline-start"
                className="animate-spin"
              />
            ) : null}
            {evidencePreparing
              ? t("evidence.preparing")
              : submitting
                ? pendingCompletion
                  ? t("completing")
                  : t("recording")
                : pendingCompletion
                  ? t("retryCompletion")
                  : t("record")}
            {submitting || evidencePreparing ? null : (
              <CheckIcon data-icon="inline-end" />
            )}
          </Button>
        </footer>
      </form>
    </main>
  );
}

function focusFirstInvalidControl() {
  requestAnimationFrame(() => {
    document.querySelector<HTMLElement>('form [aria-invalid="true"]')?.focus();
  });
}

function createInitialState(bootstrap: ExpenseFormBootstrap) {
  const entity = bootstrap.entities[0];
  const state = createExpenseFormState({
    currentUserId: bootstrap.currentUserId,
    defaultBusinessEntityId: entity?.id,
    defaultCurrency: entity?.defaultCurrency,
    today: bootstrap.today,
  });
  const compatibleWallets = walletsForExpenseSource(entity, "COMPANY_CARD");
  return {
    ...state,
    companyWalletId:
      compatibleWallets.length === 1 ? compatibleWallets[0]!.id : "",
  };
}

function ExpenseSetupRequired({ settingsHref }: { settingsHref: string }) {
  const t = useTranslations("finance.expenses.setupRequired");
  return (
    <main className="mx-auto flex w-full max-w-screen-lg flex-1 items-center px-4 py-6 sm:px-6 sm:py-10">
      <PageTitleOverride title={t("title")} />
      <Card className="w-full">
        <CardHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Building2Icon aria-hidden="true" />
          </div>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t("details")}</p>
        </CardContent>
        <CardFooter className="justify-end">
          <Button nativeButton={false} render={<Link href={settingsHref} />}>
            {t("action")}
            <ArrowRightIcon data-icon="inline-end" />
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}
