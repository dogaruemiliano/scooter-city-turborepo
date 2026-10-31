"use client";

import { PageLayout } from "@repo/ui/components/page-layout";

import {
  useCallback,
  useId,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { RefreshCwIcon } from "lucide-react";
import { ApiError, v1 } from "@repo/api-shared";
import {
  Button,
  Checkbox,
  SheetSelect,
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FormActions,
  Textarea,
} from "@repo/ui/components";
import { WizardForm } from "@repo/ui/components/wizard-form";
import { SaveButton } from "@repo/ui/components/save-button";
import { useLocale, useTranslations } from "next-intl";
import { DatePartsInput } from "@/components/DateField";
import { PageHeaderNavigation } from "@/components/PageHeaderNavigation";
import { PersonSelect, loadPersonSelectItems } from "@/components/PersonSelect";
import {
  ScooterSelect,
  ScooterSelectRow,
  loadScooterSelectItems,
} from "@/components/ScooterSelect";
import {
  Choice,
  Feedback,
  useRemote,
  useTask,
} from "@/components/WorkspaceForm";
import { useWorkspaceNotifications } from "@/components/WorkspaceNotifications";
import { useSession } from "@/components/auth/SessionProvider";
import { Link, useRouter } from "@/i18n/navigation";
import { canAccess } from "@/lib/access";
import { webApi } from "@/lib/api";
import { useFormAction } from "@/lib/form/use-form-action";
import { scooterRentalBlockers } from "../_lib/scooter-rental-blockers";
import { canPersistRentalDraft, weeklyPeriod } from "../_lib/rental-draft";
import { RentalPersonCard } from "./RentalPersonCard";
import { useWizardLeaveGuard } from "@/components/useWizardLeaveGuard";
import { useRentalDraft } from "./useRentalDraft";

export function RentalCreateWizard({
  userId,
  returnedDraftId,
  returnedPersonId,
}: {
  userId: string;
  returnedDraftId?: string;
  returnedPersonId?: string;
}) {
  const t = useTranslations("workspace.rentals.wizard");
  const rentalT = useTranslations("workspace.rentals");
  const contractsT = useTranslations("contracts");
  const locale = useLocale();
  const router = useRouter();
  const { user } = useSession();
  const formAction = useFormAction();
  const task = useTask({
    [v1.problems.MAINTENANCE_HOLD_ERROR_CODE]: rentalT("maintenanceHold"),
    [v1.rentals.NEW_CUSTOMER_PROMOTION_ERROR_CODE]: contractsT(
      "threePlusOneNewCustomersOnly",
    ),
  });
  const store = useRentalDraft(userId, {
    draftId: returnedDraftId,
    personId: returnedPersonId,
  });
  const { draft } = store;
  const quoteScooterId = draft?.scooterId ?? "";
  const quotePersonId = draft?.personId ?? "";
  const promotionEligibilityMessage = contractsT(
    "threePlusOneNewCustomersOnly",
  );
  const promotion = draft?.promotion ?? "standard";
  const rentalPaymentMethod = draft?.rentalPaymentMethod ?? "cash";
  const depositPaymentMethod = draft?.depositPaymentMethod ?? "cash";
  const loadQuote = useCallback(async () => {
    if (!quoteScooterId || !quotePersonId) return null;
    const query = new URLSearchParams({
      scooterId: quoteScooterId,
      personId: quotePersonId,
      promotion,
      rentalPaymentMethod,
      depositPaymentMethod,
    });
    try {
      return await webApi.fetch(
        `/v1/rentals/quote?${query}`,
        v1.rentals.rentalTermsSchema,
        { cache: "no-store" },
      );
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.code === v1.rentals.NEW_CUSTOMER_PROMOTION_ERROR_CODE
      )
        throw new Error(promotionEligibilityMessage);
      throw error;
    }
  }, [
    quoteScooterId,
    quotePersonId,
    promotion,
    rentalPaymentMethod,
    depositPaymentMethod,
    promotionEligibilityMessage,
  ]);
  const quote = useRemote(loadQuote);
  const reloadQuote = quote.reload;
  const [attempted, setAttempted] = useState(false);
  const leaveGuard = useWizardLeaveGuard(
    Boolean(draft && canPersistRentalDraft(draft) && !draft.createdRentalId),
  );
  const submitting = useRef(false);
  const mounted = useRef(true);
  const returnConsumed = useRef(false);
  const load = useCallback(async () => {
    const [persons, scooters] = await Promise.all([
      loadPersonSelectItems(),
      loadScooterSelectItems(),
    ]);
    return { persons, scooters };
  }, []);
  const notifications = useWorkspaceNotifications();
  const toastRef = useRef(notifications);
  const actionsRef = useRef<HTMLDivElement>(null);
  const loadErrorToastId = useId();
  const lastLoadError = useRef<string | null>(null);
  const retryingOptions = useRef(false);
  useEffect(() => {
    toastRef.current = notifications;
  }, [notifications]);
  const options = useRemote(load);
  const reloadOptions = options.reload;
  useEffect(() => {
    const toast = toastRef.current;
    if (!toast) return;
    if (!options.loading) {
      retryingOptions.current = false;
      if (!options.error) {
        if (lastLoadError.current) toast.dismiss(loadErrorToastId);
        lastLoadError.current = null;
        return;
      }
      lastLoadError.current = options.error;
    }
    if (!lastLoadError.current) return;
    toast.add({
      id: loadErrorToastId,
      title: lastLoadError.current,
      actionPending: options.loading,
      variant: "error",
      dismissible: false,
      anchorRef: actionsRef,
      actionPlacement: "trailing",
      actionProps: {
        children: <RefreshCwIcon aria-hidden="true" />,
        "aria-label": t("retry"),
        onClick: (event) => {
          event.preventDefault();
          if (retryingOptions.current) return;
          retryingOptions.current = true;
          reloadOptions();
          reloadQuote();
        },
      },
    });
  }, [
    options.error,
    options.loading,
    reloadOptions,
    reloadQuote,
    loadErrorToastId,
    t,
  ]);
  useEffect(
    () => () => {
      toastRef.current?.dismiss(loadErrorToastId);
    },
    [loadErrorToastId],
  );
  const person = options.data?.persons.find((p) => p.id === draft?.personId);
  const scooter = options.data?.scooters.find((s) => s.id === draft?.scooterId);
  const getUnavailableReasons = (
    item: import("@/components/ScooterSelect").ScooterSelectItem,
  ) =>
    scooterRentalBlockers(
      item,
      draft?.period
        ? v1.rentals.rentalDateOnly(new Date(draft.period.startsAt))
        : v1.common.dateOnlyToday(),
    ).map((reason) => t(reason));
  const scooterBlockers = scooter ? getUnavailableReasons(scooter) : [];
  const authorized = user?.id === userId && canAccess(user, "rentals.create");

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (
      !draft ||
      !returnedDraftId ||
      !returnedPersonId ||
      store.storageError ||
      returnConsumed.current
    )
      return;
    returnConsumed.current = true;
    router.replace("/rentals/new");
  }, [draft, returnedDraftId, returnedPersonId, store.storageError, router]);

  useEffect(() => {
    const refresh = () => reloadOptions();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [reloadOptions]);

  if (!draft)
    return (
      <PageLayout>
        <p role="status">{t("loading")}</p>
      </PageLayout>
    );
  if (!authorized)
    return (
      <PageLayout>
        <Feedback error={t("permissionLost")} />
      </PageLayout>
    );
  if (draft.createdRentalId)
    return (
      <PageLayout>
        <p>{t("alreadyCreated")}</p>
        <Link href={`/rentals/${encodeURIComponent(draft.createdRentalId)}`}>
          {t("openRental")}
        </Link>
      </PageLayout>
    );

  const ready = Boolean(
    person &&
    scooter &&
    ((draft.renterDrives ?? true) || Boolean(draft.driverPersonIds?.length)) &&
    !quote.loading &&
    !quote.error &&
    quote.data &&
    !scooterBlockers.length &&
    draft.period &&
    !options.loading &&
    !options.error,
  );
  const missingPerson = Boolean(
    draft.personId && options.data && !options.loading && !person,
  );
  const missingScooter = Boolean(
    draft.scooterId && options.data && !options.loading && !scooter,
  );
  const dateFormat = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: draft.period?.timeZone,
  });
  const periodLabel = draft.period
    ? t("period", {
        start: dateFormat.format(new Date(draft.period.startsAt)),
        end: dateFormat.format(new Date(draft.period.endsAt)),
      })
    : null;

  function edit() {
    store.update({ step: "details" });
    setAttempted(false);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current || task.busy || !draft || draft.submissionUncertain)
      return;
    setAttempted(true);
    if (!ready) {
      store.update({ step: "details" });
      return;
    }
    if (draft.step === "details") {
      store.update({ step: "review", detailsCompleted: true });
      return;
    }
    submitting.current = true;
    await task.run(async () => {
      const parsed = v1.rentals.createRentalInputSchema.safeParse({
        promotion,
        ...(draft.conclusionContext
          ? { conclusionContext: draft.conclusionContext }
          : {}),
        rentalPaymentMethod,
        depositPaymentMethod,
        driverPersonIds: [
          ...new Set([
            ...((draft.renterDrives ?? true) ? [draft.personId] : []),
            ...(draft.driverPersonIds ?? []),
          ]),
        ],
        personId: draft.personId,
        scooterId: draft.scooterId,
        startsAt: draft.period!.startsAt,
        endsAt: draft.period!.endsAt,
        customerNotes: draft.customerNotes,
        internalNotes: draft.internalNotes,
      });
      if (!parsed.success) throw new Error(t("validationError"));
      // Persist the uncertain state BEFORE sending. Reloading a pending request
      // must not offer another POST when its outcome is unknown.
      if (!store.update({ submissionUncertain: true })) {
        store.update({ submissionUncertain: false });
        throw new Error(t("storageError"));
      }
      let rental: v1.rentals.Rental;
      try {
        rental = await webApi.fetch("/v1/rentals", v1.rentals.rentalSchema, {
          method: "POST",
          json: parsed.data,
        });
      } catch (error) {
        if (
          error instanceof ApiError &&
          error.status >= 400 &&
          error.status < 500
        )
          store.update({ submissionUncertain: false });
        options.reload();
        throw error;
      }
      // Keep a completion receipt if removing browser storage fails.
      store.update({ createdRentalId: rental.id, submissionUncertain: false });
      store.discard();
      leaveGuard.complete();
      if (mounted.current)
        router.replace(`/rentals/${encodeURIComponent(rental.id)}`);
    });
    submitting.current = false;
  }

  function addPerson() {
    if (!draft || task.busy) return;
    // Explicit flush: never leave while the only copy is still in React state.
    if (store.preparePersonCreation())
      router.push(
        `/persons/new?returnToRental=${encodeURIComponent(draft.id)}`,
      );
  }

  return (
    <PageLayout paddingX="none" paddingTop="compact" className="gap-2 md:gap-6">
      <PageHeaderNavigation
        onBack={() => {
          if (task.busy || submitting.current) return;
          if (canPersistRentalDraft(draft))
            leaveGuard.requestLeave(() => router.replace("/rentals"));
          else if (store.discard()) router.replace("/rentals");
        }}
        backDisabled={task.busy}
      />
      <WizardForm
        noValidate
        onSubmit={submit}
        className="pb-16 sm:pb-24"
        activeIndex={draft.step === "details" ? 0 : 1}
        progressLabel={t("progress")}
        exitConfirmation={{
          open: leaveGuard.open,
          onOpenChange: (open) => {
            if (!open) leaveGuard.cancel();
          },
          title: t("leaveTitle"),
          description: t("leaveDescription"),
          children: store.storageError ? (
            <Feedback error={t("storageError")} />
          ) : null,
          actions: (
            <>
              <SaveButton
                type="button"
                variant="destructive"
                {...formAction("delete", { pending: false }, t("discard"))}
                onClick={() => leaveGuard.leave(store.discard)}
              />
              <SaveButton
                type="button"
                {...formAction(
                  "save",
                  { pending: false, error: store.storageError },
                  t("saveDraft"),
                )}
                onClick={() => leaveGuard.leave(() => store.update({}))}
              />
            </>
          ),
        }}
        disabled={task.busy || leaveGuard.open}
        canGoNext={ready && !draft.submissionUncertain}
        onStepChange={(index) => {
          if (task.busy || submitting.current) return;
          if (index === 0) edit();
          else if (ready && !draft.submissionUncertain) {
            setAttempted(true);
            store.update({ step: "review", detailsCompleted: true });
          }
        }}
        steps={[
          {
            id: "details",
            label: t("details"),
            content: (
              <>
                {options.loading ? <p role="status">{t("loading")}</p> : null}
                <FieldGroup>
                  <Field>
                    <FieldLabel id="rental-person-label">
                      {rentalT("person")}
                    </FieldLabel>
                    <PersonSelect
                      id="rental-person"
                      label={rentalT("person")}
                      labelledById="rental-person-label"
                      describedById="rental-person-error"
                      persons={options.data?.persons ?? []}
                      value={draft.personId}
                      onValueChange={(personId) => store.update({ personId })}
                      disabled={task.busy || options.loading}
                      invalid={missingPerson || (attempted && !person)}
                      onAddPerson={
                        canAccess(user, "persons.create")
                          ? addPerson
                          : undefined
                      }
                    />
                    <FieldError id="rental-person-error">
                      {missingPerson
                        ? t("personUnavailable")
                        : attempted && !person
                          ? t("personRequired")
                          : null}
                    </FieldError>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="rental-start-day">
                      {t("startDate")}
                    </FieldLabel>
                    <DatePartsInput
                      baseId="rental-start"
                      label={t("startDate")}
                      value={draft.startDate}
                      onChange={(startDate) =>
                        store.update({
                          startDate,
                          period: weeklyPeriod(
                            startDate,
                            promotion === "three_plus_one" ? 28 : 7,
                          ),
                        })
                      }
                      disabled={task.busy}
                      invalid={attempted && !draft.period}
                      aria-describedby="rental-start-error rental-period"
                    />
                    <FieldError id="rental-start-error">
                      {attempted && !draft.period ? t("dateRequired") : null}
                    </FieldError>
                    <FieldDescription id="rental-period">
                      {periodLabel ?? t("dateHint")}
                    </FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel id="rental-scooter-label">
                      {rentalT("scooter")}
                    </FieldLabel>
                    <ScooterSelect
                      id="rental-scooter"
                      label={rentalT("scooter")}
                      labelledById="rental-scooter-label"
                      describedById="rental-scooter-error"
                      scooters={options.data?.scooters ?? []}
                      getUnavailableReasons={getUnavailableReasons}
                      value={draft.scooterId}
                      onValueChange={(scooterId) => store.update({ scooterId })}
                      disabled={task.busy || options.loading}
                      invalid={
                        missingScooter ||
                        Boolean(scooterBlockers.length) ||
                        (attempted && !scooter)
                      }
                    />
                    <FieldError id="rental-scooter-error">
                      {scooterBlockers.length
                        ? scooterBlockers.join(" · ")
                        : missingScooter
                          ? t("scooterUnavailable")
                          : attempted && !scooter
                            ? t("scooterRequired")
                            : null}
                    </FieldError>
                  </Field>
                  <label className="flex items-start gap-3 text-sm">
                    <Checkbox
                      checked={draft.renterDrives ?? true}
                      disabled={task.busy}
                      onCheckedChange={(value) =>
                        store.update({ renterDrives: value === true })
                      }
                    />
                    {contractsT("sameDriver")}
                  </label>
                  <Field>
                    <FieldLabel>{contractsT("drivers")}</FieldLabel>
                    <SheetSelect
                      multiple
                      label={contractsT("drivers")}
                      value={draft.driverPersonIds ?? []}
                      onValueChange={(driverPersonIds) =>
                        store.update({ driverPersonIds })
                      }
                      options={(options.data?.persons ?? [])
                        .filter(
                          (person) =>
                            !(draft.renterDrives ?? true) ||
                            person.id !== draft.personId,
                        )
                        .map((person) => ({
                          value: person.id,
                          label: `${person.firstName} ${person.lastName} · ${person.phone}`,
                        }))}
                      searchPlaceholder={contractsT("drivers")}
                      clearSearchLabel={contractsT("cancel")}
                      closeLabel={contractsT("cancel")}
                      emptyMessage={contractsT("loading")}
                      disabled={task.busy}
                    />
                  </Field>
                  <Choice
                    label={contractsT("promotion")}
                    value={promotion}
                    onChange={(value) => {
                      const next =
                        v1.rentals.rentalPromotionSchema.parse(value);
                      store.update({
                        promotion: next,
                        period: weeklyPeriod(
                          draft.startDate,
                          next === "three_plus_one" ? 28 : 7,
                        ),
                      });
                    }}
                    options={[
                      { value: "standard", label: contractsT("standard") },
                      {
                        value: "three_plus_one",
                        label: contractsT("threePlusOne"),
                      },
                    ]}
                    disabled={task.busy}
                  />
                  <p className="text-sm text-muted-foreground">
                    {promotionEligibilityMessage}
                  </p>
                  <Choice
                    label={contractsT("conclusionContext")}
                    value={draft.conclusionContext ?? ""}
                    onChange={(value) =>
                      store.update({
                        conclusionContext:
                          v1.rentals.rentalConclusionContextSchema.parse(value),
                      })
                    }
                    options={v1.rentals.rentalConclusionContextSchema.options.map(
                      (value) => ({ value, label: contractsT(value) }),
                    )}
                    disabled={task.busy}
                  />
                  <p className="text-sm text-muted-foreground">
                    {contractsT("contextHint")}
                  </p>
                  <Choice
                    label={`${contractsT("rent")} · ${contractsT("method")}`}
                    value={rentalPaymentMethod}
                    onChange={(value) =>
                      store.update({
                        rentalPaymentMethod:
                          v1.rentals.rentalPaymentMethodSchema.parse(value),
                      })
                    }
                    options={v1.rentals.rentalPaymentMethodSchema.options.map(
                      (value) => ({ value, label: contractsT(value) }),
                    )}
                    disabled={task.busy}
                  />
                  <Choice
                    label={`${contractsT("deposit")} · ${contractsT("method")}`}
                    value={depositPaymentMethod}
                    onChange={(value) =>
                      store.update({
                        depositPaymentMethod:
                          v1.rentals.rentalPaymentMethodSchema.parse(value),
                      })
                    }
                    options={v1.rentals.rentalPaymentMethodSchema.options.map(
                      (value) => ({ value, label: contractsT(value) }),
                    )}
                    disabled={task.busy}
                  />
                  {quote.loading && quoteScooterId ? (
                    <p role="status">{contractsT("loading")}</p>
                  ) : null}
                  <Feedback
                    error={
                      !options.error && !options.loading && options.data
                        ? quote.error
                        : null
                    }
                  />
                  {quote.error &&
                  !options.error &&
                  !options.loading &&
                  options.data ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={quote.reload}
                    >
                      {contractsT("retry")}
                    </Button>
                  ) : null}
                  {quote.data ? (
                    <div className="flex flex-col gap-2 text-sm">
                      <p>
                        {contractsT("weeklyRent")}:{" "}
                        {new Intl.NumberFormat(locale, {
                          style: "currency",
                          currency: "RON",
                        }).format(quote.data.weeklyRateMinor / 100)}
                      </p>
                      <p>
                        {contractsT("deposit")}:{" "}
                        {new Intl.NumberFormat(locale, {
                          style: "currency",
                          currency: "RON",
                        }).format(quote.data.depositMinor / 100)}
                      </p>
                      <p className="font-semibold">
                        {contractsT("initialTotal")}:{" "}
                        {new Intl.NumberFormat(locale, {
                          style: "currency",
                          currency: "RON",
                        }).format(quote.data.initialTotalMinor / 100)}
                      </p>
                      <p>{contractsT("agreementTerm")}</p>
                      <p>{contractsT("timezone")}</p>
                    </div>
                  ) : null}
                </FieldGroup>
              </>
            ),
          },
          {
            id: "review",
            label: t("review"),
            content: (
              <>
                <div className="flex flex-col gap-4">
                  {person ? (
                    <RentalPersonCard person={person} />
                  ) : (
                    <Feedback error={t("personUnavailable")} />
                  )}
                  {scooter ? (
                    <ScooterSelectRow scooter={scooter} />
                  ) : (
                    <Feedback error={t("scooterUnavailable")} />
                  )}
                  <p className="font-medium">{periodLabel}</p>
                </div>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="rental-customer-notes">
                      {rentalT("customerNotes")}
                    </FieldLabel>
                    <Textarea
                      id="rental-customer-notes"
                      value={draft.customerNotes}
                      maxLength={4000}
                      disabled={task.busy}
                      onChange={(event) =>
                        store.update({ customerNotes: event.target.value })
                      }
                    />
                    <FieldDescription>
                      {t("customerNotesHint")}
                    </FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="rental-internal-notes">
                      {rentalT("internalNotes")}
                    </FieldLabel>
                    <Textarea
                      id="rental-internal-notes"
                      value={draft.internalNotes}
                      maxLength={4000}
                      disabled={task.busy}
                      onChange={(event) =>
                        store.update({ internalNotes: event.target.value })
                      }
                    />
                    <FieldDescription>
                      {t("internalNotesHint")}
                    </FieldDescription>
                  </Field>
                </FieldGroup>
              </>
            ),
          },
        ]}
        footer={
          <FormActions
            ref={actionsRef}
            sticky
            className="mt-auto"
            pending={task.busy}
            status={
              store.storageError
                ? t("unsaved")
                : canPersistRentalDraft(draft)
                  ? t("saved")
                  : undefined
            }
          >
            {draft.step === "review" ? (
              <Button
                type="button"
                variant="outline"
                className="hidden md:inline-flex"
                disabled={task.busy}
                onClick={edit}
              >
                {t("back")}
              </Button>
            ) : null}
            <SaveButton
              type="submit"
              disabled={
                task.busy ||
                options.loading ||
                Boolean(options.error) ||
                draft.submissionUncertain
              }
              {...formAction(
                draft.step === "review" ? "create" : "review",
                { pending: task.busy, error: task.error },
                draft.step === "review" ? rentalT("add") : t("continue"),
              )}
            />
          </FormActions>
        }
      >
        <Feedback error={task.error} />
        {store.storageError ? (
          <div data-rental-storage-error>
            <Feedback error={t("storageError")} />
          </div>
        ) : null}
        {draft.submissionUncertain && !task.busy ? (
          <Feedback error={t("uncertain")} />
        ) : null}
        {draft.submissionUncertain && !task.busy ? (
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/rentals">{t("checkRentals")}</Link>
            <Button
              type="button"
              variant="outline"
              onClick={() => store.update({ submissionUncertain: false })}
            >
              {t("confirmNotCreated")}
            </Button>
          </div>
        ) : null}
      </WizardForm>
    </PageLayout>
  );
}
