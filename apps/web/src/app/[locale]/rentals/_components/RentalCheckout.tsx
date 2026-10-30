"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { z } from "zod";
import { ApiError, v1 } from "@repo/api-shared";
import { motion } from "@repo/theme";
import {
  Badge,
  Button,
  Checkbox,
  Field,
  FieldLabel,
  FormActions,
  FormSection,
  Input,
  Textarea,
} from "@repo/ui/components";
import { SaveButton } from "@repo/ui/components/save-button";
import { SignatureCapture } from "@repo/ui/components/signature-capture";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import {
  Choice,
  Feedback,
  RemoteState,
  useRemote,
  useTask,
} from "@/components/WorkspaceForm";
import { useSession } from "@/components/auth/SessionProvider";
import { canAccess } from "@/lib/access";
import { webApi } from "@/lib/api";
import { downloadContractFile } from "@/lib/contract-download";
import { useFormAction } from "@/lib/form/use-form-action";
import { RentalInspectionMedia } from "./RentalInspectionMedia";

type Checkout = z.infer<typeof v1.rentals.rentalCheckoutSchema>;
type Inspection = v1.rentals.RentalInspectionData;
const root = "/v1/contracts";

/** Checkout uses authoritative readiness. Legacy rentals never receive fabricated evidence. */
export function RentalCheckout({
  rental,
  onChanged,
}: {
  rental: v1.rentals.Rental;
  onChanged: () => void;
}) {
  const t = useTranslations("contracts");
  const { user } = useSession();
  const issueLabel = (issue: string) => {
    if (issue.startsWith("drivers."))
      return t(
        issue.endsWith(".licence")
          ? "driverLicenceRequired"
          : issue.endsWith(".identity")
            ? "driverIdentityRequired"
            : "driverEligibilityRequired",
      );
    if (issue.startsWith("inspection.")) {
      const field = issue.slice("inspection.".length);
      return t.has(`readinessIssues.${field}`)
        ? t(`readinessIssues.${field}`)
        : t("readinessCheck", {
            item: t.has(field) ? t(field) : t("technical"),
          });
    }
    return t.has(`readinessIssues.${issue.replaceAll(".", "_")}`)
      ? t(`readinessIssues.${issue.replaceAll(".", "_")}`)
      : t("readinessReview");
  };
  const load = useCallback(
    () =>
      webApi.fetch(
        `/v1/rentals/${rental.id}/checkout`,
        v1.rentals.rentalCheckoutSchema,
        { cache: "no-store" },
      ),
    [rental.id],
  );
  const remote = useRemote(load);
  const reload = () => {
    remote.reload();
    onChanged();
  };
  if (rental.workflowVersion !== 1)
    return <p className="text-sm text-muted-foreground">{t("legacy")}</p>;
  return (
    <div className="flex flex-col gap-6 border-t pt-6">
      {!remote.data ? (
        <RemoteState error={remote.error} retry={remote.reload} />
      ) : (
        <>
          <Feedback error={remote.error} />
          <section className="flex flex-col gap-3" aria-live="polite">
            <h2 className="text-base font-semibold">{t("readiness")}</h2>
            <p>{t(remote.data.issues.length ? "blocked" : "ready")}</p>
            {remote.data.issues.length ? (
              <ul className="list-inside list-disc text-sm text-muted-foreground">
                {remote.data.issues.map((issue) => (
                  <li key={issue}>{issueLabel(issue)}</li>
                ))}
              </ul>
            ) : null}
            <Button variant="outline" onClick={remote.reload}>
              {t("refresh")}
            </Button>
          </section>
          {rental.status === "reserved" &&
          canAccess(user, "rentals.handover") ? (
            <CompleteHandover
              checkout={remote.data}
              rentalId={rental.id}
              onComplete={reload}
            />
          ) : null}
          {remote.data.rental.terms ? (
            <RentalTerms
              terms={remote.data.rental.terms}
              nextDue={remote.data.rental.nextPaymentDueAt}
            />
          ) : null}
          {canAccess(
            user,
            rental.status === "active" ? "rentals.return" : "rentals.handover",
          ) && ["reserved", "active"].includes(rental.status) ? (
            <InspectionForm
              key={`${remote.data.rental.revision}-${remote.data.expectedScooterUpdatedAt}`}
              checkout={remote.data}
              rentalId={rental.id}
              eventType={rental.status === "active" ? "return" : "handover"}
              onComplete={reload}
            />
          ) : null}
          {canAccess(user, "rentals.handover") && remote.data.rental.terms ? (
            <RentalReceipts
              checkout={remote.data}
              rentalId={rental.id}
              onComplete={reload}
            />
          ) : null}
          {rental.status === "reserved" && canAccess(user, "rentals.create") ? (
            <ConclusionContextForm
              key={`${remote.data.rental.revision}-${remote.data.rental.conclusionContext}`}
              rental={remote.data.rental}
              onComplete={reload}
            />
          ) : null}
          {canAccess(user, "documents.read") ? (
            <RentalDocumentPackages
              rentalId={rental.id}
              onChanged={remote.reload}
            />
          ) : null}
        </>
      )}
    </div>
  );
}

