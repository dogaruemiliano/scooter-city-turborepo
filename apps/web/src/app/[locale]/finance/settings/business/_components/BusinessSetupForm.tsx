"use client";

import { ApiError, v1 } from "@repo/api-shared";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
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
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Checkbox,
  Input,
  Label,
  SearchSelect,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components";
import {
  AlertCircleIcon,
  CircleCheckIcon,
  LandmarkIcon,
  LoaderCircleIcon,
  LogOutIcon,
  PlusIcon,
  Trash2Icon,
  UserRoundCheckIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useRef, useState, type FormEvent } from "react";

import { PageTitleOverride } from "@/components/PageTitleOverride";
import {
  BusinessSetupPartialError,
  createBusinessSetup,
  endBusinessOwner,
  endVatRegistration,
  startBusinessOwner,
  startVatRegistration,
  searchBusinessUsers,
  updateVatRegistration,
  type BusinessSetupInput,
} from "../../../expenses/_lib/expense-api";
import type {
  BusinessSetupBootstrap,
  BusinessSetupVatPeriodOption,
} from "../../../expenses/_lib/expense-server";
import type {
  ExpenseOwnerOption,
  ExpenseUserOption,
} from "../../../expenses/_lib/expense-options";
import { DatePartsField } from "@/components/DateField";

interface BusinessSetupFormProps {
  bootstrap: BusinessSetupBootstrap;
  newExpenseHref: string;
}

interface BankAccountDraft {
  id: string;
  name: string;
  cardHolderUserId: string;
}

export function BusinessSetupForm(props: BusinessSetupFormProps) {
  return props.bootstrap.entities.length > 0 ? (
    <VatRegistrationManager {...props} />
  ) : (
    <InitialBusinessSetupForm {...props} />
  );
}

