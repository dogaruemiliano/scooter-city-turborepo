"use client";

import { ApiError, v1 } from "@repo/api-shared";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  buttonVariants,
  CountrySelect,
  Input,
  Label,
  PhoneNumberInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  type CountryCode,
  type PhoneNumberInputChangeDetails,
} from "@repo/ui/components";
import { UserPlusIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState, type FormEvent, type ReactNode } from "react";

import { webApi } from "../../../lib/api";

interface PersonCreateFormProps {
  personsHref: string;
}

interface Feedback {
  kind: "error" | "success";
  title: string;
  messages: string[];
}

type PersonCitizenship = "romanian" | "foreign";

type PersonFormFieldKey =
  | "email"
  | "phone"
  | "firstName"
  | "lastName"
  | "dateOfBirth"
  | "addressLine1"
  | "addressLine2"
  | "city"
  | "region"
  | "postalCode"
  | "countryCode"
  | "documents"
  | "notes";

type PersonDocumentFormFieldKey =
  | "type"
  | "series"
  | "number"
  | "cnp"
  | "issuingCountryCode"
  | "issuedBy"
  | "issuedOn"
  | "expiresOn"
  | "status"
  | "notes";

type FormErrorKey =
  | PersonFormFieldKey
  | `document.${string}.${PersonDocumentFormFieldKey}`;

type FormErrors = Partial<Record<FormErrorKey, string>>;

interface CreatePersonFormState {
  citizenship: PersonCitizenship;
  email: string;
  phone: string;
  phoneCountry: CountryCode;
  phoneCountryCallingCode: string;
  phoneNationalNumber: string;
  firstName: string;
  lastName: string;
  dateOfBirth: DateParts;
  addressLine1: string;
  addressLine2: string;
  city: string;
  region: string;
  postalCode: string;
  countryCode: CountryCode;
  documents: CreatePersonDocumentFormState[];
  notes: string;
}

interface CreatePersonDocumentFormState {
  key: string;
  required: boolean;
  slot: "identity" | "driverLicense";
  type: v1.persons.PersonDocumentType;
  series: string;
  number: string;
  cnp: string;
  issuingCountryCode: CountryCode;
  issuedBy: string;
  issuedOn: DateParts;
  expiresOn: DateParts;
  status: v1.persons.PersonDocumentStatus;
  notes: string;
}

interface DateParts {
  day: string;
  month: string;
  year: string;
}

interface DateBuildResult {
  value?: string;
  error?: "incomplete" | "invalid";
}

interface FieldValidationError {
  field: FormErrorKey;
  message: string;
}

interface FormValidationIssue {
  code: string;
  path: readonly PropertyKey[];
  message: string;
  minimum?: number | bigint;
  maximum?: number | bigint;
  format?: string;
}

const ROMANIAN_COUNTIES = [
  "Alba",
  "Arad",
  "Argeș",
  "Bacău",
  "Bihor",
  "Bistrița-Năsăud",
  "Botoșani",
  "Brașov",
  "Brăila",
  "București",
  "Buzău",
  "Caraș-Severin",
  "Călărași",
  "Cluj",
  "Constanța",
  "Covasna",
  "Dâmbovița",
  "Dolj",
  "Galați",
  "Giurgiu",
  "Gorj",
  "Harghita",
  "Hunedoara",
  "Ialomița",
  "Iași",
  "Ilfov",
  "Maramureș",
  "Mehedinți",
  "Mureș",
  "Neamț",
  "Olt",
  "Prahova",
  "Satu Mare",
  "Sălaj",
  "Sibiu",
  "Suceava",
  "Teleorman",
  "Timiș",
  "Tulcea",
  "Vaslui",
  "Vâlcea",
  "Vrancea",
] as const;

const FOREIGN_IDENTITY_DOCUMENT_TYPES = [
  "passport",
  "residencePermit",
  "other",
] as const satisfies readonly v1.persons.PersonDocumentType[];