function RentalTerms({
  terms,
  nextDue,
}: {
  terms: v1.rentals.RentalTerms;
  nextDue?: string | null;
}) {
  const t = useTranslations("contracts");
  const locale = useLocale();
  const format = useFormatter();
  const money = (amount: number) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "RON",
    }).format(amount / 100);
  return (
    <FormSection title={t("quote")} panel>
      <dl className="grid gap-3 text-sm">
        <div>
          <dt>{t("weeklyRent")}</dt>
          <dd className="font-semibold">{money(terms.weeklyRateMinor)}</dd>
        </div>
        <div>
          <dt>{t("deposit")}</dt>
          <dd>{money(terms.depositMinor)}</dd>
        </div>
        <div>
          <dt>{t("initialTotal")}</dt>
          <dd className="font-semibold">{money(terms.initialTotalMinor)}</dd>
        </div>
        {nextDue ? (
          <div>
            <dt>{t("nextDue")}</dt>
            <dd>
              {format.dateTime(new Date(nextDue), {
                dateStyle: "long",
                timeStyle: "short",
                timeZone: terms.timezone,
              })}
            </dd>
          </div>
        ) : null}
      </dl>
      <div className="flex flex-col gap-2 text-sm text-muted-foreground">
        <p>{t("agreementTerm")}</p>
        <p>{t("timezone")}</p>
      </div>
    </FormSection>
  );
}