function InitialBusinessSetupForm({
  bootstrap,
  newExpenseHref,
}: BusinessSetupFormProps) {
  const t = useTranslations("finance.expenses.businessSetup");
  const financeT = useTranslations("finance");
  const router = useRouter();
  const [companyMode, setCompanyMode] = useState<"NEW" | "EXISTING">("NEW");
  const [companyId, setCompanyId] = useState("");
  const [legalName, setLegalName] = useState("");
  const [legalForm, setLegalForm] =
    useState<v1.finance.CompanyLegalForm>("SRL");
  const [taxIdentifier, setTaxIdentifier] = useState("");
  const [currency, setCurrency] = useState("RON");
  const nextBankAccountId = useRef(1);
  const [bankAccounts, setBankAccounts] = useState<BankAccountDraft[]>([]);
  const [ownerUserIds, setOwnerUserIds] = useState<string[]>([]);
  const [selectedOwnerUsers, setSelectedOwnerUsers] = useState<
    ExpenseUserOption[]
  >([]);
  const [ownerSelection, setOwnerSelection] = useState<string | null>(null);
  const [ownerEffectiveFrom, setOwnerEffectiveFrom] = useState(bootstrap.today);
  const [vatRegistered, setVatRegistered] = useState(false);
  const [vatCountryCode, setVatCountryCode] = useState("RO");
  const [vatNumber, setVatNumber] = useState("");
  const [vatEffectiveFrom, setVatEffectiveFrom] = useState(bootstrap.today);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    if (
      (companyMode === "NEW" && (!legalName.trim() || !taxIdentifier.trim())) ||
      (companyMode === "EXISTING" && !companyId)
    ) {
      setFeedback(t("feedback.required"));
      return;
    }
    if (
      bankAccounts.some(
        (account) => !account.name.trim() || !account.cardHolderUserId,
      )
    ) {
      setFeedback(t("feedback.required"));
      return;
    }
    const input: BusinessSetupInput = {
      company:
        companyMode === "EXISTING"
          ? { mode: "EXISTING", companyId }
          : { mode: "NEW", legalName, legalForm, taxIdentifier },
      defaultCurrency: currency,
      bankAccounts: bankAccounts.map((account) => ({
        name: account.name,
        cardHolderUserId: account.cardHolderUserId,
      })),
      ownerUserIds,
      ownerEffectiveFrom,
      vat: vatRegistered
        ? {
            registered: true,
            countryCode: vatCountryCode,
            vatNumber,
            effectiveFrom: vatEffectiveFrom,
          }
        : { registered: false },
    };

    setSubmitting(true);
    try {
      await createBusinessSetup(input);
      router.push(newExpenseHref);
      router.refresh();
    } catch (error) {
      if (error instanceof BusinessSetupPartialError) {
        setFeedback(t("feedback.partial", { entityId: error.entityId }));
        router.refresh();
      } else {
        setFeedback(
          error instanceof ApiError ? error.message : t("feedback.error"),
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-screen-xl flex-1 flex-col gap-8 px-4 py-6 sm:px-6 sm:py-10">
      <PageTitleOverride title={t("title")} />

      {feedback ? (
        <Alert variant="destructive">
          <AlertCircleIcon aria-hidden="true" />
          <AlertTitle>{t("feedback.title")}</AlertTitle>
          <AlertDescription>{feedback}</AlertDescription>
        </Alert>
      ) : null}

      <form
        className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.85fr)]"
        onSubmit={(event) => void submit(event)}
      >
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader className="border-b">
              <CardTitle>{t("company.title")}</CardTitle>
              <CardDescription>{t("company.description")}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              {bootstrap.companies.some((company) => company.taxIdentifier) ? (
                <fieldset className="flex flex-wrap gap-4">
                  <legend className="mb-2 text-sm font-medium">
                    {t("company.source")}
                  </legend>
                  {(["NEW", "EXISTING"] as const).map((mode) => (
                    <label
                      key={mode}
                      className="flex items-center gap-2 text-sm"
                    >
                      <input
                        type="radio"
                        name="company-mode"
                        checked={companyMode === mode}
                        className="size-4 accent-primary"
                        onChange={() => setCompanyMode(mode)}
                      />
                      {t(`company.modes.${mode}`)}
                    </label>
                  ))}
                </fieldset>
              ) : null}

              {companyMode === "EXISTING" ? (
                <SelectField
                  id="business-company"
                  label={t("company.existing")}
                  value={companyId}
                  placeholder={t("company.select")}
                  items={bootstrap.companies
                    .filter((company) => Boolean(company.taxIdentifier))
                    .map((company) => ({
                      value: company.id,
                      label: company.label,
                    }))}
                  onChange={setCompanyId}
                />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <SelectField
                    id="business-legal-form"
                    label={t("company.legalForm")}
                    value={legalForm}
                    placeholder={t("company.legalForm")}
                    items={v1.finance.COMPANY_LEGAL_FORMS.map((value) => ({
                      value,
                      label: financeT(`enums.companyLegalForms.${value}`),
                    }))}
                    onChange={(value) =>
                      setLegalForm(value as v1.finance.CompanyLegalForm)
                    }
                  />
                  <TextField
                    id="business-legal-name"
                    label={t("company.legalName")}
                    value={legalName}
                    required
                    onChange={setLegalName}
                  />
                  <TextField
                    id="business-tax-id"
                    label={t("company.taxIdentifier")}
                    value={taxIdentifier}
                    required
                    onChange={setTaxIdentifier}
                  />
                </div>
              )}
              <SelectField
                id="business-currency"
                label={t("company.currency")}
                value={currency}
                placeholder={t("company.currency")}
                items={["RON", "EUR", "USD"].map((value) => ({
                  value,
                  label: value,
                }))}
                onChange={setCurrency}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b">
              <CardTitle>{t("wallets.title")}</CardTitle>
              <CardDescription>{t("wallets.description")}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3 rounded-lg bg-muted p-4">
                  <CircleCheckIcon
                    aria-hidden="true"
                    className="shrink-0 text-primary"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{t("wallets.cash")}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("wallets.cashDescription")}
                    </p>
                  </div>
                  <Badge variant="secondary">{t("wallets.included")}</Badge>
                </div>
                {bankAccounts.map((account) => (
                  <div
                    key={account.id}
                    className="grid gap-4 rounded-lg border border-border p-4 sm:grid-cols-2"
                  >
                    <div className="flex items-center gap-2 sm:col-span-2">
                      <LandmarkIcon
                        aria-hidden="true"
                        className="shrink-0 text-muted-foreground"
                      />
                      <p className="min-w-0 flex-1 font-medium">
                        {account.name.trim() || t("wallets.newAccount")}
                      </p>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() =>
                          setBankAccounts((current) =>
                            current.filter((item) => item.id !== account.id),
                          )
                        }
                      >
                        <Trash2Icon data-icon="inline-start" />
                        {t("wallets.removeAccount")}
                      </Button>
                    </div>
                    <TextField
                      id={`bank-account-${account.id}-name`}
                      label={t("wallets.accountName")}
                      value={account.name}
                      required
                      onChange={(name) =>
                        setBankAccounts((current) =>
                          current.map((item) =>
                            item.id === account.id ? { ...item, name } : item,
                          ),
                        )
                      }
                    />
                    <ServerUserSearchSelect
                      id={`bank-account-${account.id}-holder`}
                      label={t("wallets.cardHolder")}
                      value={account.cardHolderUserId || null}
                      initialUsers={bootstrap.users}
                      initialNextCursor={bootstrap.usersNextCursor}
                      onChange={(cardHolderUserId) =>
                        setBankAccounts((current) =>
                          current.map((item) =>
                            item.id === account.id
                              ? {
                                  ...item,
                                  cardHolderUserId: cardHolderUserId ?? "",
                                }
                              : item,
                          ),
                        )
                      }
                    />
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    const id = String(nextBankAccountId.current++);
                    setBankAccounts((current) => [
                      ...current,
                      { id, name: "", cardHolderUserId: "" },
                    ]);
                  }}
                >
                  <PlusIcon data-icon="inline-start" />
                  {t("wallets.addAccount")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-6 lg:sticky lg:top-6">
          <Card>
            <CardHeader className="border-b">
              <CardTitle>{t("owners.title")}</CardTitle>
              <CardDescription>{t("owners.description")}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <TextField
                id="owner-effective-from"
                label={t("owners.effectiveFrom")}
                date
                value={ownerEffectiveFrom}
                required
                onChange={setOwnerEffectiveFrom}
              />
              <ServerUserSearchSelect
                id="initial-business-owner"
                label={t("owners.select")}
                value={ownerSelection}
                initialUsers={bootstrap.users}
                initialNextCursor={bootstrap.usersNextCursor}
                excludedUserIds={ownerUserIds}
                onChange={(userId, user) => {
                  setOwnerSelection(null);
                  if (userId && user) {
                    setOwnerUserIds((current) => [...current, userId]);
                    setSelectedOwnerUsers((current) => [...current, user]);
                  }
                }}
              />
              {ownerUserIds.map((userId) => {
                const user = selectedOwnerUsers.find(
                  (item) => item.id === userId,
                );
                return (
                  <div
                    key={userId}
                    className="flex items-center gap-3 rounded-lg bg-muted p-3"
                  >
                    <UserRoundCheckIcon
                      aria-hidden="true"
                      className="shrink-0 text-primary"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {user?.label ?? userId}
                      </p>
                      {user ? (
                        <p className="truncate text-xs text-muted-foreground">
                          {user.email}
                        </p>
                      ) : null}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setOwnerUserIds((current) =>
                          current.filter((id) => id !== userId),
                        );
                        setSelectedOwnerUsers((current) =>
                          current.filter((item) => item.id !== userId),
                        );
                      }}
                      aria-label={t("owners.remove")}
                    >
                      <Trash2Icon aria-hidden="true" />
                    </Button>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b">
              <CardTitle>{t("vat.title")}</CardTitle>
              <CardDescription>{t("vat.description")}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <label className="flex items-center gap-3 rounded-lg bg-muted p-4 text-sm font-medium">
                <Checkbox
                  checked={vatRegistered}
                  onCheckedChange={setVatRegistered}
                />
                {t("vat.registered")}
              </label>
              {vatRegistered ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField
                    id="vat-country"
                    label={t("vat.countryCode")}
                    value={vatCountryCode}
                    required
                    onChange={setVatCountryCode}
                  />
                  <TextField
                    id="vat-number"
                    label={t("vat.number")}
                    value={vatNumber}
                    required
                    onChange={setVatNumber}
                  />
                  <div className="sm:col-span-2">
                    <TextField
                      id="initial-vat-effective-from"
                      label={t("vat.effectiveFrom")}
                      date
                      value={vatEffectiveFrom}
                      required
                      onChange={setVatEffectiveFrom}
                    />
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <Card size="sm" className="lg:col-span-2">
          <CardFooter className="flex-col gap-3 sm:flex-row sm:justify-between">
            <p className="text-sm text-muted-foreground">
              {t("saveDescription")}
            </p>
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <LoaderCircleIcon
                  aria-hidden="true"
                  data-icon="inline-start"
                  className="animate-spin"
                />
              ) : null}
              {submitting ? t("saving") : t("save")}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </main>
  );
}

function VatRegistrationManager({ bootstrap }: BusinessSetupFormProps) {
  const t = useTranslations("finance.expenses.businessSetup");
  const [entityId, setEntityId] = useState(bootstrap.entities[0]?.id ?? "");
  const entity = bootstrap.entities.find((item) => item.id === entityId);
  const owners = bootstrap.owners.filter(
    (owner) => owner.legalEntityId === entityId,
  );
  const vatPeriods = bootstrap.vatPeriods.filter(
    (period) => period.legalEntityId === entityId,
  );

  return (
    <main className="mx-auto flex w-full max-w-screen-xl flex-1 flex-col gap-8 px-4 py-6 sm:px-6 sm:py-10">
      <PageTitleOverride title={t("manage.title")} />

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader className="border-b">
            <CardTitle>{t("manage.company")}</CardTitle>
            <CardDescription>
              {entity?.taxIdentifier
                ? t("manage.cui", { cui: entity.taxIdentifier })
                : t("manage.missingCui")}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <SelectField
              id="manage-business-entity"
              label={t("company.title")}
              value={entityId}
              placeholder={t("company.select")}
              items={bootstrap.entities.map((item) => ({
                value: item.id,
                label: item.label,
              }))}
              onChange={setEntityId}
            />

            <OwnerPeriodsSection
              key={`owners-${entityId}`}
              entityId={entityId}
              owners={owners}
              today={bootstrap.today}
              users={bootstrap.users}
              usersNextCursor={bootstrap.usersNextCursor}
            />
          </CardContent>
        </Card>

        <div className="lg:col-span-2">
          <VatPeriodsCard
            key={`vat-${entityId}`}
            canManage={Boolean(entity?.taxIdentifier)}
            entityId={entityId}
            periods={vatPeriods}
            today={bootstrap.today}
          />
        </div>
      </div>
    </main>
  );
}

function OwnerPeriodsSection({
  entityId,
  owners,
  today,
  users,
  usersNextCursor,
}: {
  entityId: string;
  owners: ExpenseOwnerOption[];
  today: string;
  users: ExpenseUserOption[];
  usersNextCursor: string | null;
}) {
  const t = useTranslations("finance.expenses.businessSetup");
  const commonT = useTranslations("finance.common");
  const router = useRouter();
  const openOwners = owners.filter(
    (owner) => owner.effectiveTo === null || owner.effectiveTo > today,
  );
  const unavailableUserIds = new Set(openOwners.map((owner) => owner.userId));
  const [addOpen, setAddOpen] = useState(false);
  const [ownerUserId, setOwnerUserId] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(today);
  const [endOwnerId, setEndOwnerId] = useState<string | null>(null);
  const [endDates, setEndDates] = useState<Record<string, string>>({});
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const selectedEndOwner =
    openOwners.find((owner) => owner.id === endOwnerId) ?? null;

  function changeAddOpen(nextOpen: boolean) {
    if (pendingAction) return;
    setAddOpen(nextOpen);
    if (nextOpen) {
      setOwnerUserId("");
      setEffectiveFrom(today);
      setFeedback(null);
    }
  }

  function changeEndOpen(nextOpen: boolean) {
    if (pendingAction) return;
    if (!nextOpen) {
      setEndOwnerId(null);
      setFeedback(null);
    }
  }

  async function addOwner(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    if (!ownerUserId) {
      setFeedback(t("owners.selectRequired"));
      return;
    }
    setPendingAction("add");
    try {
      await startBusinessOwner(entityId, {
        userId: ownerUserId,
        effectiveFrom,
      });
      setAddOpen(false);
      router.refresh();
    } catch (error) {
      setFeedback(
        error instanceof ApiError ? error.message : t("feedback.ownerError"),
      );
    } finally {
      setPendingAction(null);
    }
  }

  async function endOwner(
    event: FormEvent<HTMLFormElement>,
    owner: ExpenseOwnerOption,
  ) {
    event.preventDefault();
    setFeedback(null);
    const effectiveTo = endDates[owner.id] ?? ownerDefaultEnd(owner, today);
    setPendingAction(`end-${owner.id}`);
    try {
      await endBusinessOwner(entityId, owner.id, effectiveTo);
      setEndOwnerId(null);
      router.refresh();
    } catch (error) {
      setFeedback(
        error instanceof ApiError ? error.message : t("feedback.ownerError"),
      );
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div className="flex flex-col gap-4 border-t border-border pt-6">
      <h3 className="text-sm font-medium">{t("owners.title")}</h3>

      {feedback && !addOpen && !endOwnerId ? (
        <InlineError message={feedback} />
      ) : null}

      {openOwners.length > 0 ? (
        <div className="flex flex-col divide-y divide-border">
          {openOwners.map((owner) => {
            const scheduled = owner.effectiveFrom > today;
            return (
              <div
                key={owner.id}
                className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{owner.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {scheduled
                      ? t("owners.scheduledPeriod", {
                          from: owner.effectiveFrom,
                        })
                      : t("owners.activePeriod", {
                          from: owner.effectiveFrom,
                        })}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("owners.end")}
                  disabled={Boolean(pendingAction)}
                  onClick={() => {
                    setFeedback(null);
                    setEndOwnerId(owner.id);
                  }}
                >
                  <LogOutIcon aria-hidden="true" />
                </Button>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {t("owners.noneConfigured")}
        </p>
      )}

      <BottomSheet open={addOpen} onOpenChange={changeAddOpen}>
        <BottomSheetTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-start gap-1.5 px-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
            />
          }
        >
          <PlusIcon />
          {t("owners.addButton")}
        </BottomSheetTrigger>
        <BottomSheetContent>
          <form onSubmit={(event) => void addOwner(event)} className="contents">
            <BottomSheetHeader>
              <BottomSheetTitle>{t("owners.addTitle")}</BottomSheetTitle>
              <BottomSheetDescription>
                {t("owners.description")}
              </BottomSheetDescription>
            </BottomSheetHeader>
            <BottomSheetBody>
              {feedback ? <InlineError message={feedback} /> : null}
              <ServerUserSearchSelect
                id="manage-owner-user"
                label={t("owners.select")}
                value={ownerUserId || null}
                initialUsers={users}
                initialNextCursor={usersNextCursor}
                excludedUserIds={[...unavailableUserIds]}
                disabled={Boolean(pendingAction)}
                onChange={(value) => setOwnerUserId(value ?? "")}
              />
              <TextField
                id="manage-owner-effective-from"
                label={t("owners.effectiveFrom")}
                date
                value={effectiveFrom}
                required
                disabled={Boolean(pendingAction)}
                onChange={setEffectiveFrom}
              />
            </BottomSheetBody>
            <BottomSheetFooter className="sm:flex-row-reverse sm:justify-start">
              <Button type="submit" disabled={Boolean(pendingAction)}>
                {pendingAction === "add" ? (
                  <LoaderCircleIcon
                    aria-hidden="true"
                    data-icon="inline-start"
                    className="animate-spin"
                  />
                ) : null}
                {pendingAction === "add" ? t("owners.adding") : t("owners.add")}
              </Button>
              <BottomSheetClose
                render={
                  <Button
                    type="button"
                    variant="outline"
                    disabled={Boolean(pendingAction)}
                  />
                }
              >
                {commonT("cancel")}
              </BottomSheetClose>
            </BottomSheetFooter>
          </form>
        </BottomSheetContent>
      </BottomSheet>

      <BottomSheet
        open={Boolean(selectedEndOwner)}
        onOpenChange={changeEndOpen}
      >
        {selectedEndOwner ? (
          <BottomSheetContent>
            <form
              onSubmit={(event) => void endOwner(event, selectedEndOwner)}
              className="contents"
            >
              <BottomSheetHeader>
                <BottomSheetTitle>
                  {t("owners.endTitle", { name: selectedEndOwner.label })}
                </BottomSheetTitle>
                <BottomSheetDescription>
                  {t("owners.endDescription")}
                </BottomSheetDescription>
              </BottomSheetHeader>
              <BottomSheetBody>
                {feedback && endOwnerId ? (
                  <InlineError message={feedback} />
                ) : null}
                <TextField
                  id={`owner-${selectedEndOwner.id}-effective-to`}
                  label={t("owners.endOn")}
                  date
                  value={
                    endDates[selectedEndOwner.id] ??
                    ownerDefaultEnd(selectedEndOwner, today)
                  }
                  required
                  disabled={Boolean(pendingAction)}
                  onChange={(value) =>
                    setEndDates((current) => ({
                      ...current,
                      [selectedEndOwner.id]: value,
                    }))
                  }
                />
              </BottomSheetBody>
              <BottomSheetFooter className="sm:flex-row-reverse sm:justify-start">
                <Button
                  type="submit"
                  variant="destructive"
                  disabled={Boolean(pendingAction)}
                >
                  {pendingAction === `end-${selectedEndOwner.id}` ? (
                    <LoaderCircleIcon
                      aria-hidden="true"
                      data-icon="inline-start"
                      className="animate-spin"
                    />
                  ) : null}
                  {pendingAction === `end-${selectedEndOwner.id}`
                    ? t("owners.ending")
                    : t("owners.end")}
                </Button>
                <BottomSheetClose
                  render={
                    <Button
                      type="button"
                      variant="outline"
                      disabled={Boolean(pendingAction)}
                    />
                  }
                >
                  {commonT("cancel")}
                </BottomSheetClose>
              </BottomSheetFooter>
            </form>
          </BottomSheetContent>
        ) : null}
      </BottomSheet>
    </div>
  );
}

function VatPeriodsCard({
  canManage,
  entityId,
  periods,
  today,
}: {
  canManage: boolean;
  entityId: string;
  periods: BusinessSetupVatPeriodOption[];
  today: string;
}) {
  const t = useTranslations("finance.expenses.businessSetup");
  const activePeriod = periods.find(
    (period) =>
      period.effectiveFrom <= today &&
      (period.effectiveTo === null || period.effectiveTo > today),
  );
  const scheduledPeriods = periods
    .filter((period) => period.effectiveFrom > today)
    .toSorted((left, right) =>
      left.effectiveFrom.localeCompare(right.effectiveFrom),
    );

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>{t("vat.title")}</CardTitle>
        <CardDescription>
          {activePeriod
            ? t("manage.activeVat", {
                number: activePeriod.vatNumber,
                from: activePeriod.effectiveFrom,
              })
            : scheduledPeriods[0]
              ? t("manage.scheduledVat", {
                  number: scheduledPeriods[0].vatNumber,
                  from: scheduledPeriods[0].effectiveFrom,
                })
              : t("manage.notVatRegistered")}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {activePeriod ? (
          <ActiveVatPeriodForm
            canManage={canManage}
            entityId={entityId}
            period={activePeriod}
            today={today}
          />
        ) : null}
        {scheduledPeriods.map((period) => (
          <ScheduledVatPeriodForm
            key={period.id}
            canManage={canManage}
            entityId={entityId}
            period={period}
          />
        ))}
        {!activePeriod && scheduledPeriods.length === 0 ? (
          <NewVatPeriodForm
            canManage={canManage}
            entityId={entityId}
            today={today}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

function ActiveVatPeriodForm({
  canManage,
  entityId,
  period,
  today,
}: {
  canManage: boolean;
  entityId: string;
  period: BusinessSetupVatPeriodOption;
  today: string;
}) {
  const t = useTranslations("finance.expenses.businessSetup");
  const router = useRouter();
  const [effectiveTo, setEffectiveTo] = useState(
    period.effectiveFrom < today ? today : nextDate(period.effectiveFrom),
  );
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    setSubmitting(true);
    try {
      await endVatRegistration(entityId, period.id, effectiveTo);
      router.refresh();
    } catch (error) {
      setFeedback(
        error instanceof ApiError ? error.message : t("feedback.vatError"),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      className="grid gap-4 sm:grid-cols-2 sm:items-end"
      onSubmit={(event) => void submit(event)}
    >
      {feedback ? (
        <div className="sm:col-span-2">
          <InlineError message={feedback} />
        </div>
      ) : null}
      <TextField
        id={`vat-${period.id}-effective-to`}
        label={t("manage.endOn")}
        date
        value={effectiveTo}
        required
        disabled={submitting}
        onChange={setEffectiveTo}
      />
      <Button type="submit" disabled={submitting || !canManage}>
        {submitting ? (
          <LoaderCircleIcon
            aria-hidden="true"
            data-icon="inline-start"
            className="animate-spin"
          />
        ) : null}
        {submitting
          ? t("manage.endingRegistration")
          : t("manage.endRegistration")}
      </Button>
    </form>
  );
}

function ScheduledVatPeriodForm({
  canManage,
  entityId,
  period,
}: {
  canManage: boolean;
  entityId: string;
  period: BusinessSetupVatPeriodOption;
}) {
  const t = useTranslations("finance.expenses.businessSetup");
  const router = useRouter();
  const [countryCode, setCountryCode] = useState(period.countryCode);
  const [vatNumber, setVatNumber] = useState(period.vatNumber);
  const [effectiveFrom, setEffectiveFrom] = useState(period.effectiveFrom);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    setSubmitting(true);
    try {
      await updateVatRegistration(entityId, period.id, {
        countryCode,
        vatNumber,
        effectiveFrom,
      });
      router.refresh();
    } catch (error) {
      setFeedback(
        error instanceof ApiError ? error.message : t("feedback.vatError"),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      className="grid gap-4 border-t border-border pt-5 sm:grid-cols-2"
      onSubmit={(event) => void submit(event)}
    >
      <p className="text-sm font-medium sm:col-span-2">
        {t("manage.scheduledVat", {
          number: period.vatNumber,
          from: period.effectiveFrom,
        })}
      </p>
      {feedback ? (
        <div className="sm:col-span-2">
          <InlineError message={feedback} />
        </div>
      ) : null}
      <TextField
        id={`vat-${period.id}-country`}
        label={t("vat.countryCode")}
        value={countryCode}
        required
        disabled={submitting}
        onChange={setCountryCode}
      />
      <TextField
        id={`vat-${period.id}-number`}
        label={t("vat.number")}
        value={vatNumber}
        required
        disabled={submitting}
        onChange={setVatNumber}
      />
      <TextField
        id={`vat-${period.id}-effective-from`}
        label={t("vat.effectiveFrom")}
        date
        value={effectiveFrom}
        required
        disabled={submitting}
        onChange={setEffectiveFrom}
      />
      <Button type="submit" disabled={submitting || !canManage}>
        {submitting ? (
          <LoaderCircleIcon
            aria-hidden="true"
            data-icon="inline-start"
            className="animate-spin"
          />
        ) : null}
        {submitting
          ? t("manage.updatingRegistration")
          : t("manage.updateRegistration")}
      </Button>
    </form>
  );
}

function NewVatPeriodForm({
  canManage,
  entityId,
  today,
}: {
  canManage: boolean;
  entityId: string;
  today: string;
}) {
  const t = useTranslations("finance.expenses.businessSetup");
  const router = useRouter();
  const [countryCode, setCountryCode] = useState("RO");
  const [vatNumber, setVatNumber] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(today);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    setSubmitting(true);
    try {
      await startVatRegistration(entityId, {
        countryCode,
        vatNumber,
        effectiveFrom,
      });
      router.refresh();
    } catch (error) {
      setFeedback(
        error instanceof ApiError ? error.message : t("feedback.vatError"),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={(event) => void submit(event)}
    >
      {feedback ? (
        <div className="sm:col-span-2">
          <InlineError message={feedback} />
        </div>
      ) : null}
      <TextField
        id="manage-vat-country"
        label={t("vat.countryCode")}
        value={countryCode}
        required
        disabled={submitting}
        onChange={setCountryCode}
      />
      <TextField
        id="manage-vat-number"
        label={t("vat.number")}
        value={vatNumber}
        required
        disabled={submitting}
        onChange={setVatNumber}
      />
      <TextField
        id="manage-vat-effective-from"
        label={t("vat.effectiveFrom")}
        date
        value={effectiveFrom}
        required
        disabled={submitting}
        onChange={setEffectiveFrom}
      />
      <Button type="submit" disabled={submitting || !canManage}>
        {submitting ? (
          <LoaderCircleIcon
            aria-hidden="true"
            data-icon="inline-start"
            className="animate-spin"
          />
        ) : null}
        {submitting
          ? t("manage.startingRegistration")
          : t("manage.startRegistration")}
      </Button>
    </form>
  );
}

function InlineError({ message }: { message: string }) {
  const t = useTranslations("finance.expenses.businessSetup");
  return (
    <Alert variant="destructive">
      <AlertCircleIcon aria-hidden="true" />
      <AlertTitle>{t("feedback.title")}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

function ownerDefaultEnd(owner: ExpenseOwnerOption, today: string): string {
  return owner.effectiveFrom < today ? today : nextDate(owner.effectiveFrom);
}

function nextDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + 1));
  return date.toISOString().slice(0, 10);
}

function ServerUserSearchSelect({
  disabled,
  excludedUserIds = [],
  id,
  initialNextCursor,
  initialUsers,
  label,
  onChange,
  value,
}: {
  disabled?: boolean;
  excludedUserIds?: readonly string[];
  id: string;
  initialNextCursor: string | null;
  initialUsers: ExpenseUserOption[];
  label: string;
  onChange(value: string | null, user?: ExpenseUserOption): void;
  value: string | null;
}) {
  const t = useTranslations("finance.expenses.businessSetup");
  const [items, setItems] = useState(initialUsers);
  const [query, setQuery] = useState("");
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const [selectedUser, setSelectedUser] = useState<
    ExpenseUserOption | undefined
  >(() => initialUsers.find((user) => user.id === value));
  const excluded = new Set(excludedUserIds);
  const visibleItems = items.filter(
    (user) => !excluded.has(user.id) || user.id === value,
  );

  async function search(nextQuery: string, context: { signal: AbortSignal }) {
    setQuery(nextQuery);
    setLoading(true);
    setFailed(false);
    try {
      const result = await searchBusinessUsers(nextQuery, {
        signal: context.signal,
      });
      setItems(result.items.map(toExpenseUserOption));
      setNextCursor(result.nextCursor);
    } catch {
      if (!context.signal.aborted) setFailed(true);
    } finally {
      if (!context.signal.aborted) setLoading(false);
    }
  }

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setFailed(false);
    try {
      const result = await searchBusinessUsers(query, { cursor: nextCursor });
      setItems((current) => {
        const byId = new Map(current.map((item) => [item.id, item]));
        for (const item of result.items.map(toExpenseUserOption)) {
          byId.set(item.id, item);
        }
        return [...byId.values()];
      });
      setNextCursor(result.nextCursor);
    } catch {
      setFailed(true);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id} id={`${id}-label`}>
        {label}
      </Label>
      <SearchSelect
        id={id}
        ariaLabelledBy={`${id}-label`}
        value={value}
        selectedOption={
          selectedUser
            ? {
                value: selectedUser.id,
                label: selectedUser.label,
                description: selectedUser.email,
              }
            : undefined
        }
        disabled={disabled}
        options={visibleItems.map((user) => ({
          value: user.id,
          label: user.label,
          description: user.email,
        }))}
        serverSearch
        loading={loading}
        loadingMore={loadingMore}
        hasMore={Boolean(nextCursor)}
        errorMessage={failed ? t("users.searchError") : null}
        placeholder={t("users.select")}
        searchPlaceholder={t("users.search")}
        emptyMessage={t("users.empty")}
        loadingMessage={t("users.loading")}
        loadMoreLabel={t("users.loadMore")}
        clearLabel={t("users.clear")}
        toggleLabel={t("users.toggle")}
        onSearchQueryChange={(nextQuery, context) =>
          void search(nextQuery, context)
        }
        onLoadMore={() => void loadMore()}
        onValueChange={(nextValue) => {
          const nextUser = visibleItems.find((user) => user.id === nextValue);
          setSelectedUser(nextUser);
          onChange(nextValue, nextUser);
        }}
      />
    </div>
  );
}

function toExpenseUserOption(
  user: v1.finance.ExpenseUserOption,
): ExpenseUserOption {
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ");
  return { id: user.id, label: name || user.email, email: user.email };
}

function TextField({
  date = false,
  disabled,
  id,
  label,
  onChange,
  required,
  value,
}: {
  date?: boolean;
  disabled?: boolean;
  id: string;
  label: string;
  onChange(value: string): void;
  required?: boolean;
  value: string;
}) {
  const locale = useLocale();

  if (date) {
    return (
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-day`}>{label}</Label>
        <DatePartsField
          baseId={id}
          disabled={disabled}
          label={label}
          locale={locale}
          required={required}
          value={value}
          onChange={onChange}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        required={required}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function SelectField({
  disabled,
  id,
  items,
  label,
  onChange,
  placeholder,
  value,
}: {
  disabled?: boolean;
  id: string;
  items: Array<{ label: string; value: string }>;
  label: string;
  onChange(value: string): void;
  placeholder: string;
  value: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Select
        value={value || null}
        disabled={disabled}
        onValueChange={(next) => next && onChange(next)}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}
