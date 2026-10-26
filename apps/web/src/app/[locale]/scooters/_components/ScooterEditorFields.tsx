"use client";

import { useOptionalSession } from "@/components/auth/SessionProvider";
import { canAccess } from "@/lib/access";

import {
  ScooterInsuranceDocuments,
  ScooterInsuranceFields,
} from "./ScooterInsuranceFields";

import { v1 } from "@repo/api-shared";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  FormSection,
  InputGroup,
  InputGroupAddon,
} from "@repo/ui/components";
import { EllipsisVerticalIcon, FileJsonIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { get, useFieldArray, useFormContext, useWatch } from "react-hook-form";

import {
  FormField,
  FormFieldWarningsContext,
} from "@/components/form/FormField";
import {
  FormDateField,
  FormDecimalInput,
  FormInput,
  FormSelect,
  FormSegmentedRadioGroup,
  FormTextarea,
} from "@/components/form/controls";
import type { LogicalDocumentUpdate } from "./ScooterDocumentTypeEditor";
import { ScooterBatchDocuments } from "./ScooterBatchDocuments";
import { ScooterDocumentImport } from "./ScooterDocumentImport";
import {
  ScooterDocumentUpload,
  ScooterFilePreview,
} from "./ScooterDocumentUpload";
import type { ScooterDocumentsEditor } from "./useScooterDocuments";
import { CivMetadataFields } from "./CivMetadataFields";
import { useCivFieldHint } from "./useCivFieldHint";
import { useCivVocabulary } from "./CivVocabularyContext";
import {
  Fragment,
  useContext,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { DocumentImportResult } from "./scooter-document-import";
import type { DocumentSource } from "./scooter-document-sources";
import { OPERATIONAL_FIELDS, type ScooterWizardStep } from "./scooter-wizard";
import { useScooterImportReview } from "./ScooterImportReview";
import { ScooterCivSelect } from "./ScooterCivSelect";
import { ScooterBrandField } from "./ScooterBrandField";
import {
  BOOLEAN_FIELDS,
  DECIMAL_FIELDS,
  INTEGER_FIELDS,
  REGISTRATION_FIELDS,
  SCOOTER_EDITOR_SECTIONS,
  type ScooterEditorField,
  type ScooterEditorValues,
} from "./scooter-editor-schema";

interface EditorFieldProps {
  brands: v1.scooterBrands.ScooterBrand[];
  onBrandCreated: (brand: v1.scooterBrands.ScooterBrand) => void;
  disabled: boolean;
  powertrain: string;
}

export function ScooterEditorFields({
  brands,
  combinedReview = false,
  onRetryAnalysis,
  onLogicalDocument,
  scooterVin,
  onCancelAnalysis,
  analyzing = false,
  persistedPolicyIds,
  documents,
  editing,
  disabled,
  onRawFields,
  rawFields,
  onBrandCreated,
  step,
  fallbackFields = [],
  importSources,
  onApplyImport,
  importResult,
  photos,
}: {
  combinedReview?: boolean;
  onRetryAnalysis?: (sourceId: string) => void;
  onLogicalDocument?: LogicalDocumentUpdate;
  scooterVin?: string;
  onCancelAnalysis?: () => void;
  analyzing?: boolean;
  persistedPolicyIds: string[];
  rawFields: Record<string, string>;
  onRawFields: (fields: Record<string, string>) => void;
  onBrandCreated: (brand: v1.scooterBrands.ScooterBrand) => void;
  documents: ScooterDocumentsEditor;
  brands: v1.scooterBrands.ScooterBrand[];
  editing: boolean;
  disabled: boolean;
  step?: ScooterWizardStep;
  fallbackFields?: readonly ScooterEditorField[];
  importSources?: DocumentSource[];
  onApplyImport?: (result: Extract<DocumentImportResult, { ok: true }>) => void;
  importResult?: Extract<DocumentImportResult, { ok: true }>;
  photos?: ReactNode;
}) {
  const t = useTranslations("scooters");
  const user = useOptionalSession()?.user;
  const canReadDocuments = canAccess(user, "scooter_documents.read");
  const { control } = useFormContext<ScooterEditorValues>();
  const insurance = useFieldArray({
    control,
    name: "insurancePolicies",
    keyName: "formKey",
  });
  const powertrain = useWatch({ control, name: "powertrainType" });
  const { documentWarnings, clearDocumentWarnings } = useScooterImportReview();
  const fieldProps = { brands, onBrandCreated, disabled, powertrain };
  const showDocuments = canReadDocuments && (!step || step === "documents");
  const showTechnical = !step || step === "civ" || step === "import_document";
  const fallbackIdentity = [
    ...new Set(
      fallbackFields
        .filter(
          (field) =>
            !(
              [
                ...OPERATIONAL_FIELDS,
                ...REGISTRATION_FIELDS,
                "registrationCertificateNumber",
              ] as readonly string[]
            ).includes(field),
        )
        .map((field) =>
          field.endsWith("Other")
            ? (field.slice(0, -5) as ScooterEditorField)
            : field,
        ),
    ),
  ];
  const reviewWarnings = documentWarnings.filter((warning) => {
    if (!step) return true;
    if (step === "documents") return false;
    const source = importSources?.find(
      (item) => item.sourceId === warning.sourceId,
    );
    if (source) return source.type === step;
    return importSources?.some((item) => item.type === "civ")
      ? step === "civ"
      : step === "operational";
  });
  const showRegistration =
    !step ||
    step === "registration_certificate" ||
    (step === "operational" &&
      fallbackFields.some(
        (field) =>
          field.startsWith("registration") ||
          field === "temporaryRegistrationExpiresAt" ||
          field === "requiredLicenseCategory",
      ));
  const [jsonOpen, setJsonOpen] = useState(false);
  const importMenuRef = useRef<HTMLButtonElement>(null);
  const menuImport = !editing || combinedReview;
  const canImport = canAccess(user, "scooter_documents.write");
  const jsonImport = (
    <ScooterDocumentImport
      secondary
      hideTrigger={menuImport}
      finalFocus={menuImport ? importMenuRef : undefined}
      open={menuImport ? jsonOpen : undefined}
      onOpenChange={menuImport ? setJsonOpen : undefined}
      sources={importSources}
      onApplyImport={onApplyImport}
      insuranceFiles={[
        ...documents.existing,
        ...documents.drafts.map((doc) => ({
          fileName: doc.file.name,
          insurancePolicyId: doc.insurancePolicyId,
        })),
      ]}
      brands={brands}
      editing={editing}
      disabled={disabled}
      onRawFields={onRawFields}
      rawFields={rawFields}
    />
  );
  return (
    <>
      {showDocuments ? (
        <>
          {!editing || combinedReview ? (
            <ScooterBatchDocuments
              headerActions={
                canImport ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          ref={importMenuRef}
                          aria-label={t("documents.actions")}
                          disabled={disabled}
                        />
                      }
                    >
                      <EllipsisVerticalIcon aria-hidden="true" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setJsonOpen(true)}>
                        <FileJsonIcon aria-hidden="true" />
                        {t("documentImport.open")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null
              }
              onLogicalDocument={onLogicalDocument}
              scooterVin={scooterVin}
              documents={documents}
              disabled={disabled}
              analyzing={analyzing}
              onRetryAnalysis={onRetryAnalysis}
              onCancelAnalysis={onCancelAnalysis}
              importResult={importResult}
            >
              {jsonImport}
            </ScooterBatchDocuments>
          ) : (
            <FormSection title={t("documents.title")}>
              <div
                className={
                  step === "documents"
                    ? "grid grid-cols-2 gap-3 sm:col-span-2 lg:grid-cols-4"
                    : "grid gap-4 sm:col-span-2"
                }
              >
                {v1.scooters.SCOOTER_DOCUMENT_TYPES.filter(
                  (type) => type !== "insurance",
                ).map((type) => (
                  <ScooterDocumentUpload
                    key={type}
                    type={type}
                    documents={documents}
                    disabled={disabled}
                    compact={step === "documents"}
                  />
                ))}
                {[
                  ...new Set(
                    [...documents.existing, ...documents.drafts]
                      .filter(
                        (doc) =>
                          doc.type === "insurance" &&
                          !insurance.fields.some(
                            (policy) => policy.id === doc.insurancePolicyId,
                          ),
                      )
                      .map((doc) => doc.insurancePolicyId ?? undefined),
                  ),
                ].map((policyId) => (
                  <ScooterDocumentUpload
                    key={policyId ?? "unassigned-insurance"}
                    type="insurance"
                    insurancePolicyId={policyId}
                    documents={documents}
                    disabled={disabled}
                    compact={step === "documents"}
                  />
                ))}
                <ScooterInsuranceDocuments
                  documents={documents}
                  disabled={disabled}
                  persistedPolicyIds={persistedPolicyIds}
                  insurance={insurance}
                  editing={editing}
                  compact={step === "documents"}
                />
              </div>
            </FormSection>
          )}
          {editing && !combinedReview ? jsonImport : null}
        </>
      ) : null}
      {canReadDocuments &&
      step &&
      step !== "documents" &&
      step !== "operational" ? (
        <div
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          aria-label={t(`documents.${step}`)}
        >
          {documents.existing
            .filter((doc) => doc.type === step)
            .map((document) => (
              <ScooterFilePreview
                key={document.id}
                document={document}
                disabled={disabled}
              />
            ))}
          {documents.drafts
            .filter((doc) => doc.type === step)
            .map((draft) => (
              <ScooterFilePreview
                key={draft.id}
                draft={draft}
                disabled={disabled}
              />
            ))}
        </div>
      ) : null}
      {reviewWarnings.map((warning) => (
        <div
          key={warning.sourceId ?? "civ"}
          className="flex flex-wrap items-center gap-3 rounded-md border border-warning p-3 text-sm text-warning"
          role="status"
        >
          <p className="min-w-0 flex-1 break-words">
            {t("documentImport.documentReview", {
              fields: warning.fields.join(", "),
            })}
          </p>
          <Button
            type="button"
            variant="text"
            disabled={disabled}
            onClick={() => clearDocumentWarnings(warning.sourceId)}
          >
            {t("documentImport.markDocumentReviewed")}
          </Button>
        </div>
      ))}
      {showTechnical ? (
        <ScooterTechnicalFields
          key={step ?? "edit"}
          {...fieldProps}
          compact={Boolean(step) || combinedReview}
          photos={photos}
          revealedFields={
            combinedReview ? Object.keys(importResult?.values ?? {}) : []
          }
        />
      ) : null}
      {canReadDocuments && (!step || step === "civ") ? (
        combinedReview &&
        !importSources?.some((source) => source.type === "civ") ? (
          <details>
            <summary className="cursor-pointer py-3 text-sm font-medium">
              {t("sections.civDocument")}
            </summary>
            <CivMetadataFields
              disabled={disabled || !canAccess(user, "scooter_documents.write")}
            />
          </details>
        ) : (
          <CivMetadataFields
            disabled={disabled || !canAccess(user, "scooter_documents.write")}
            compact={Boolean(step)}
            number={photos ? 9 : undefined}
          />
        )
      ) : null}
      {step === "operational" && fallbackIdentity.length ? (
        <FormSection title={t("wizard.missingIdentity")}>
          {fallbackIdentity.map((name) => (
            <ScooterEditorFieldControl key={name} name={name} {...fieldProps} />
          ))}
        </FormSection>
      ) : null}
      {showRegistration && !editing ? (
        <ScooterInitialRegistrationFields disabled={disabled} />
      ) : null}
      {!step || step === "insurance" ? (
        <ScooterInsuranceFields
          number={photos ? (canReadDocuments ? 10 : 9) : undefined}
          disabled={disabled}
          fieldKeys={insurance.fields.map((field) => field.formKey)}
          onRemovePolicy={
            editing
              ? undefined
              : (index) => {
                  const policy = insurance.fields[index];
                  documents.drafts
                    .filter((doc) => doc.insurancePolicyId === policy?.id)
                    .forEach((doc) => documents.removeDraft(doc.id));
                  insurance.remove(index);
                }
          }
        />
      ) : null}
      {!step || step === "operational" ? (
        <FormSection
          title={t("sections.operational")}
          number={photos ? (canReadDocuments ? 11 : 9) : undefined}
        >
          {OPERATIONAL_FIELDS.map((name) => (
            <ScooterEditorFieldControl key={name} name={name} {...fieldProps} />
          ))}
        </FormSection>
      ) : null}
    </>
  );
}

export function ScooterTechnicalFields({
  compact,
  revealedFields = [],
  excludeFields = [],
  photos,
  ...props
}: EditorFieldProps & {
  compact: boolean;
  revealedFields?: string[];
  excludeFields?: readonly string[];
  photos?: ReactNode;
}) {
  const t = useTranslations("scooters");
  const {
    getValues,
    formState: { errors },
  } = useFormContext<ScooterEditorValues>();
  const warnings = useContext(FormFieldWarningsContext);
  // Keep controls in place while users fill/clear them so focus is never lost.
  const [initiallyVisible] = useState(
    () =>
      new Set<string>([
        "vin",
        "brandId",
        "powertrainType",
        ...Object.entries(getValues())
          .filter(([, value]) => typeof value === "string" && value.trim())
          .map(([field]) => field),
        ...Object.keys(warnings),
      ]),
  );
  const inactive = new Set<string>(
    v1.scooters.inactivePowertrainFields(props.powertrain),
  );
  const sections = SCOOTER_EDITOR_SECTIONS.filter(
    (section) => section.title !== "operational",
  ).map((section) => ({
    ...section,
    fields: section.fields.filter(
      (field) =>
        !inactive.has(field) &&
        !excludeFields.includes(field) &&
        !(field === "fuelType" && props.powertrain === "electric"),
    ),
  }));
  const visible = new Set([...initiallyVisible, ...revealedFields]);
  const hasOther =
    compact &&
    sections.some((section) =>
      section.fields.some((field) => !visible.has(field)),
    );
  const showOtherForReview = sections.some((section) =>
    section.fields.some(
      (field) =>
        !visible.has(field) &&
        (warnings[field] ||
          warnings[`${field}Other`] ||
          get(errors, field) ||
          get(errors, `${field}Other`)),
    ),
  );
  function renderSections(other: boolean) {
    return sections.map((section, index) => {
      const fields = section.fields.filter(
        (field) => !compact || visible.has(field) !== other,
      );
      return fields.length ? (
        <Fragment key={section.title}>
          <FormSection
            title={t(`sections.${section.title}`)}
            number={photos ? (index === 0 ? 1 : index + 2) : undefined}
          >
            {fields.map((name) => (
              <ScooterEditorFieldControl key={name} name={name} {...props} />
            ))}
          </FormSection>
          {index === 0 && !other ? photos : null}
        </Fragment>
      ) : null;
    });
  }
  return (
    <>
      {renderSections(false)}
      {hasOther ? (
        <details open={showOtherForReview || undefined} className="grid gap-4">
          <summary className="cursor-pointer py-3 text-sm font-medium">
            {t("wizard.otherFields")}
          </summary>
          <div className="grid gap-6 pt-4">{renderSections(true)}</div>
        </details>
      ) : null}
    </>
  );
}

export function ScooterEditorFieldControl({
  name,
  ...props
}: EditorFieldProps & { name: ScooterEditorField }) {
  const t = useTranslations("scooters");
  const user = useOptionalSession()?.user;
  const documentField = [
    "civVersion",
    "civIssuedAt",
    "civIssuingAuthority",
  ].includes(name);
  if (documentField && !canAccess(user, "scooter_documents.read")) return null;
  const fieldDisabled =
    props.disabled ||
    (documentField && !canAccess(user, "scooter_documents.write"));
  if (name === "civVersion")
    return (
      <FormField
        name={name}
        label={t(`fields.${name}`)}
        disabled={fieldDisabled}
      >
        <FormSelect
          options={v1.vehicleCiv.CIV_VERSIONS.map((value) => ({
            value,
            label: value === "unknown" ? t("civ.unknownVersion") : value,
          }))}
        />
      </FormField>
    );
  if (name === "civIssuedAt")
    return (
      <FormField
        name={name}
        label={t(`fields.${name}`)}
        labelSuffix="day"
        disabled={fieldDisabled}
      >
        <FormDateField maxDate={v1.common.dateOnlyToday()} />
      </FormField>
    );
  if (BOOLEAN_FIELDS.has(name))
    return (
      <FormField
        name={name}
        label={t(`fields.${name}`)}
        disabled={fieldDisabled}
      >
        <FormSegmentedRadioGroup
          deselectValue=""
          options={[
            {
              value: "false",
              label: t("operational.no"),
              tone: "destructiveSubtle",
            },
            {
              value: "true",
              label: t("operational.yes"),
              tone: "successSubtle",
            },
          ]}
        />
      </FormField>
    );
  if (name in v1.scooters.SCOOTER_CIV_OPTIONS)
    return (
      <ScooterCivSelect
        name={name as keyof typeof v1.scooters.SCOOTER_CIV_OPTIONS}
        disabled={fieldDisabled}
        powertrain={props.powertrain}
      />
    );
  if (name === "brandId")
    return (
      <ScooterBrandField
        brands={props.brands}
        onBrandCreated={props.onBrandCreated}
        disabled={fieldDisabled}
      />
    );
  if (name === "fuelSystem")
    return <ScooterFuelSystemField disabled={fieldDisabled} />;
  if (name === "powertrainType")
    return <ScooterPowertrainField disabled={fieldDisabled} />;
  return <ScooterTextField name={name} disabled={fieldDisabled} />;
}

function ScooterTextField({
  name,
  disabled,
  placeholder,
}: {
  name: ScooterEditorField;
  disabled: boolean;
  placeholder?: string;
}) {
  const t = useTranslations("scooters");
  const locale = useLocale();
  const labelHint = useCivFieldHint(name);
  const vocabulary = useCivVocabulary();
  const listId = useId();
  const suggestions = vocabulary.filter((item) => item.field === name);
  const uppercase = name === "vin" || name === "nationalRegistryNumber";
  const fieldPlaceholder = placeholder ?? t(`placeholders.${name}`);
  return (
    <FormField
      name={name}
      label={t(`fields.${name}`)}
      labelHint={labelHint}
      disabled={disabled}
      required={name === "vin"}
      className={name === "notes" ? "sm:col-span-2" : undefined}
    >
      {name === "notes" ? (
        <FormTextarea placeholder={fieldPlaceholder} />
      ) : name === "engineDisplacementCc" ||
        name === "currentMileageKm" ||
        name === "actualMaxSpeedKmh" ? (
        <InputGroup>
          <FormInput
            placeholder={fieldPlaceholder}
            inputMode="numeric"
            list={suggestions.length ? listId : undefined}
            data-slot="input-group-control"
            className="flex-1 rounded-none border-0 bg-transparent shadow-none ring-0 focus-visible:border-transparent focus-visible:ring-0 disabled:bg-transparent aria-invalid:border-transparent aria-invalid:ring-0"
          />
          <InputGroupAddon>
            {name === "engineDisplacementCc"
              ? "cm³"
              : name === "currentMileageKm"
                ? "km"
                : "km/h"}
          </InputGroupAddon>
        </InputGroup>
      ) : DECIMAL_FIELDS.has(name) ? (
        <FormDecimalInput locale={locale} placeholder={fieldPlaceholder} />
      ) : (
        <FormInput
          placeholder={fieldPlaceholder}
          inputMode={
            DECIMAL_FIELDS.has(name)
              ? "decimal"
              : INTEGER_FIELDS.has(name)
                ? "numeric"
                : undefined
          }
          list={suggestions.length ? listId : undefined}
          normalize={uppercase ? uppercaseIdentifier : undefined}
          autoCapitalize={uppercase ? "characters" : undefined}
          spellCheck={uppercase ? false : undefined}
        />
      )}
      {suggestions.length ? (
        <datalist id={listId}>
          {suggestions.map((item) => (
            <option key={item.value} value={item.value} />
          ))}
        </datalist>
      ) : null}
    </FormField>
  );
}

function ScooterFuelSystemField({ disabled }: { disabled: boolean }) {
  const t = useTranslations("scooters");
  return (
    <FormField
      name="fuelSystem"
      label={t("fields.fuelSystem")}
      disabled={disabled}
    >
      <FormSegmentedRadioGroup
        deselectValue=""
        options={v1.scooters.SCOOTER_FUEL_SYSTEMS.map((value) => ({
          value,
          label: t(`fuelSystems.${value}`),
          tone: "neutral" as const,
        }))}
      />
    </FormField>
  );
}

function ScooterPowertrainField({ disabled }: { disabled: boolean }) {
  const t = useTranslations("scooters");
  const labelHint = useCivFieldHint("propulsionSystem");
  const { clearErrors, control } = useFormContext<ScooterEditorValues>();
  const powertrain = useWatch({ control, name: "powertrainType" });
  return (
    <FormField
      name="powertrainType"
      label={t("fields.powertrainType")}
      labelHint={labelHint}
      required
      disabled={disabled}
    >
      <FormSelect
        placeholder={t("placeholders.powertrainType")}
        options={v1.scooters.SCOOTER_POWERTRAIN_TYPES.map((value) => ({
          value,
          label: t(`powertrainTypes.${value}`),
        }))}
        onValueChange={(value) => {
          clearErrors([
            ...v1.scooters.inactivePowertrainFields(value),
            "fuelType",
            "fuelTypeOther",
          ]);
        }}
      />
      {powertrain === "electric" ? (
        <p className="text-sm text-muted-foreground">
          {t("civ.electricEnergy")}
        </p>
      ) : null}
    </FormField>
  );
}

const uppercaseIdentifier = (value: string) => value.toUpperCase();

export function ScooterInitialRegistrationFields({
  children,
  disabled,
  panel = false,
  number,
  status,
}: {
  disabled: boolean;
  panel?: boolean;
  number?: number;
  status?: import("react").ReactNode;
  children?: import("react").ReactNode;
}) {
  const t = useTranslations("scooters");
  const { control, getValues, setValue, clearErrors, setError } =
    useFormContext<ScooterEditorValues>();
  const registrationType = useWatch({ control, name: "registrationType" });
  const registrationDate = useWatch({ control, name: "registrationDate" });
  const registered =
    Boolean(registrationType) && registrationType !== "unregistered";
  return (
    <FormSection
      panel={panel}
      number={number}
      status={status}
      title={t("sections.registration")}
    >
      <FormField
        name="registrationType"
        label={t("fields.registrationType")}
        required
        disabled={disabled}
      >
        <FormSelect
          placeholder={t("placeholders.registrationType")}
          options={v1.scooters.SCOOTER_REGISTRATION_TYPES.map((value) => ({
            value,
            label: t(`registrationTypes.${value}`),
          }))}
          onValueChange={(value) => {
            if (value === "unregistered") {
              for (const field of [
                "registrationNumber",
                "registrationDate",
                "registrationCertificateNumber",
                "temporaryRegistrationExpiresAt",
              ] as const) {
                setValue(field, "", { shouldDirty: true });
                clearErrors(field);
              }
              setValue("requiredLicenseCategory", "none", {
                shouldDirty: true,
              });
              clearErrors("requiredLicenseCategory");
            } else {
              if (value !== "temporary") {
                setValue("temporaryRegistrationExpiresAt", "", {
                  shouldDirty: true,
                });
                clearErrors("temporaryRegistrationExpiresAt");
              }
              const plate = getValues("registrationNumber");
              if (plate) {
                if (
                  v1.scooters.validatePlateForRegistrationType(
                    value as v1.scooters.ScooterRegistrationType,
                    plate,
                  )
                )
                  clearErrors("registrationNumber");
                else
                  setError("registrationNumber", {
                    type: "validate",
                    message: t("feedback.validation.invalidPlateNumber"),
                  });
              }
            }
          }}
        />
      </FormField>
      {registered ? (
        <>
          <FormField
            name="registrationNumber"
            label={t("fields.registrationNumber")}
            required
            disabled={disabled}
          >
            <FormInput
              autoCapitalize="characters"
              normalize={uppercaseIdentifier}
              placeholder={t(
                `placeholders.registrationNumber.${registrationType}`,
              )}
            />
          </FormField>

          <FormField
            name="requiredLicenseCategory"
            label={t("fields.requiredLicenseCategory")}
            disabled={disabled}
          >
            <FormSelect
              placeholder={t("placeholders.requiredLicenseCategory")}
              options={v1.scooters.SCOOTER_REQUIRED_DRIVER_LICENSE_TYPES.map(
                (value) => ({
                  value,
                  label: t(`requiredDriverLicenseTypes.${value}`),
                }),
              )}
            />
          </FormField>
          {registrationType === "temporary" ? (
            <FormField
              name="temporaryRegistrationExpiresAt"
              label={t("fields.temporaryRegistrationExpiresAt")}
              labelSuffix="day"
              disabled={disabled}
            >
              <FormDateField minDate={registrationDate || undefined} />
            </FormField>
          ) : null}
        </>
      ) : null}
      {children}
    </FormSection>
  );
}