const inspectionResultSchema = z.object({
  inspection: v1.rentals.rentalInspectionSchema,
  revision: z.number().int(),
  issues: z.array(z.string()),
});
function InspectionForm({
  checkout,
  rentalId,
  eventType,
  onComplete,
}: {
  checkout: Checkout;
  rentalId: string;
  eventType: "handover" | "return";
  onComplete: () => void;
}) {
  const t = useTranslations("contracts");
  const action = useFormAction();
  const task = useTask();
  const [data, setData] = useState<Inspection>(checkout.prefill);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [autosaving, setAutosaving] = useState(false);
  const [autosaveError, setAutosaveError] = useState<string | null>(null);
  const autosavingRef = useRef(false);
  const lastAutosave = useRef<Inspection | null>(null);
  const latestData = useRef(data);
  useEffect(() => {
    latestData.current = data;
  }, [data]);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const update = (patch: Partial<Inspection>) => {
    setData((current) => ({ ...current, ...patch }));
    setDirty(true);
    setSaved(false);
  };
  useEffect(() => {
    if (
      !dirty ||
      mediaBusy ||
      conflict ||
      task.busy ||
      autosaving ||
      lastAutosave.current === data
    )
      return;
    const timer = window.setTimeout(() => {
      lastAutosave.current = data;
      const parsed = v1.rentals.saveRentalInspectionInputSchema.safeParse({
        revision: checkout.rental.revision,
        expectedScooterUpdatedAt: checkout.expectedScooterUpdatedAt,
        eventType,
        data,
      });
      if (!parsed.success) {
        setAutosaveError(t("inspectionDraftInvalid"));
        return;
      }
      autosavingRef.current = true;
      setAutosaving(true);
      setAutosaveError(null);
      void webApi
        .fetch(
          `/v1/rentals/${rentalId}/inspections/draft`,
          inspectionResultSchema,
          { method: "POST", json: parsed.data, keepalive: true },
        )
        .then(() => {
          if (latestData.current === data) {
            setDirty(false);
            setSaved(true);
          }
        })
        .catch((error: unknown) => {
          if (error instanceof ApiError && error.status === 409)
            setConflict(true);
          setAutosaveError(
            error instanceof Error ? error.message : t("failed"),
          );
        })
        .finally(() => {
          autosavingRef.current = false;
          setAutosaving(false);
        });
    }, motion.duration.formAutosave);
    return () => window.clearTimeout(timer);
  }, [
    data,
    dirty,
    mediaBusy,
    conflict,
    task.busy,
    autosaving,
    checkout.rental.revision,
    checkout.expectedScooterUpdatedAt,
    rentalId,
    eventType,
    t,
  ]);
  useEffect(() => {
    if (!dirty || conflict) return;
    const flush = () => {
      const parsed = v1.rentals.saveRentalInspectionInputSchema.safeParse({
        revision: checkout.rental.revision,
        expectedScooterUpdatedAt: checkout.expectedScooterUpdatedAt,
        eventType,
        data,
      });
      if (parsed.success)
        void webApi
          .fetch(
            `/v1/rentals/${rentalId}/inspections/draft`,
            inspectionResultSchema,
            { method: "POST", json: parsed.data, keepalive: true },
          )
          .catch(() => {});
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, [
    data,
    dirty,
    conflict,
    checkout.rental.revision,
    checkout.expectedScooterUpdatedAt,
    rentalId,
    eventType,
  ]);
  async function save(confirm: boolean) {
    if (mediaBusy || conflict || autosavingRef.current) return;
    await task.run(async () => {
      const json = v1.rentals.saveRentalInspectionInputSchema.parse({
        revision: checkout.rental.revision,
        expectedScooterUpdatedAt: checkout.expectedScooterUpdatedAt,
        eventType,
        data,
      });
      try {
        await webApi.fetch(
          `/v1/rentals/${rentalId}/inspections/${confirm ? "confirm" : "draft"}`,
          inspectionResultSchema,
          { method: "POST", json },
        );
      } catch (error) {
        if (error instanceof ApiError && error.status === 409)
          setConflict(true);
        throw error;
      }
      setDirty(false);
      setSaved(true);
      if (confirm) onComplete();
    });
  }
  const check = (
    value: string,
    onChange: (value: z.infer<typeof v1.rentals.inspectionCheckSchema>) => void,
    label: string,
  ) => (
    <Choice
      label={label}
      value={value}
      onChange={(value) =>
        onChange(v1.rentals.inspectionCheckSchema.parse(value))
      }
      options={v1.rentals.inspectionCheckSchema.options.map((value) => ({
        value,
        label: t(value),
      }))}
      disabled={task.busy}
    />
  );
  const equipment = (
    key:
      | "phoneStand"
      | "chargingOutlet"
      | "topCase"
      | "luggageRack"
      | "antitheft",
    value: Inspection["phoneStand"],
    onChange: (value: Inspection["phoneStand"]) => void,
  ) => (
    <div key={key} className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold">{t(key)}</h3>
      <Choice
        label={t("inspectionPresence")}
        value={value.presence}
        disabled={task.busy}
        onChange={(next) => {
          const presence = v1.rentals.equipmentPresenceSchema.parse(next);
          onChange({
            presence,
            condition: presence === "absent" ? "not_applicable" : "not_checked",
          });
        }}
        options={v1.rentals.equipmentPresenceSchema.options.map((value) => ({
          value,
          label: t(value),
        }))}
      />
      {check(
        value.condition,
        (condition) => onChange({ ...value, condition }),
        t("inspectionCondition"),
      )}
    </div>
  );
  return (
    <details className="rounded-lg border p-4" open={!checkout.inspection}>
      <summary className="cursor-pointer text-base font-semibold">
        {t("technical")}
      </summary>
      <form
        className="mt-4 flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!task.busy) void save(true);
        }}
        onBlur={(event) => {
          if (
            !event.currentTarget.contains(event.relatedTarget) &&
            dirty &&
            !task.busy
          )
            void save(false);
        }}
      >
        <p className="text-sm text-muted-foreground">{t("inspectHint")}</p>
        <FormSection columns={2}>
          <Field>
            <FieldLabel>{t("lastMileage")}</FieldLabel>
            <p className="text-sm">
              {checkout.lastKnownMileageKm ?? t("unknown")}
            </p>
          </Field>
          <NumberField
            label={t("mileage")}
            value={data.odometerDisplayedKm}
            disabled={task.busy}
            onChange={(odometerDisplayedKm) => update({ odometerDisplayedKm })}
          />
          <NumberField
            label={t("fuel")}
            value={data.fuelPercent}
            disabled={task.busy}
            onChange={(fuelPercent) => update({ fuelPercent })}
            max={100}
          />
          <NumberField
            label={t("helmets")}
            value={data.helmetCount}
            disabled={task.busy}
            onChange={(value) => update({ helmetCount: value ?? 0 })}
            max={10}
          />
          <NumberField
            label={t("keys")}
            value={data.keysCount}
            disabled={task.busy}
            onChange={(value) => update({ keysCount: value ?? 0 })}
            max={10}
          />
          {(
            [
              "odometer",
              "speedometer",
              "brakes",
              "tyres",
              "lights",
              "horn",
              "mirrors",
              "limiterCheck",
            ] as const
          ).map((key) => (
            <div key={key}>
              {check(
                data[key],
                (value) => update({ [key]: value }),
                t(key === "limiterCheck" ? "limiter" : key),
              )}
            </div>
          ))}
          {Object.entries(data.additionalChecks).map(([key, value]) => (
            <div key={key}>
              {check(
                value,
                (next) =>
                  update({
                    additionalChecks: { ...data.additionalChecks, [key]: next },
                  }),
                t(key),
              )}
            </div>
          ))}
          {(["phoneStand", "chargingOutlet"] as const).map((key) =>
            equipment(key, data[key], (value) => update({ [key]: value })),
          )}
          {Object.entries(data.additionalEquipment).map(([key, value]) =>
            equipment(
              key as "topCase" | "luggageRack" | "antitheft",
              value,
              (next) =>
                update({
                  additionalEquipment: {
                    ...data.additionalEquipment,
                    [key]: next,
                  },
                }),
            ),
          )}
          <NumberField
            label={t("measuredSpeed")}
            value={data.observedSpeedKmh}
            disabled={task.busy}
            onChange={(observedSpeedKmh) => update({ observedSpeedKmh })}
            max={300}
          />
          <Field>
            <FieldLabel htmlFor={`measurement-${rentalId}`}>
              {t("measurement")}
            </FieldLabel>
            <Textarea
              id={`measurement-${rentalId}`}
              value={data.speedVerificationMethod ?? ""}
              onChange={(e) =>
                update({ speedVerificationMethod: e.target.value || null })
              }
              disabled={task.busy}
            />
          </Field>
          <label className="flex items-start gap-3 text-sm">
            <Checkbox
              checked={data.operatorSpeedConfirmed}
              disabled={task.busy}
              onCheckedChange={(value) =>
                update({ operatorSpeedConfirmed: value === true })
              }
            />
            {t("speedConfigurationConfirmed")}
          </label>
          {(
            [
              "cosmeticNotes",
              "technicalNotes",
              "equipmentNotes",
              "criticalDefect",
            ] as const
          ).map((key) => (
            <Field key={key}>
              <FieldLabel htmlFor={`${key}-${rentalId}`}>{t(key)}</FieldLabel>
              <Textarea
                id={`${key}-${rentalId}`}
                value={data[key] ?? ""}
                onChange={(e) =>
                  update({
                    [key]:
                      key === "criticalDefect"
                        ? e.target.value || null
                        : e.target.value,
                  })
                }
                disabled={task.busy}
                maxLength={4000}
              />
            </Field>
          ))}
          <div className="col-span-full">
            <RentalInspectionMedia
              rentalId={rentalId}
              eventType={eventType}
              value={data.mediaIds}
              onChange={(mediaIds) => update({ mediaIds })}
              disabled={task.busy}
              onBusyChange={setMediaBusy}
            />
          </div>
        </FormSection>
        <Feedback error={task.error || autosaveError} />
        {conflict ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              {t("inspectionConflict")}
            </p>
            <Button type="button" variant="outline" onClick={onComplete}>
              {t("discardInspectionReload")}
            </Button>
          </div>
        ) : null}
        <FormActions
          status={autosaving ? t("autosaving") : saved ? t("saved") : undefined}
        >
          <SaveButton
            type="button"
            variant="outline"
            disabled={!dirty || mediaBusy || conflict || autosaving}
            {...action(
              "save",
              { pending: task.busy, error: task.error },
              t("saveInspectionDraft"),
            )}
            onClick={() => void save(false)}
          />
          <SaveButton
            type="submit"
            disabled={mediaBusy || conflict || autosaving}
            {...action(
              "confirm",
              { pending: task.busy, error: task.error },
              t("confirmInspection"),
            )}
          />
        </FormActions>
      </form>
    </details>
  );
}

