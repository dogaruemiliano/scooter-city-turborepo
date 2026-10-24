"use client";

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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Feedback, useRemote, useTask } from "@/components/WorkspaceForm";
import { useWorkspaceNotifications } from "@/components/WorkspaceNotifications";
import { useSession } from "@/components/auth/SessionProvider";
import { Link, useRouter } from "@/i18n/navigation";
import { canAccess } from "@/lib/access";
import { webApi } from "@/lib/api";
import { useFormAction } from "@/lib/form/use-form-action";
import { scooterRentalBlockers } from "../_lib/scooter-rental-blockers";
import { canPersistRentalDraft, weeklyPeriod } from "../_lib/rental-draft";
import { RentalPersonCard } from "./RentalPersonCard";
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
  const locale = useLocale();
  const router = useRouter();
  const { user } = useSession();
  const formAction = useFormAction();
  const task = useTask({
    [v1.problems.MAINTENANCE_HOLD_ERROR_CODE]: rentalT("maintenanceHold"),
  });
  const store = useRentalDraft(
    userId,
    {
      draftId: returnedDraftId,
      personId: returnedPersonId,
    },
    t("storageError"),
  );
  const { draft } = store;
  const [attempted, setAttempted] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
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
        },
      },
    });
  }, [options.error, options.loading, reloadOptions, loadErrorToastId, t]);
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
    scooterRentalBlockers(item, v1.common.dateOnlyToday()).map((reason) =>
      t(reason),
    );
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

  if (!draft) return <p role="status">{t("loading")}</p>;
  if (!authorized) return <Feedback error={t("permissionLost")} />;
  if (draft.createdRentalId)
    return (
      <div className="flex flex-col gap-4 p-6">
        <p>{t("alreadyCreated")}</p>
        <Link href={`/rentals/${encodeURIComponent(draft.createdRentalId)}`}>
          {t("openRental")}
        </Link>
      </div>
    );

  const ready = Boolean(
    person &&
    scooter &&
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
    <div className="mx-auto flex w-full max-w-screen-lg flex-1 flex-col gap-6 py-6 sm:py-10">
      <PageHeaderNavigation
        onBack={() => {
          if (task.busy || submitting.current) return;
          if (canPersistRentalDraft(draft)) setLeaveOpen(true);
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
        hideHeadingOnMobile
        disabled={task.busy || leaveOpen}
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
                          period: weeklyPeriod(startDate),
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
      <Dialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("leaveTitle")}</DialogTitle>
            <DialogDescription>{t("leaveDescription")}</DialogDescription>
          </DialogHeader>
          {store.storageError ? <Feedback error={t("storageError")} /> : null}
          <DialogFooter className="flex-row justify-between sm:justify-between">
            <SaveButton
              type="button"
              variant="destructive"
              {...formAction("delete", { pending: false }, t("discard"))}
              onClick={() => {
                if (store.discard()) router.replace("/rentals");
              }}
            />
            <SaveButton
              type="button"
              {...formAction(
                "save",
                { pending: false, error: store.storageError },
                t("saveDraft"),
              )}
              onClick={() => {
                if (store.update({})) router.replace("/rentals");
              }}
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
