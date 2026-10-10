"use client";

import { ApiError, v1 } from "@repo/api-shared";
import { Button, buttonVariants } from "@repo/ui/components";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { FormProvider, type FieldErrors, useWatch } from "react-hook-form";

import { FormSummary } from "@/components/form/FormSummary";
import { webApi } from "@/lib/api";
import { useZodForm } from "@/lib/form/use-zod-form";
import { useScooterDocuments } from "./useScooterDocuments";
import {
  CivVocabularyContext,
  type CivVocabulary,
} from "./CivVocabularyContext";
import { ScooterEditorFields } from "./ScooterEditorFields";
import {
  scooterEditorMessage,
  scooterServerFieldErrors,
} from "./scooter-editor-messages";
import {
  scooterChangedFields,
  scooterCreateFormSchema,
  scooterEditFormSchema,
  scooterEditorDefaults,
  type ScooterEditorValues,
} from "./scooter-editor-schema";
import { scooterFieldConflict } from "./scooter-feedback";

export interface ScooterEditorProps {
  scooter?: v1.scooters.Scooter;
  returnHref: string;
  brands: v1.scooterBrands.ScooterBrand[];
  vocabulary?: CivVocabulary;
}

export function ScooterEditor({
  scooter,
  returnHref,
  brands,
  vocabulary = [],
}: ScooterEditorProps) {
  const t = useTranslations("scooters");
  const router = useRouter();
  const [createdBrands, setCreatedBrands] = useState<
    v1.scooterBrands.ScooterBrand[]
  >([]);
  const availableBrands = [
    ...new Map(
      [...brands, ...createdBrands].map((brand) => [brand.id, brand]),
    ).values(),
  ];
  const [importedRawFields, setImportedRawFields] = useState<Record<
    string,
    string
  > | null>(null);
  const documents = useScooterDocuments(scooter?.documents);
  const formRef = useRef<HTMLFormElement>(null);
  const submitting = useRef(false);
  const pendingFocus = useRef<FieldErrors<ScooterEditorValues> | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const form = useZodForm<ScooterEditorValues, v1.scooters.UpdateScooterInput>(
    scooter ? scooterEditFormSchema : scooterCreateFormSchema,
    {
      defaultValues: scooterEditorDefaults(scooter),
      labelFor: (path) => t(`fields.${path === "brandId" ? "brand" : path}`),
      messageOverride: (issue, path) => scooterEditorMessage(issue, path, t),
      shouldFocusError: false,
    },
  );
  const { isSubmitting, isDirty, dirtyFields, submitCount } = form.formState;
  const powertrain = useWatch({
    control: form.control,
    name: "powertrainType",
  });
  const clearedFields =
    scooter && scooter.powertrainType !== powertrain
      ? v1.scooters
          .inactivePowertrainFields(powertrain)
          .filter((field) => scooter[field] != null)
      : [];

  function focusErrors(errors: FieldErrors<ScooterEditorValues>) {
    pendingFocus.current = errors;
  }

  useEffect(() => {
    // Validation runs while RHF is submitting and the controls are disabled.
    // Wait for the enabled controls to commit before moving focus.
    if (isSubmitting || !pendingFocus.current) return;
    const frame = requestAnimationFrame(() => {
      const errors = pendingFocus.current;
      pendingFocus.current = null;
      if (!errors) return;
      // Composite controls also synchronize their disabled state after commit.
      for (const field of formRef.current?.querySelectorAll<HTMLElement>(
        "[data-field-name]",
      ) ?? []) {
        if (errors[field.dataset.fieldName as keyof ScooterEditorValues]) {
          field
            .querySelector<HTMLElement>(
              'input:not([type="hidden"]), textarea, button[role="combobox"], button[aria-haspopup="dialog"]',
            )
            ?.focus();
          break;
        }
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [isSubmitting, submitCount]);

  async function submit(input: v1.scooters.UpdateScooterInput) {
    if (submitting.current || documents.blocked) return;
    submitting.current = true;
    setRequestError(null);
    try {
      const json = scooter ? scooterChangedFields(input, dirtyFields) : input;
      await webApi.fetch(
        scooter
          ? v1.scooters.ROUTES.update(scooter.id)
          : v1.scooters.ROUTES.create,
        v1.scooters.scooterSchema,
        {
          method: scooter ? "PATCH" : "POST",
          json: {
            ...json,
            ...documents.payload,
            ...(importedRawFields ? { civRawFields: importedRawFields } : {}),
          },
        },
      );
      router.push(returnHref);
      router.refresh();
    } catch (error) {
      const serverErrors = scooterServerFieldErrors(error, t);
      if (Object.keys(serverErrors).length) {
        const errors: FieldErrors<ScooterEditorValues> = {};
        for (const name of Object.keys(
          serverErrors,
        ) as (keyof ScooterEditorValues)[]) {
          const fieldError = { type: "server", message: serverErrors[name] };
          form.setError(name, fieldError);
          errors[name] = fieldError;
        }
        focusErrors(errors);
        setRequestError(Object.values(serverErrors).join(" "));
        return;
      }
      const conflict = scooterFieldConflict(error);
      if (conflict) {
        const message = t(
          conflict.field === "vin"
            ? "feedback.vinConflict"
            : "feedback.plateConflict",
        );
        form.setError(conflict.field, { type: "server", message });
        focusErrors({ [conflict.field]: { type: "server", message } });
        setRequestError(message);
      } else {
        const details = error instanceof ApiError ? error.details : undefined;
        if (
          details &&
          typeof details === "object" &&
          "field" in details &&
          details.field === "brandId"
        ) {
          const message = t("feedback.brandUnavailable");
          form.setError("brandId", { type: "server", message });
          focusErrors({ brandId: { type: "server", message } });
          setRequestError(message);
        } else setRequestError(t("feedback.genericError"));
      }
    } finally {
      submitting.current = false;
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-screen-lg flex-1 flex-col gap-6 px-4 pt-6 pb-12 sm:px-6 sm:pt-10 sm:pb-16">
      <CivVocabularyContext value={vocabulary}>
        <FormProvider {...form}>
          <form
            ref={formRef}
            className="grid gap-8"
            noValidate
            onSubmit={(event) => {
              void form.handleSubmit(submit, (errors) => {
                setRequestError(null);
                focusErrors(errors);
              })(event);
            }}
          >
            <FormSummary
              title={t(
                scooter
                  ? "feedback.updateErrorTitle"
                  : "feedback.createErrorTitle",
              )}
              message={requestError}
            />
            <ScooterEditorFields
              documents={documents}
              brands={availableBrands}
              rawFields={importedRawFields ?? scooter?.civRawFields ?? {}}
              onBrandCreated={(brand) =>
                setCreatedBrands((current) => [...current, brand])
              }
              onRawFields={(fields) =>
                setImportedRawFields((current) => ({
                  ...scooter?.civRawFields,
                  ...current,
                  ...fields,
                }))
              }
              editing={Boolean(scooter)}
              disabled={isSubmitting}
            />
            {scooter?.propulsionSystem ? (
              <p className="text-sm text-muted-foreground">
                {t("civ.legacyPropulsion", { value: scooter.propulsionSystem })}
              </p>
            ) : null}
            {scooter &&
            scooter.powertrainType !== powertrain &&
            powertrain === "electric" &&
            scooter.fuelType &&
            scooter.fuelType !== "electric" ? (
              <p role="status" className="text-sm text-muted-foreground">
                {t("civ.electricFuelOnSave")}
              </p>
            ) : null}
            {clearedFields.length > 0 ? (
              <p role="status" className="text-sm text-muted-foreground">
                {t("civ.clearOnSave", {
                  fields: clearedFields
                    .map((field) => t(`fields.${field}`))
                    .join(", "),
                })}
              </p>
            ) : null}
            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Link
                href={returnHref}
                className={buttonVariants({ variant: "outline" })}
                aria-disabled={isSubmitting}
                tabIndex={isSubmitting ? -1 : undefined}
                onClick={(event) => {
                  if (isSubmitting) event.preventDefault();
                }}
              >
                {t("actions.cancel")}
              </Link>
              <Button
                type="submit"
                disabled={
                  isSubmitting ||
                  documents.blocked ||
                  Boolean(
                    scooter &&
                    !isDirty &&
                    !documents.changed &&
                    !importedRawFields,
                  )
                }
              >
                {t(
                  scooter
                    ? isSubmitting
                      ? "actions.saving"
                      : "actions.save"
                    : isSubmitting
                      ? "actions.creating"
                      : "actions.create",
                )}
              </Button>
            </div>
          </form>
        </FormProvider>
      </CivVocabularyContext>
    </div>
  );
}