function NumberField({
  label,
  value,
  onChange,
  disabled,
  max,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  disabled: boolean;
  max?: number;
}) {
  const id = useId();
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={0}
        max={max}
        value={value ?? ""}
        onChange={(event) =>
          onChange(
            event.target.value === "" ? null : Number(event.target.value),
          )
        }
        disabled={disabled}
      />
    </Field>
  );
}

function RentalReceipts({
  checkout,
  rentalId,
  onComplete,
}: {
  checkout: Checkout;
  rentalId: string;
  onComplete: () => void;
}) {
  const t = useTranslations("contracts");
  const action = useFormAction();
  const task = useTask();
  const locale = useLocale();
  const [purpose, setPurpose] = useState<"rent" | "deposit">("rent");
  const [method, setMethod] = useState<"cash" | "transfer" | "card">(
    checkout.rental.terms!.rentalPaymentMethod,
  );
  const [recoveryNeeded, recovery] = useState(false);
  const [reference, setReference] = useState("");
  const request = useRef<v1.rentals.RentalPaymentInput | null>(null);
  const [requestLocked, lockRequest] = useState(false);
  const serverCheckout = useRef(checkout);
  useEffect(() => {
    if (serverCheckout.current !== checkout) {
      serverCheckout.current = checkout;
      request.current = null;
      lockRequest(false);
      recovery(false);
    }
  }, [checkout]);
  const terms = checkout.rental.terms!;
  const existing = checkout.payments.filter(
    (payment) => payment.purpose === purpose && payment.status === "confirmed",
  );
  const amountMinor =
    purpose === "deposit"
      ? terms.depositMinor
      : existing.length
        ? terms.weeklyRateMinor
        : terms.initialRentMinor;
  const blocked = Boolean(
    existing.length &&
    (purpose === "deposit" || checkout.rental.status === "reserved"),
  );
  async function submit(event: FormEvent) {
    event.preventDefault();
    await task.run(async () => {
      const json =
        request.current ??
        v1.rentals.rentalPaymentInputSchema.parse({
          idempotencyKey: crypto.randomUUID(),
          purpose,
          method,
          amountMinor,
          evidenceReference: reference,
          receivedAt: new Date().toISOString(),
        });
      request.current = json;
      lockRequest(true);
      try {
        await webApi.fetch(
          `/v1/rentals/${rentalId}/payments`,
          v1.rentals.rentalPaymentSchema,
          { method: "POST", json },
        );
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) recovery(true);
        else if (
          error instanceof ApiError &&
          error.status >= 400 &&
          error.status < 500
        ) {
          request.current = null;
          lockRequest(false);
        }
        throw error;
      }
      request.current = null;
      lockRequest(false);
      setReference("");
      onComplete();
    });
  }
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-base font-semibold">{t("payment")}</h2>
      <ul className="flex flex-col gap-2 text-sm">
        {checkout.payments.map((payment) => (
          <li key={payment.id}>
            {t(payment.purpose)} ·{" "}
            {new Intl.NumberFormat(locale, {
              style: "currency",
              currency: "RON",
            }).format(payment.amountMinor / 100)}{" "}
            · {t(payment.method)} · {payment.evidenceReference}
          </li>
        ))}
      </ul>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <FormSection panel>
          <Choice
            label={t("payment")}
            value={purpose}
            onChange={(value) => {
              setPurpose(value as "rent" | "deposit");
              request.current = null;
              lockRequest(false);
            }}
            options={[
              { value: "rent", label: t("rent") },
              { value: "deposit", label: t("deposit") },
            ]}
            disabled={task.busy || requestLocked}
          />
          <Choice
            label={t("method")}
            value={method}
            onChange={(value) =>
              setMethod(v1.rentals.rentalPaymentMethodSchema.parse(value))
            }
            options={v1.rentals.rentalPaymentMethodSchema.options.map(
              (value) => ({ value, label: t(value) }),
            )}
            disabled={task.busy || requestLocked}
          />
          <Field>
            <FieldLabel>{t("amount")}</FieldLabel>
            <p className="font-semibold">
              {new Intl.NumberFormat(locale, {
                style: "currency",
                currency: "RON",
              }).format(amountMinor / 100)}
            </p>
          </Field>
          <Field>
            <FieldLabel htmlFor={`receipt-${rentalId}`}>
              {t("reference")}
            </FieldLabel>
            <Input
              id={`receipt-${rentalId}`}
              value={reference}
              required
              maxLength={1000}
              onChange={(e) => setReference(e.target.value)}
              disabled={task.busy || requestLocked}
            />
          </Field>
        </FormSection>
        <Feedback error={task.error} />
        {recoveryNeeded ? (
          <Button type="button" variant="outline" onClick={onComplete}>
            {t("refreshReceipts")}
          </Button>
        ) : null}
        <FormActions>
          <SaveButton
            type="submit"
            disabled={recoveryNeeded || blocked || !reference.trim()}
            {...action(
              "recordMoney",
              { pending: task.busy, error: task.error },
              t("confirmReceipt"),
            )}
          />
        </FormActions>
      </form>
    </section>
  );
}