export function PersonCreateForm({ personsHref }: PersonCreateFormProps) {
  const t = useTranslations("persons");
  const locale = useLocale();
  const router = useRouter();
  const formId = useId();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<CreatePersonFormState>(() =>
    createEmptyCreateForm("romanian"),
  );
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({});
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  async function createPerson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    setFieldErrors({});

    const inputCandidate = createPersonInput(form, (field, error) => {
      const fieldLabel =
        field === "dateOfBirth"
          ? t("fields.dateOfBirth")
          : field === "documentIssuedOn"
            ? t("fields.documentIssuedOn")
            : t("fields.documentExpiresOn");

      return error === "incomplete"
        ? t("feedback.date.incomplete", { field: fieldLabel })
        : t("feedback.date.invalid", { field: fieldLabel });
    });
    if (inputCandidate.error) {
      setFieldErrors({
        [inputCandidate.error.field]: inputCandidate.error.message,
      });
      setFeedback({
        kind: "error",
        title: t("feedback.createErrorTitle"),
        messages: [inputCandidate.error.message],
      });
      return;
    }

    const input = v1.persons.createPersonInputSchema.safeParse(
      inputCandidate.input,
    );
    if (!input.success) {
      const nextFieldErrors = formErrorsFromIssues(
        input.error.issues,
        form,
        formatValidationIssue,
      );
      setFieldErrors(nextFieldErrors);
      setFeedback({
        kind: "error",
        title: t("feedback.createErrorTitle"),
        messages:
          input.error.issues.length > 0
            ? input.error.issues.map((issue) =>
                formatValidationIssue(
                  issue,
                  formErrorKeyFromPath(issue.path, form),
                ),
              )
            : [t("feedback.createValidationFallback")],
      });
      return;
    }

    setCreating(true);
    try {
      await webApi.fetch(v1.persons.ROUTES.create, v1.persons.personSchema, {
        method: "POST",
        json: input.data,
      });
      setFeedback({
        kind: "success",
        title: t("feedback.createSuccessTitle"),
        messages: [t("feedback.createSuccessMessage")],
      });
      setForm(createEmptyCreateForm("romanian"));
      router.push(personsHref);
      router.refresh();
    } catch (error) {
      setFeedback({
        kind: "error",
        title: t("feedback.createErrorTitle"),
        messages: [
          error instanceof ApiError
            ? error.message
            : t("feedback.genericError"),
        ],
      });
    } finally {
      setCreating(false);
    }
  }

  function formatValidationIssue(
    issue: FormValidationIssue,
    field: FormErrorKey | null,
  ): string {
    if (field === "documents") {
      return issue.message === "Document types must be unique."
        ? t("feedback.validation.duplicateDocumentTypes")
        : t("feedback.validation.documentSlotLimit");
    }

    if (field === "email") {
      return isBlankField(field, form)
        ? t("feedback.validation.required", { field: fieldLabel(field) })
        : t("feedback.validation.invalidEmail");
    }

    if (field === "phone") {
      return isBlankField(field, form)
        ? t("feedback.validation.required", { field: fieldLabel(field) })
        : t("feedback.validation.invalidPhone");
    }

    if (isDocumentFieldErrorKey(field, "cnp")) {
      return t("feedback.validation.invalidCnp");
    }

    const label = fieldLabel(field);

    if (issue.code === "too_small" && issue.minimum === 1) {
      return t("feedback.validation.required", { field: label });
    }

    if (
      issue.code === "too_big" &&
      (typeof issue.maximum === "number" || typeof issue.maximum === "bigint")
    ) {
      return t("feedback.validation.maxLength", {
        field: label,
        max: Number(issue.maximum),
      });
    }

    return issue.code === "invalid_format" || issue.code === "custom"
      ? t("feedback.validation.invalid", { field: label })
      : t("feedback.validation.fallback");
  }

  function fieldLabel(field: FormErrorKey | null): string {
    if (!field) return t("createPage.formTitle");

    const documentField = documentFieldFromErrorKey(field);
    if (documentField) {
      switch (documentField.field) {
        case "type":
          return t("fields.documentType");
        case "series":
          return t("fields.documentSeries");
        case "number": {
          const document = form.documents.find(
            (item) => item.key === documentField.documentKey,
          );
          return document?.type === "nationalId"
            ? t("fields.nationalIdNumber")
            : t("fields.documentNumber");
        }
        case "cnp":
          return t("fields.documentCnp");
        case "issuingCountryCode":
          return t("fields.documentIssuingCountryCode");
        case "issuedBy":
          return t("fields.documentIssuedBy");
        case "issuedOn":
          return t("fields.documentIssuedOn");
        case "expiresOn":
          return t("fields.documentExpiresOn");
        case "status":
          return t("fields.documentStatus");
        case "notes":
          return t("fields.notes");
      }
    }

    switch (field) {
      case "email":
        return t("fields.email");
      case "phone":
        return t("fields.phone");
      case "firstName":
        return t("fields.firstName");
      case "lastName":
        return t("fields.lastName");
      case "dateOfBirth":
        return t("fields.dateOfBirth");
      case "addressLine1":
        return t("fields.addressLine1");
      case "addressLine2":
        return t("fields.addressLine2");
      case "city":
        return t("fields.city");
      case "region":
        return form.countryCode === "RO"
          ? t("fields.county")
          : t("fields.region");
      case "postalCode":
        return t("fields.postalCode");
      case "countryCode":
        return t("fields.country");
      case "documents":
        return t("sections.document");
      case "notes":
        return t("fields.notes");
    }

    return t("createPage.formTitle");
  }

  const firstNameError = fieldErrors.firstName;
  const lastNameError = fieldErrors.lastName;
  const emailError = fieldErrors.email;
  const dateOfBirthError = fieldErrors.dateOfBirth;
  const countryCodeError = fieldErrors.countryCode;
  const addressLine1Error = fieldErrors.addressLine1;
  const addressLine2Error = fieldErrors.addressLine2;
  const cityError = fieldErrors.city;
  const postalCodeError = fieldErrors.postalCode;
  const showUnder18Warning = isUnder18Person(form);

  return (
    <div className="mx-auto flex w-full max-w-screen-lg flex-1 flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10">
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t("createPage.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("createPage.description")}
          </p>
        </div>
      </div>

      <form
        className="grid gap-6"
        noValidate
        onSubmit={(event) => void createPerson(event)}
      >
        <div
          role="group"
          aria-label={t("citizenship.label")}
          className="relative grid grid-cols-2 rounded-lg border border-border bg-muted p-1"
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-1 right-1 left-1 grid grid-cols-2"
          >
            <span
              className={[
                "rounded-md bg-background shadow-sm transition-transform duration-fast ease-standard",
                form.citizenship === "foreign"
                  ? "translate-x-full"
                  : "translate-x-0",
              ].join(" ")}
            />
          </span>
          <Button
            type="button"
            variant="ghost"
            className={[
              "relative z-raised w-full bg-transparent hover:bg-transparent",
              form.citizenship === "romanian"
                ? "text-foreground"
                : "text-muted-foreground",
            ].join(" ")}
            aria-pressed={form.citizenship === "romanian"}
            onClick={() => changeCitizenship("romanian")}
          >
            {t("citizenship.romanian")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className={[
              "relative z-raised w-full bg-transparent hover:bg-transparent",
              form.citizenship === "foreign"
                ? "text-foreground"
                : "text-muted-foreground",
            ].join(" ")}
            aria-pressed={form.citizenship === "foreign"}
            onClick={() => changeCitizenship("foreign")}
          >
            {t("citizenship.foreign")}
          </Button>
        </div>

        <FormSection title={t("sections.contact")}>
          <FormField
            id={`${formId}-first-name`}
            label={t("fields.firstName")}
            required
            error={firstNameError}
          >
            <Input
              id={`${formId}-first-name`}
              aria-describedby={fieldErrorId(
                `${formId}-first-name`,
                firstNameError,
              )}
              aria-invalid={invalidAria(firstNameError)}
              name="firstName"
              autoComplete="given-name"
              maxLength={100}
              required
              value={form.firstName}
              onChange={(event) =>
                setFormValue("firstName", event.target.value)
              }
            />
          </FormField>
          <FormField
            id={`${formId}-last-name`}
            label={t("fields.lastName")}
            required
            error={lastNameError}
          >
            <Input
              id={`${formId}-last-name`}
              aria-describedby={fieldErrorId(
                `${formId}-last-name`,
                lastNameError,
              )}
              aria-invalid={invalidAria(lastNameError)}
              name="lastName"
              autoComplete="family-name"
              maxLength={100}
              required
              value={form.lastName}
              onChange={(event) => setFormValue("lastName", event.target.value)}
            />
          </FormField>
          <FormField
            id={`${formId}-email`}
            label={t("fields.email")}
            required
            error={emailError}
          >
            <Input
              id={`${formId}-email`}
              aria-describedby={fieldErrorId(`${formId}-email`, emailError)}
              aria-invalid={invalidAria(emailError)}
              name="email"
              type="email"
              autoComplete="email"
              required
              value={form.email}
              onChange={(event) => setFormValue("email", event.target.value)}
            />
          </FormField>
          <FormField id={`${formId}-phone`} label={t("fields.phone")} required>
            <PhoneNumberInput
              id={`${formId}-phone`}
              name="phone"
              defaultCountry={form.phoneCountry}
              locale={locale}
              placeholder={t("placeholders.phone")}
              required
              invalid={Boolean(fieldErrors.phone)}
              errorMessage={fieldErrors.phone}
              countrySelectLabel={t("fields.phoneCountry")}
              numberInputLabel={t("fields.phone")}
              onValueChange={changePhone}
            />
          </FormField>
          {form.citizenship === "foreign" ? (
            <>
              <FormField
                id={`${formId}-date-of-birth-day`}
                label={t("fields.dateOfBirth")}
                error={dateOfBirthError}
              >
                <DatePartsInput
                  baseId={`${formId}-date-of-birth`}
                  aria-describedby={fieldErrorId(
                    `${formId}-date-of-birth-day`,
                    dateOfBirthError,
                  )}
                  invalid={Boolean(dateOfBirthError)}
                  label={t("fields.dateOfBirth")}
                  locale={locale}
                  value={form.dateOfBirth}
                  onChange={(value) => setFormValue("dateOfBirth", value)}
                />
              </FormField>
              {showUnder18Warning ? (
                <Under18Warning message={t("feedback.under18Warning")} />
              ) : null}
            </>
          ) : null}
        </FormSection>

        <FormSection title={t("sections.address")}>
          <FormField
            id={`${formId}-country`}
            label={t("fields.country")}
            required
            error={countryCodeError}
          >
            <CountrySelect
              id={`${formId}-country`}
              aria-describedby={fieldErrorId(
                `${formId}-country`,
                countryCodeError,
              )}
              aria-invalid={invalidAria(countryCodeError)}
              name="countryCode"
              autoComplete="country"
              locale={locale}
              required
              value={form.countryCode}
              onValueChange={changeCountry}
            />
          </FormField>
          {form.countryCode === "RO" ? (
            <FormField
              id={`${formId}-county`}
              label={t("fields.county")}
              error={fieldErrors.region}
            >
              <select
                id={`${formId}-county`}
                aria-describedby={fieldErrorId(
                  `${formId}-county`,
                  fieldErrors.region,
                )}
                aria-invalid={invalidAria(fieldErrors.region)}
                name="region"
                className="h-8 w-full rounded-lg border border-input bg-background px-2.5 py-1 text-base transition-colors duration-fast ease-standard outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-disabled disabled:text-disabled-foreground aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive md:text-sm"
                value={form.region}
                onChange={(event) => {
                  setFormValue("region", event.target.value);
                }}
              >
                <option value="">{t("placeholders.county")}</option>
                {ROMANIAN_COUNTIES.map((county) => (
                  <option key={county} value={county}>
                    {county}
                  </option>
                ))}
              </select>
            </FormField>
          ) : (
            <FormField
              id={`${formId}-region`}
              label={t("fields.region")}
              error={fieldErrors.region}
            >
              <Input
                id={`${formId}-region`}
                aria-describedby={fieldErrorId(
                  `${formId}-region`,
                  fieldErrors.region,
                )}
                aria-invalid={invalidAria(fieldErrors.region)}
                name="region"
                autoComplete="address-level1"
                value={form.region}
                onChange={(event) => setFormValue("region", event.target.value)}
              />
            </FormField>
          )}
          <FormField
            id={`${formId}-address-line-1`}
            label={t("fields.addressLine1")}
            error={addressLine1Error}
          >
            <Input
              id={`${formId}-address-line-1`}
              aria-describedby={fieldErrorId(
                `${formId}-address-line-1`,
                addressLine1Error,
              )}
              aria-invalid={invalidAria(addressLine1Error)}
              name="addressLine1"
              autoComplete="address-line1"
              value={form.addressLine1}
              onChange={(event) =>
                setFormValue("addressLine1", event.target.value)
              }
            />
          </FormField>
          <FormField
            id={`${formId}-address-line-2`}
            label={t("fields.addressLine2")}
            error={addressLine2Error}
          >
            <Input
              id={`${formId}-address-line-2`}
              aria-describedby={fieldErrorId(
                `${formId}-address-line-2`,
                addressLine2Error,
              )}
              aria-invalid={invalidAria(addressLine2Error)}
              name="addressLine2"
              autoComplete="address-line2"
              value={form.addressLine2}
              onChange={(event) =>
                setFormValue("addressLine2", event.target.value)
              }
            />
          </FormField>
          <FormField
            id={`${formId}-city`}
            label={t("fields.city")}
            error={cityError}
          >
            <Input
              id={`${formId}-city`}
              aria-describedby={fieldErrorId(`${formId}-city`, cityError)}
              aria-invalid={invalidAria(cityError)}
              name="city"
              autoComplete="address-level2"
              value={form.city}
              onChange={(event) => setFormValue("city", event.target.value)}
            />
          </FormField>
          <FormField
            id={`${formId}-postal-code`}
            label={t("fields.postalCode")}
            error={postalCodeError}
          >
            <Input
              id={`${formId}-postal-code`}
              aria-describedby={fieldErrorId(
                `${formId}-postal-code`,
                postalCodeError,
              )}
              aria-invalid={invalidAria(postalCodeError)}
              name="postalCode"
              autoComplete="postal-code"
              value={form.postalCode}
              onChange={(event) =>
                setFormValue("postalCode", event.target.value)
              }
            />
          </FormField>
        </FormSection>

        <FormSection title={t("sections.document")}>
          {form.documents.map((document) => {
            const documentId = `${formId}-document-${document.key}`;
            const isNationalId = document.type === "nationalId";
            const canChangeIdentityType =
              form.citizenship === "foreign" && document.slot === "identity";
            const typeError =
              fieldErrors[documentFieldErrorKey(document.key, "type")];
            const seriesError =
              fieldErrors[documentFieldErrorKey(document.key, "series")];
            const numberError =
              fieldErrors[documentFieldErrorKey(document.key, "number")];
            const cnpError =
              fieldErrors[documentFieldErrorKey(document.key, "cnp")];
            const issuingCountryCodeError =
              fieldErrors[
                documentFieldErrorKey(document.key, "issuingCountryCode")
              ];
            const issuedByError =
              fieldErrors[documentFieldErrorKey(document.key, "issuedBy")];
            const issuedOnError =
              fieldErrors[documentFieldErrorKey(document.key, "issuedOn")];
            const expiresOnError =
              fieldErrors[documentFieldErrorKey(document.key, "expiresOn")];
            const statusError =
              fieldErrors[documentFieldErrorKey(document.key, "status")];
            const notesError =
              fieldErrors[documentFieldErrorKey(document.key, "notes")];

            return (
              <div
                key={document.key}
                className="grid min-w-0 gap-4 rounded-lg border border-border bg-background p-4 shadow-sm sm:col-span-2 sm:grid-cols-2"
              >
                <div className="flex items-center justify-between gap-3 sm:col-span-2">
                  <h3 className="text-sm font-bold">
                    {document.slot === "driverLicense"
                      ? t("documentTypes.driverLicense")
                      : t(`documentTypes.${document.type}`)}
                  </h3>
                  <span className="text-xs font-medium text-muted-foreground">
                    {document.required
                      ? t("documentForm.required")
                      : t("documentForm.optional")}
                  </span>
                </div>

                {canChangeIdentityType ? (
                  <FormField
                    id={`${documentId}-type`}
                    label={t("fields.documentType")}
                    required={document.required}
                    error={typeError}
                  >
                    <Select
                      value={document.type}
                      onValueChange={(value) => {
                        if (value) {
                          setDocumentValue(
                            document.key,
                            "type",
                            value as v1.persons.PersonDocumentType,
                          );
                        }
                      }}
                    >
                      <SelectTrigger
                        id={`${documentId}-type`}
                        aria-describedby={fieldErrorId(
                          `${documentId}-type`,
                          typeError,
                        )}
                        aria-invalid={invalidAria(typeError)}
                        className="w-full"
                      >
                        <SelectValue
                          placeholder={t("placeholders.documentType")}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {FOREIGN_IDENTITY_DOCUMENT_TYPES.map((type) => (
                          <SelectItem key={type} value={type}>
                            {t(`documentTypes.${type}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormField>
                ) : null}

                {isNationalId ? (
                  <div className="grid min-w-0 grid-cols-3 gap-3 sm:col-span-2">
                    <FormField
                      id={`${documentId}-series`}
                      label={t("fields.documentSeries")}
                      className="col-span-1"
                      error={seriesError}
                    >
                      <Input
                        id={`${documentId}-series`}
                        aria-describedby={fieldErrorId(
                          `${documentId}-series`,
                          seriesError,
                        )}
                        aria-invalid={invalidAria(seriesError)}
                        name="documentSeries"
                        maxLength={10}
                        value={document.series}
                        onChange={(event) =>
                          setDocumentValue(
                            document.key,
                            "series",
                            event.target.value.toUpperCase(),
                          )
                        }
                      />
                    </FormField>
                    <FormField
                      id={`${documentId}-number`}
                      label={t("fields.nationalIdNumber")}
                      className="col-span-2"
                      error={numberError}
                    >
                      <Input
                        id={`${documentId}-number`}
                        aria-describedby={fieldErrorId(
                          `${documentId}-number`,
                          numberError,
                        )}
                        aria-invalid={invalidAria(numberError)}
                        name="documentNumber"
                        value={document.number}
                        onChange={(event) =>
                          setDocumentValue(
                            document.key,
                            "number",
                            event.target.value,
                          )
                        }
                      />
                    </FormField>
                  </div>
                ) : (
                  <FormField
                    id={`${documentId}-number`}
                    label={t("fields.documentNumber")}
                    error={numberError}
                  >
                    <Input
                      id={`${documentId}-number`}
                      aria-describedby={fieldErrorId(
                        `${documentId}-number`,
                        numberError,
                      )}
                      aria-invalid={invalidAria(numberError)}
                      name="documentNumber"
                      value={document.number}
                      onChange={(event) =>
                        setDocumentValue(
                          document.key,
                          "number",
                          event.target.value,
                        )
                      }
                    />
                  </FormField>
                )}

                {isNationalId ? (
                  <>
                    <FormField
                      id={`${documentId}-cnp`}
                      label={t("fields.documentCnp")}
                      required={document.required}
                      error={cnpError}
                    >
                      <Input
                        id={`${documentId}-cnp`}
                        aria-describedby={fieldErrorId(
                          `${documentId}-cnp`,
                          cnpError,
                        )}
                        aria-invalid={invalidAria(cnpError)}
                        name="documentCnp"
                        inputMode="numeric"
                        maxLength={13}
                        value={document.cnp}
                        onChange={(event) =>
                          setDocumentValue(
                            document.key,
                            "cnp",
                            dateDigits(event.target.value, 13),
                          )
                        }
                      />
                    </FormField>
                    {showUnder18Warning ? (
                      <Under18Warning message={t("feedback.under18Warning")} />
                    ) : null}
                    <FormField
                      id={`${documentId}-issued-by`}
                      label={t("fields.documentIssuedBy")}
                      error={issuedByError}
                    >
                      <Input
                        id={`${documentId}-issued-by`}
                        aria-describedby={fieldErrorId(
                          `${documentId}-issued-by`,
                          issuedByError,
                        )}
                        aria-invalid={invalidAria(issuedByError)}
                        name="documentIssuedBy"
                        value={document.issuedBy}
                        onChange={(event) =>
                          setDocumentValue(
                            document.key,
                            "issuedBy",
                            event.target.value,
                          )
                        }
                      />
                    </FormField>
                    <FormField
                      id={`${documentId}-issued-on-day`}
                      label={t("fields.documentIssuedOn")}
                      error={issuedOnError}
                    >
                      <DatePartsInput
                        baseId={`${documentId}-issued-on`}
                        aria-describedby={fieldErrorId(
                          `${documentId}-issued-on-day`,
                          issuedOnError,
                        )}
                        invalid={Boolean(issuedOnError)}
                        label={t("fields.documentIssuedOn")}
                        locale={locale}
                        value={document.issuedOn}
                        onChange={(value) =>
                          setDocumentValue(document.key, "issuedOn", value)
                        }
                      />
                    </FormField>
                  </>
                ) : (
                  <FormField
                    id={`${documentId}-country`}
                    label={t("fields.documentIssuingCountryCode")}
                    error={issuingCountryCodeError}
                  >
                    <CountrySelect
                      id={`${documentId}-country`}
                      aria-describedby={fieldErrorId(
                        `${documentId}-country`,
                        issuingCountryCodeError,
                      )}
                      aria-invalid={invalidAria(issuingCountryCodeError)}
                      name="documentIssuingCountryCode"
                      locale={locale}
                      value={document.issuingCountryCode}
                      onValueChange={(value) =>
                        setDocumentValue(
                          document.key,
                          "issuingCountryCode",
                          value,
                        )
                      }
                    />
                  </FormField>
                )}

                <FormField
                  id={`${documentId}-expires-on-day`}
                  label={t("fields.documentExpiresOn")}
                  error={expiresOnError}
                >
                  <DatePartsInput
                    baseId={`${documentId}-expires-on`}
                    aria-describedby={fieldErrorId(
                      `${documentId}-expires-on-day`,
                      expiresOnError,
                    )}
                    invalid={Boolean(expiresOnError)}
                    label={t("fields.documentExpiresOn")}
                    locale={locale}
                    value={document.expiresOn}
                    onChange={(value) =>
                      setDocumentValue(document.key, "expiresOn", value)
                    }
                  />
                </FormField>
                <FormField
                  id={`${documentId}-status`}
                  label={t("fields.documentStatus")}
                  error={statusError}
                >
                  <Select
                    value={document.status}
                    onValueChange={(value) => {
                      if (value) {
                        setDocumentValue(
                          document.key,
                          "status",
                          value as v1.persons.PersonDocumentStatus,
                        );
                      }
                    }}
                  >
                    <SelectTrigger
                      id={`${documentId}-status`}
                      aria-describedby={fieldErrorId(
                        `${documentId}-status`,
                        statusError,
                      )}
                      aria-invalid={invalidAria(statusError)}
                      className="w-full"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {v1.persons.PERSON_DOCUMENT_STATUSES.map((status) => (
                        <SelectItem key={status} value={status}>
                          {t(`documentStatuses.${status}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField
                  id={`${documentId}-notes`}
                  label={t("fields.notes")}
                  error={notesError}
                >
                  <Textarea
                    id={`${documentId}-notes`}
                    aria-describedby={fieldErrorId(
                      `${documentId}-notes`,
                      notesError,
                    )}
                    aria-invalid={invalidAria(notesError)}
                    name="documentNotes"
                    maxLength={2000}
                    value={document.notes}
                    onChange={(event) =>
                      setDocumentValue(
                        document.key,
                        "notes",
                        event.target.value,
                      )
                    }
                  />
                </FormField>
              </div>
            );
          })}
          {fieldErrors.documents ? (
            <p
              id={`${formId}-documents-error`}
              role="alert"
              className="text-sm text-destructive sm:col-span-2"
            >
              {fieldErrors.documents}
            </p>
          ) : null}
        </FormSection>

        <FormField
          id={`${formId}-notes`}
          label={t("fields.notes")}
          error={fieldErrors.notes}
        >
          <Textarea
            id={`${formId}-notes`}
            aria-describedby={fieldErrorId(
              `${formId}-notes`,
              fieldErrors.notes,
            )}
            aria-invalid={invalidAria(fieldErrors.notes)}
            name="notes"
            maxLength={2000}
            value={form.notes}
            onChange={(event) => setFormValue("notes", event.target.value)}
          />
        </FormField>

        {feedback ? (
          <Alert
            variant={feedback.kind === "error" ? "destructive" : "default"}
          >
            <AlertTitle>{feedback.title}</AlertTitle>
            <AlertDescription>
              {feedback.messages.length === 1 ? (
                feedback.messages[0]
              ) : (
                <ul className="list-disc space-y-1 pl-5">
                  {feedback.messages.map((message, index) => (
                    <li key={`${message}-${index}`}>{message}</li>
                  ))}
                </ul>
              )}
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
          {creating ? (
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              disabled
            >
              {t("actions.cancel")}
            </Button>
          ) : (
            <Link
              href={personsHref}
              className={buttonVariants({
                variant: "outline",
                className: "w-full sm:w-auto",
              })}
            >
              {t("actions.cancel")}
            </Link>
          )}
          <Button
            type="submit"
            className="w-full sm:w-auto"
            disabled={creating}
          >
            <UserPlusIcon data-icon="inline-start" />
            {creating ? t("actions.creating") : t("actions.create")}
          </Button>
        </div>
      </form>
    </div>
  );

  function setFormValue<Key extends keyof CreatePersonFormState>(
    key: Key,
    value: CreatePersonFormState[Key],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
    clearFieldErrorForPersonKey(key);
  }

  function changePhone(value: string, details: PhoneNumberInputChangeDetails) {
    setForm((current) => ({
      ...current,
      phone: value,
      phoneCountry: details.country,
      phoneCountryCallingCode: details.countryCallingCode,
      phoneNationalNumber: details.nationalNumber,
    }));
    clearFieldError("phone");
  }

  function changeCountry(value: CountryCode) {
    setForm((current) => ({
      ...current,
      countryCode: value,
      region: "",
    }));
    clearFieldError("countryCode");
    clearFieldError("region");
  }

  function changeCitizenship(citizenship: PersonCitizenship) {
    setForm((current) =>
      current.citizenship === citizenship
        ? current
        : {
            ...current,
            citizenship,
            dateOfBirth:
              citizenship === "romanian"
                ? emptyDateParts()
                : current.dateOfBirth,
            documents: createInitialDocuments(citizenship),
          },
    );
    setFieldErrors({});
    setFeedback(null);
  }

  function setDocumentValue<Key extends PersonDocumentFormFieldKey>(
    documentKey: string,
    key: Key,
    value: CreatePersonDocumentFormState[Key],
  ) {
    setForm((current) => ({
      ...current,
      documents: current.documents.map((document) =>
        document.key === documentKey ? { ...document, [key]: value } : document,
      ),
    }));
    clearFieldError(documentFieldErrorKey(documentKey, key));
  }

  function clearFieldError(field: FormErrorKey) {
    setFieldErrors((current) => {
      if (!current[field]) {
        return current;
      }

      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function clearFieldErrorForPersonKey(key: keyof CreatePersonFormState) {
    if (isPersonFormFieldKey(key)) {
      clearFieldError(key);
    }
  }
}

function Under18Warning({ message }: { message: string }) {
  return (
    <div
      role="status"
      className="rounded-lg border border-warning bg-warning-subtle px-3 py-2 text-sm font-medium text-warning sm:col-span-2"
    >
      {message}
    </div>
  );
}

function isUnder18Person(form: CreatePersonFormState): boolean {
  const dateOfBirth =
    form.citizenship === "romanian"
      ? v1.persons.getDateOfBirthFromCnp(
          form.documents.find((document) => document.type === "nationalId")
            ?.cnp,
        )
      : buildDateOnly(form.dateOfBirth).value;

  return v1.persons.isUnder18FromDateOfBirth(dateOfBirth);
}

function createEmptyCreateForm(
  citizenship: PersonCitizenship,
): CreatePersonFormState {
  return {
    citizenship,
    email: "",
    phone: "",
    phoneCountry: "RO",
    phoneCountryCallingCode: "40",
    phoneNationalNumber: "",
    firstName: "",
    lastName: "",
    dateOfBirth: emptyDateParts(),
    addressLine1: "",
    addressLine2: "",
    city: "",
    region: "",
    postalCode: "",
    countryCode: "RO",
    documents: createInitialDocuments(citizenship),
    notes: "",
  };
}

function createInitialDocuments(
  citizenship: PersonCitizenship,
): CreatePersonDocumentFormState[] {
  return citizenship === "romanian"
    ? [
        createDocumentDraft("nationalId", {
          key: "romanian-national-id",
          required: true,
          slot: "identity",
        }),
        createDocumentDraft("driverLicense", {
          key: "romanian-driver-license",
          required: false,
          slot: "driverLicense",
        }),
      ]
    : [
        createDocumentDraft("passport", {
          key: "foreign-identity",
          required: true,
          slot: "identity",
        }),
        createDocumentDraft("driverLicense", {
          key: "foreign-driver-license",
          required: false,
          slot: "driverLicense",
        }),
      ];
}

function createDocumentDraft(
  type: v1.persons.PersonDocumentType,
  options: {
    key: string;
    required: boolean;
    slot: CreatePersonDocumentFormState["slot"];
  },
): CreatePersonDocumentFormState {
  return {
    key: options.key,
    required: options.required,
    slot: options.slot,
    type,
    series: "",
    number: "",
    cnp: "",
    issuingCountryCode: "RO",
    issuedBy: "",
    issuedOn: emptyDateParts(),
    expiresOn: emptyDateParts(),
    status: "unverified",
    notes: "",
  };
}

function isBlankOptionalDocument(document: CreatePersonDocumentFormState) {
  return (
    document.series.trim().length === 0 &&
    document.number.trim().length === 0 &&
    document.cnp.trim().length === 0 &&
    document.issuedBy.trim().length === 0 &&
    document.notes.trim().length === 0 &&
    !hasDateParts(document.issuedOn) &&
    !hasDateParts(document.expiresOn)
  );
}

function hasDateParts(parts: DateParts): boolean {
  return (
    parts.day.length > 0 || parts.month.length > 0 || parts.year.length > 0
  );
}

function DatePartsInput({
  baseId,
  "aria-describedby": ariaDescribedBy,
  invalid = false,
  label,
  locale,
  value,
  onChange,
}: {
  baseId: string;
  "aria-describedby"?: string;
  invalid?: boolean;
  label: string;
  locale: string;
  value: DateParts;
  onChange: (value: DateParts) => void;
}) {
  const dayPlaceholder = locale === "ro" ? "ZZ" : "DD";
  const monthPlaceholder = locale === "ro" ? "LL" : "MM";
  const yearPlaceholder = locale === "ro" ? "AAAA" : "YYYY";

  return (
    <div className="flex w-full items-center gap-2">
      <Input
        id={`${baseId}-day`}
        aria-describedby={ariaDescribedBy}
        aria-invalid={invalidAria(invalid)}
        inputMode="numeric"
        maxLength={2}
        placeholder={dayPlaceholder}
        value={value.day}
        className="min-w-0 flex-1"
        onChange={(event) =>
          onChange({
            ...value,
            day: dateDigits(event.target.value, 2),
          })
        }
      />
      <span className="text-muted-foreground">/</span>
      <Input
        aria-label={`${label} ${monthPlaceholder}`}
        aria-describedby={ariaDescribedBy}
        aria-invalid={invalidAria(invalid)}
        inputMode="numeric"
        maxLength={2}
        placeholder={monthPlaceholder}
        value={value.month}
        className="min-w-0 flex-1"
        onChange={(event) =>
          onChange({
            ...value,
            month: dateDigits(event.target.value, 2),
          })
        }
      />
      <span className="text-muted-foreground">/</span>
      <Input
        aria-label={`${label} ${yearPlaceholder}`}
        aria-describedby={ariaDescribedBy}
        aria-invalid={invalidAria(invalid)}
        inputMode="numeric"
        maxLength={4}
        placeholder={yearPlaceholder}
        value={value.year}
        className="min-w-0 flex-1"
        onChange={(event) =>
          onChange({
            ...value,
            year: dateDigits(event.target.value, 4),
          })
        }
      />
    </div>
  );
}

function FormSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="grid min-w-0 gap-4 rounded-lg bg-muted p-4 md:grid-cols-3 md:gap-6">
      <h2 className="text-base font-semibold underline md:text-sm">{title}</h2>
      <div className="grid min-w-0 gap-4 sm:grid-cols-2 md:col-span-2">
        {children}
      </div>
    </section>
  );
}

function FormField({
  id,
  label,
  required = false,
  error,
  className,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={["flex min-w-0 flex-col gap-2", className]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="flex items-center gap-1">
        <Label htmlFor={id}>{label}</Label>
        {required ? (
          <span aria-hidden="true" className="text-destructive">
            *
          </span>
        ) : null}
      </div>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

type DateField = "dateOfBirth" | "documentIssuedOn" | "documentExpiresOn";

function createPersonInput(
  form: CreatePersonFormState,
  formatDateError: (
    field: DateField,
    error: "incomplete" | "invalid",
  ) => string,
): { input?: Record<string, unknown>; error?: FieldValidationError } {
  const input: Record<string, unknown> = {
    email: form.email,
    phone: normalizePhoneForSubmit(form),
    firstName: form.firstName,
    lastName: form.lastName,
  };

  if (form.citizenship === "foreign") {
    const dateOfBirth = buildDateOnly(form.dateOfBirth);
    if (dateOfBirth.error) {
      return {
        error: {
          field: "dateOfBirth",
          message: formatDateError("dateOfBirth", dateOfBirth.error),
        },
      };
    }

    addOptional(input, "dateOfBirth", dateOfBirth.value);
  } else {
    const nationalId = form.documents.find(
      (document) => document.type === "nationalId",
    );
    const dateOfBirth = v1.persons.getDateOfBirthFromCnp(nationalId?.cnp);

    addOptional(input, "dateOfBirth", dateOfBirth ?? undefined);
  }

  addOptional(input, "addressLine1", form.addressLine1);
  addOptional(input, "addressLine2", form.addressLine2);
  addOptional(input, "city", form.city);
  addOptional(input, "region", form.region);
  addOptional(input, "postalCode", form.postalCode);
  addOptional(input, "countryCode", form.countryCode);
  const documents: Record<string, unknown>[] = [];

  for (const document of form.documents) {
    if (!document.required && isBlankOptionalDocument(document)) {
      continue;
    }

    const documentInput = createDocumentInput(document);

    if (documentInput.error) {
      return {
        error: {
          field: documentFieldErrorKey(document.key, documentInput.error.field),
          message: formatDateError(
            documentInput.error.dateField,
            documentInput.error.kind,
          ),
        },
      };
    }

    documents.push(documentInput.input);
  }

  if (documents.length > 0) {
    input.documents = documents;
  }
  addOptional(input, "notes", form.notes);

  return { input };
}

function createDocumentInput(document: CreatePersonDocumentFormState): {
  input: Record<string, unknown>;
  error?: {
    field: Extract<PersonDocumentFormFieldKey, "issuedOn" | "expiresOn">;
    dateField: Extract<DateField, "documentIssuedOn" | "documentExpiresOn">;
    kind: "incomplete" | "invalid";
  };
} {
  const input: Record<string, unknown> = {
    type: document.type,
    status: document.status,
  };
  const issuedOn = buildDateOnly(document.issuedOn);
  const expiresOn = buildDateOnly(document.expiresOn);

  if (issuedOn.error) {
    return {
      input,
      error: {
        field: "issuedOn",
        dateField: "documentIssuedOn",
        kind: issuedOn.error,
      },
    };
  }

  if (expiresOn.error) {
    return {
      input,
      error: {
        field: "expiresOn",
        dateField: "documentExpiresOn",
        kind: expiresOn.error,
      },
    };
  }

  addOptional(input, "series", document.series);
  addOptional(input, "number", document.number);
  if (document.required && document.type === "nationalId") {
    input.cnp = document.cnp;
  } else {
    addOptional(input, "cnp", document.cnp);
  }
  addOptional(input, "issuingCountryCode", document.issuingCountryCode);
  addOptional(input, "issuedBy", document.issuedBy);
  addOptional(input, "issuedOn", issuedOn.value);
  addOptional(input, "expiresOn", expiresOn.value);
  addOptional(input, "notes", document.notes);

  return { input };
}

function addOptional(
  input: Record<string, unknown>,
  key: string,
  value: string | undefined,
) {
  if (value && value.trim().length > 0) {
    input[key] = value;
  }
}

function normalizePhoneForSubmit(form: CreatePersonFormState): string {
  const nationalNumber =
    form.phoneCountry === "RO" && form.phoneNationalNumber.startsWith("0")
      ? form.phoneNationalNumber.slice(1)
      : form.phoneNationalNumber;

  if (nationalNumber.length === 0) {
    return form.phone;
  }

  return `+${form.phoneCountryCallingCode}${nationalNumber}`;
}

function buildDateOnly(parts: DateParts): DateBuildResult {
  const hasDay = parts.day.length > 0;
  const hasMonth = parts.month.length > 0;
  const hasYear = parts.year.length > 0;

  if (!hasDay && !hasMonth && !hasYear) {
    return {};
  }

  if (!hasDay || !hasMonth || !hasYear) {
    return { error: "incomplete" };
  }

  if (parts.year.length !== 4) {
    return { error: "invalid" };
  }

  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return { error: "invalid" };
  }

  return {
    value: `${parts.year}-${parts.month.padStart(2, "0")}-${parts.day.padStart(
      2,
      "0",
    )}`,
  };
}

function dateDigits(value: string, maxLength: number): string {
  return value.replace(/\D/g, "").slice(0, maxLength);
}

function emptyDateParts(): DateParts {
  return {
    day: "",
    month: "",
    year: "",
  };
}

function formErrorsFromIssues(
  issues: FormValidationIssue[],
  form: CreatePersonFormState,
  formatIssue: (
    issue: FormValidationIssue,
    field: FormErrorKey | null,
  ) => string,
): FormErrors {
  const errors: FormErrors = {};

  for (const issue of issues) {
    const field = formErrorKeyFromPath(issue.path, form);

    if (field && !errors[field]) {
      errors[field] = formatIssue(issue, field);
    }
  }

  return errors;
}

function formErrorKeyFromPath(
  path: readonly PropertyKey[],
  form: CreatePersonFormState,
): FormErrorKey | null {
  const [field, index, documentField] = path;

  if (field === "documents") {
    if (typeof index === "number") {
      const document = form.documents[index];

      if (!document) {
        return "documents";
      }

      if (
        typeof documentField === "string" &&
        isPersonDocumentFormFieldKey(documentField)
      ) {
        return documentFieldErrorKey(document.key, documentField);
      }
    }

    return "documents";
  }

  return typeof field === "string" && isPersonFormFieldKey(field)
    ? field
    : null;
}

function documentFieldErrorKey(
  documentKey: string,
  field: PersonDocumentFormFieldKey,
): `document.${string}.${PersonDocumentFormFieldKey}` {
  return `document.${documentKey}.${field}`;
}

function isDocumentFieldErrorKey(
  field: FormErrorKey | null,
  expectedField: PersonDocumentFormFieldKey,
): boolean {
  return documentFieldFromErrorKey(field)?.field === expectedField;
}

function documentFieldFromErrorKey(
  field: FormErrorKey | null,
): { documentKey: string; field: PersonDocumentFormFieldKey } | null {
  if (!field || !field.startsWith("document.")) {
    return null;
  }

  const [, documentKey, documentField] = field.split(".");
  if (!documentKey || !documentField) {
    return null;
  }

  return isPersonDocumentFormFieldKey(documentField)
    ? { documentKey, field: documentField }
    : null;
}

function isBlankField(
  field: FormErrorKey,
  form: CreatePersonFormState,
): boolean {
  const documentField = documentFieldFromErrorKey(field);
  if (documentField) {
    const document = form.documents.find(
      (item) => item.key === documentField.documentKey,
    );
    const value = document?.[documentField.field];

    return typeof value === "string" && value.trim().length === 0;
  }

  if (!isPersonFormFieldKey(field)) {
    return false;
  }

  const value = form[field];
  return typeof value === "string" && value.trim().length === 0;
}

function fieldErrorId(
  id: string,
  error: string | undefined,
): string | undefined {
  return error ? `${id}-error` : undefined;
}

function invalidAria(invalid: string | boolean | undefined): true | undefined {
  return invalid ? true : undefined;
}

function isPersonFormFieldKey(value: string): value is PersonFormFieldKey {
  return PERSON_FORM_FIELD_KEYS.has(value as PersonFormFieldKey);
}

function isPersonDocumentFormFieldKey(
  value: string,
): value is PersonDocumentFormFieldKey {
  return PERSON_DOCUMENT_FORM_FIELD_KEYS.has(
    value as PersonDocumentFormFieldKey,
  );
}

const PERSON_FORM_FIELD_KEYS = new Set<PersonFormFieldKey>([
  "email",
  "phone",
  "firstName",
  "lastName",
  "dateOfBirth",
  "addressLine1",
  "addressLine2",
  "city",
  "region",
  "postalCode",
  "countryCode",
  "documents",
  "notes",
]);

const PERSON_DOCUMENT_FORM_FIELD_KEYS = new Set<PersonDocumentFormFieldKey>([
  "type",
  "series",
  "number",
  "cnp",
  "issuingCountryCode",
  "issuedBy",
  "issuedOn",
  "expiresOn",
  "status",
  "notes",
]);