function RentalDocumentPackages({
  rentalId,
  onChanged,
}: {
  rentalId: string;
  onChanged: () => void;
}) {
  const t = useTranslations("contracts");
  const action = useFormAction();
  const task = useTask();
  const { user } = useSession();
  const load = useCallback(
    () =>
      webApi.fetch(
        `${root}/rentals/${rentalId}/packages`,
        v1.contracts.packageListSchema,
        { cache: "no-store" },
      ),
    [rentalId],
  );
  const remote = useRemote(load);
  const reload = () => {
    remote.reload();
    onChanged();
  };
  const key = useRef(crypto.randomUUID());
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-base font-semibold">{t("documents")}</h2>
      {canAccess(user, "documents.manage") ? (
        <SaveButton
          type="button"
          {...action(
            "create",
            { pending: task.busy, error: task.error },
            t("createPackage"),
          )}
          onClick={() =>
            void task.run(async () => {
              await webApi.fetch(
                `${root}/rentals/${rentalId}/packages`,
                v1.contracts.documentPackageSchema,
                { method: "POST", json: { idempotencyKey: key.current } },
              );
              key.current = crypto.randomUUID();
              reload();
            })
          }
        />
      ) : null}
      <Feedback error={task.error} />
      {!remote.data ? (
        <RemoteState error={remote.error} retry={remote.reload} />
      ) : remote.data.items.length ? (
        remote.data.items.map((pkg) => (
          <PackageCard
            key={`${pkg.id}-${pkg.status}-${pkg.identityStatus}-${pkg.companyAcceptedAt}`}
            pkg={pkg}
            reload={reload}
          />
        ))
      ) : (
        <p>{t("noPackages")}</p>
      )}
    </section>
  );
}

function PackageCard({
  pkg,
  reload,
}: {
  pkg: v1.contracts.DocumentPackage;
  reload: () => void;
}) {
  const t = useTranslations("contracts");
  const action = useFormAction();
  const task = useTask();
  const { user } = useSession();
  const [reason, setReason] = useState("");
  const [channel, setChannel] = useState("sms");
  const operationKeys = useRef<Record<string, string>>({});
  async function perform(operation: string, json: unknown) {
    await task.run(async () => {
      await webApi.fetch(
        `${root}/packages/${pkg.id}/${operation}`,
        v1.contracts.documentPackageSchema,
        { method: "POST", json },
      );
      delete operationKeys.current[operation];
      reload();
    });
  }
  const idempotency = (operation: string) => ({
    idempotencyKey: (operationKeys.current[operation] ??= crypto.randomUUID()),
  });
  return (
    <article className="flex flex-col gap-4 rounded-lg border bg-card p-4 text-card-foreground">
      <header className="flex flex-wrap gap-3">
        <h3 className="text-base font-semibold">
          {t("version", { version: pkg.revision })}
        </h3>
        <Badge variant="secondary">
          {t.has(`statuses.${pkg.status}`)
            ? t(`statuses.${pkg.status}`)
            : t("pending")}
        </Badge>
      </header>
      <Feedback error={pkg.error || task.error} />
      <p className="break-all text-xs text-muted-foreground">
        {t("packageSha")}: {pkg.manifestHash}
      </p>
      <ul className="flex flex-col gap-3">
        {pkg.documents.map((doc) => (
          <li key={doc.id} className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-3 text-sm">
              <span className="font-medium">{t(doc.type)}</span>
              <Badge variant="secondary">{t(`statuses.${doc.status}`)}</Badge>
            </div>
            <p className="break-all text-xs text-muted-foreground">
              {t("documentSha")}: {doc.contentHash}
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                disabled={task.busy}
                onClick={() =>
                  void task.run(() =>
                    downloadContractFile(
                      `${root}/documents/${doc.id}/file?variant=presented`,
                      `${doc.type}-presented.pdf`,
                    ),
                  )
                }
              >
                {t("presented")}
              </Button>
              {doc.signedHash ? (
                <Button
                  variant="outline"
                  disabled={task.busy}
                  onClick={() =>
                    void task.run(() =>
                      downloadContractFile(
                        `${root}/documents/${doc.id}/file?variant=signed`,
                        `${doc.type}-signed.pdf`,
                      ),
                    )
                  }
                >
                  {t("signed")}
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {canAccess(user, "documents.manage") ? (
        <div className="flex flex-wrap gap-3">
          <SaveButton
            type="button"
            disabled={!["draft", "render_failed"].includes(pkg.status)}
            {...action(
              "create",
              { pending: task.busy, error: task.error },
              t("renderPackage"),
            )}
            onClick={() => void perform("render", idempotency("render"))}
          />
          <SaveButton
            type="button"
            disabled={pkg.status !== "rendered"}
            {...action(
              "confirm",
              { pending: task.busy, error: task.error },
              t("publishPackage"),
            )}
            onClick={() => void perform("publish", idempotency("publish"))}
          />
        </div>
      ) : null}
      {canAccess(user, "documents.manage") &&
      ["published", "signing"].includes(pkg.status) ? (
        <div className="flex flex-col gap-3">
          <Choice
            label={t("invite")}
            value={channel}
            onChange={setChannel}
            options={[
              { value: "sms", label: "SMS" },
              { value: "email", label: "E-mail" },
            ]}
            disabled={task.busy}
          />
          <SaveButton
            type="button"
            {...action(
              "invite",
              { pending: task.busy, error: task.error },
              t("invite"),
            )}
            onClick={() =>
              void perform("invite", { ...idempotency("invite"), channel })
            }
          />
        </div>
      ) : null}
      {canAccess(user, "identity.review") &&
      pkg.selfieAssetId &&
      pkg.identityDocumentId ? (
        <FormSection title={t("identity")} columns={1}>
          <p className="text-sm">
            {t.has(`statuses.${pkg.identityStatus}`)
              ? t(`statuses.${pkg.identityStatus}`)
              : t("pending")}
          </p>
          <Button
            variant="outline"
            disabled={task.busy}
            onClick={() =>
              void task.run(() =>
                downloadContractFile(
                  `${root}/packages/${pkg.id}/selfie`,
                  "identity-review",
                ),
              )
            }
          >
            {t("selfie")}
          </Button>
          {pkg.identityPhotos?.map((photo) => (
            <Button
              key={photo.assetId}
              variant="outline"
              disabled={task.busy}
              onClick={() =>
                void task.run(() =>
                  downloadContractFile(
                    `${root}/packages/${pkg.id}/identity-photos/${photo.assetId}`,
                    `identity-document-${photo.slot}`,
                  ),
                )
              }
            >
              {t("identityDocument")} · {photo.slot}
            </Button>
          ))}
          <Field>
            <FieldLabel htmlFor={`identity-${pkg.id}`}>
              {t("reason")}
            </FieldLabel>
            <Textarea
              id={`identity-${pkg.id}`}
              value={reason}
              maxLength={2000}
              onChange={(e) => setReason(e.target.value)}
              disabled={task.busy}
            />
          </Field>
          <FormActions>
            <SaveButton
              type="button"
              disabled={reason.trim().length < 5}
              {...action(
                "verify",
                { pending: task.busy, error: task.error },
                t("identityApprove"),
              )}
              onClick={() =>
                void perform("identity-review", {
                  approved: true,
                  reason,
                  selfieAssetId: pkg.selfieAssetId,
                  identityDocumentId: pkg.identityDocumentId,
                })
              }
            />
            <SaveButton
              type="button"
              variant="outline"
              disabled={reason.trim().length < 5}
              {...action(
                "verify",
                { pending: task.busy, error: task.error },
                t("identityReject"),
              )}
              onClick={() =>
                void perform("identity-review", {
                  approved: false,
                  reason,
                  selfieAssetId: pkg.selfieAssetId,
                  identityDocumentId: pkg.identityDocumentId,
                })
              }
            />
          </FormActions>
        </FormSection>
      ) : null}
      {canAccess(user, "documents.company_sign") &&
      !pkg.companyAcceptedAt &&
      pkg.customerCompletedAt ? (
        <FormSection title={t("companySign")} columns={1}>
          {pkg.documents
            .filter((doc) => !doc.companySignedAt)
            .map((doc) => (
              <CompanyDocumentSign
                key={doc.id}
                pkg={pkg}
                document={doc}
                reload={reload}
              />
            ))}
        </FormSection>
      ) : null}
      {canAccess(user, "evidence.export") ? (
        <Button
          variant="outline"
          disabled={task.busy}
          onClick={() =>
            void task.run(() =>
              downloadContractFile(
                `${root}/packages/${pkg.id}/evidence/archive`,
                "rental-evidence.zip",
              ),
            )
          }
        >
          {t("evidence")}
        </Button>
      ) : null}
      {pkg.customerCompletedAt &&
      pkg.companyAcceptedAt &&
      pkg.status === "published" &&
      canAccess(user, "documents.manage") ? (
        <SaveButton
          type="button"
          {...action(
            "complete",
            { pending: task.busy, error: task.error },
            t("finalizePackage"),
          )}
          onClick={() =>
            void task.run(async () => {
              await webApi.fetch(
                `${root}/packages/${pkg.id}/finalize`,
                v1.contracts.packageListSchema,
                { method: "POST", json: {} },
              );
              reload();
            })
          }
        />
      ) : null}
      {pkg.status === "signed" ? (
        <PackageDeliveries packageId={pkg.id} />
      ) : null}
    </article>
  );
}

const deliverySchema = z.object({
  id: z.string(),
  packageId: z.string(),
  channel: z.string(),
  status: z.string(),
  attempts: z.number().int(),
  sentAt: z.string().nullable(),
  deliveredAt: z.string().nullable(),
  acknowledgedAt: z.string().nullable(),
  error: z.string().nullable(),
  nextRunAt: z.string(),
});
const deliveryListSchema = z.object({ items: z.array(deliverySchema) });
function PackageDeliveries({ packageId }: { packageId: string }) {
  const t = useTranslations("contracts");
  const { user } = useSession();
  const load = useCallback(
    () =>
      webApi.fetch(
        `${root}/packages/${packageId}/deliveries`,
        deliveryListSchema,
        { cache: "no-store" },
      ),
    [packageId],
  );
  const remote = useRemote(load);
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-base font-semibold">{t("delivery")}</h3>
      <p className="text-sm text-muted-foreground">{t("deliveryHint")}</p>
      {remote.data ? (
        remote.data.items.map((delivery) => (
          <DeliveryRow
            key={`${delivery.id}-${delivery.status}`}
            delivery={delivery}
            canRetry={canAccess(user, "documents.manage")}
            reload={remote.reload}
          />
        ))
      ) : (
        <RemoteState error={remote.error} retry={remote.reload} />
      )}
      <Button variant="outline" onClick={remote.reload}>
        {t("refresh")}
      </Button>
    </section>
  );
}
function DeliveryRow({
  delivery,
  canRetry,
  reload,
}: {
  delivery: z.infer<typeof deliverySchema>;
  canRetry: boolean;
  reload: () => void;
}) {
  const t = useTranslations("contracts");
  const format = useFormatter();
  const action = useFormAction();
  const task = useTask();
  const [reason, setReason] = useState("");
  const [confirmedNotSent, confirmed] = useState(false);
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <p className="text-sm font-medium">
        {delivery.channel} ·{" "}
        {t.has(`deliveryStates.${delivery.status}`)
          ? t(`deliveryStates.${delivery.status}`)
          : t("pending")}
      </p>
      {delivery.sentAt ? (
        <p className="text-sm">
          {t("deliverySentAt", {
            date: format.dateTime(new Date(delivery.sentAt), {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: v1.rentals.RENTAL_POLICY.timezone,
            }),
          })}
        </p>
      ) : null}
      {delivery.deliveredAt ? (
        <p className="text-sm">
          {t("deliveryDeliveredAt", {
            date: format.dateTime(new Date(delivery.deliveredAt), {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: v1.rentals.RENTAL_POLICY.timezone,
            }),
          })}
        </p>
      ) : null}
      {delivery.acknowledgedAt ? (
        <p className="text-sm">
          {t("deliveryAcknowledgedAt", {
            date: format.dateTime(new Date(delivery.acknowledgedAt), {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: v1.rentals.RENTAL_POLICY.timezone,
            }),
          })}
        </p>
      ) : null}
      <Feedback error={delivery.error || task.error} />
      {canRetry && ["failed", "uncertain"].includes(delivery.status) ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (task.busy) return;
            void task.run(async () => {
              await webApi.fetch(
                `${root}/deliveries/${delivery.id}/retry`,
                z.object({ id: z.string(), status: z.literal("queued") }),
                {
                  method: "POST",
                  json: v1.contracts.retryDeliveryInputSchema.parse({
                    confirmedNotSent,
                    reason,
                  }),
                },
              );
              reload();
            });
          }}
        >
          <Field>
            <FieldLabel htmlFor={`retry-${delivery.id}`}>
              {t("reason")}
            </FieldLabel>
            <Textarea
              id={`retry-${delivery.id}`}
              required
              minLength={5}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              disabled={task.busy}
            />
          </Field>
          {delivery.status === "uncertain" ? (
            <label className="flex items-start gap-3 text-sm">
              <Checkbox
                checked={confirmedNotSent}
                onCheckedChange={(value) => confirmed(value === true)}
                disabled={task.busy}
              />
              {t("confirmedNotSent")}
            </label>
          ) : null}
          <FormActions>
            <SaveButton
              type="submit"
              disabled={
                reason.trim().length < 5 ||
                (delivery.status === "uncertain" && !confirmedNotSent)
              }
              {...action(
                "invite",
                { pending: task.busy, error: task.error },
                t("retryDelivery"),
              )}
            />
          </FormActions>
        </form>
      ) : null}
    </div>
  );
}

function CompanyDocumentSign({
  pkg,
  document,
  reload,
}: {
  pkg: v1.contracts.DocumentPackage;
  document: v1.contracts.DocumentPackage["documents"][number];
  reload: () => void;
}) {
  const t = useTranslations("contracts");
  const action = useFormAction();
  const task = useTask();
  const [signaturePng, signature] = useState<string | null>(null);
  const [acceptance, accept] = useState(false);
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!signaturePng || !acceptance || task.busy) return;
        void task.run(async () => {
          await webApi.fetch(
            `${root}/packages/${pkg.id}/company-sign`,
            v1.contracts.documentPackageSchema,
            {
              method: "POST",
              json: {
                documentId: document.id,
                contentHash: document.contentHash,
                signaturePng,
                acceptance: true,
              },
            },
          );
          reload();
        });
      }}
    >
      <h3 className="text-sm font-semibold">{t(document.type)}</h3>
      <SignatureCapture
        label={t("signature")}
        hint={t("signatureHint")}
        clearLabel={t("clearSignature")}
        onChange={signature}
        disabled={task.busy}
      />
      <label className="flex items-start gap-3 text-sm">
        <Checkbox
          checked={acceptance}
          disabled={task.busy}
          onCheckedChange={(value) => accept(value === true)}
        />
        {t("companyAcceptance")}
      </label>
      <Feedback error={task.error} />
      <FormActions>
        <SaveButton
          type="submit"
          disabled={!signaturePng || !acceptance}
          {...action(
            "confirm",
            { pending: task.busy, error: task.error },
            t("companySign"),
          )}
        />
      </FormActions>
    </form>
  );
}

function CompleteHandover({
  checkout,
  rentalId,
  onComplete,
}: {
  checkout: Checkout;
  rentalId: string;
  onComplete: () => void;
}) {
  const t = useTranslations("contracts");
  const action = useFormAction();
  const task = useTask();
  const [recipientPersonId, setRecipient] = useState(
    checkout.handoverRecipients.length === 1
      ? checkout.handoverRecipients[0]!.personId
      : "",
  );
  const [originalIdentityChecked, checked] = useState(false);
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (task.busy || checkout.issues.length || !originalIdentityChecked)
          return;
        void task.run(async () => {
          const json = v1.rentals.rentalHandoverInputSchema.parse({
            revision: checkout.rental.revision,
            recipientPersonId,
            originalIdentityChecked,
          });
          await webApi.fetch(
            `/v1/rentals/${rentalId}/handover`,
            v1.rentals.rentalSchema,
            { method: "POST", json },
          );
          onComplete();
        });
      }}
    >
      <Choice
        label={t("actualRecipient")}
        value={recipientPersonId}
        onChange={setRecipient}
        options={checkout.handoverRecipients.map((person) => ({
          value: person.personId,
          label: `${person.firstName} ${person.lastName}`,
        }))}
        disabled={task.busy}
      />
      <label className="flex items-start gap-3 text-sm">
        <Checkbox
          checked={originalIdentityChecked}
          onCheckedChange={(value) => checked(value === true)}
          disabled={task.busy}
        />
        {t("originalIdentityChecked")}
      </label>
      <Feedback error={task.error} />
      <FormActions>
        <SaveButton
          type="submit"
          disabled={
            Boolean(checkout.issues.length) ||
            !recipientPersonId ||
            !originalIdentityChecked
          }
          {...action(
            "confirm",
            { pending: task.busy, error: task.error },
            t("completeHandover"),
          )}
        />
      </FormActions>
    </form>
  );
}

function ConclusionContextForm({
  rental,
  onComplete,
}: {
  rental: v1.rentals.Rental;
  onComplete: () => void;
}) {
  const t = useTranslations("contracts");
  const action = useFormAction();
  const task = useTask();
  const [context, setContext] = useState(rental.conclusionContext ?? "");
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!context || task.busy) return;
        void task.run(async () => {
          const json = v1.rentals.rentalContextInputSchema.parse({
            revision: rental.revision,
            conclusionContext: context,
          });
          await webApi.fetch(
            `/v1/rentals/${rental.id}/context`,
            v1.rentals.rentalSchema,
            { method: "POST", json },
          );
          onComplete();
        });
      }}
    >
      <Choice
        label={t("conclusionContext")}
        value={context}
        onChange={(value) =>
          setContext(v1.rentals.rentalConclusionContextSchema.parse(value))
        }
        options={v1.rentals.rentalConclusionContextSchema.options.map(
          (value) => ({ value, label: t(value) }),
        )}
        disabled={task.busy}
      />
      <p className="text-sm text-muted-foreground">{t("contextHint")}</p>
      <Feedback error={task.error} />
      <FormActions>
        <SaveButton
          type="submit"
          disabled={!context || context === rental.conclusionContext}
          {...action(
            "save",
            { pending: task.busy, error: task.error },
            t("saveContext"),
          )}
        />
      </FormActions>
    </form>
  );
}
