"use client";

import { useState } from "react";
import type { FieldErrors, UseFormReturn } from "react-hook-form";
import { v1 } from "@repo/api-shared";
import type {
  ScooterEditorField,
  ScooterEditorValues,
} from "./scooter-editor-schema";
import {
  scooterWizardSteps,
  stepFields,
  type ScooterWizardStep,
} from "./scooter-wizard";
import type { DocumentSource } from "./scooter-document-sources";

type Form = UseFormReturn<
  ScooterEditorValues,
  unknown,
  v1.scooters.UpdateScooterInput
>;
export function useScooterWizard(
  form: Form,
  sources: DocumentSource[],
  importedFallbackFields: ScooterEditorField[] = [],
) {
  const [selectedStep, setSelectedStep] =
    useState<ScooterWizardStep>("documents");
  const [fallbackFields, setFallbackFields] = useState<ScooterEditorField[]>(
    [],
  );
  const steps = scooterWizardSteps(sources.map((source) => source.type));
  const step = steps.includes(selectedStep) ? selectedStep : "documents";
  const index = steps.indexOf(step);
  if (selectedStep !== step) setSelectedStep(step);
  function navigate(
    next: ScooterWizardStep,
    extraFields: ScooterEditorField[] = [],
  ) {
    if (next === "operational") {
      const values = form.getValues();
      const missing = (["vin", "brandId", "powertrainType"] as const).filter(
        (name) => !values[name],
      );
      const registration =
        !sources.some((source) => source.type === "registration_certificate") ||
        !values.registrationType;
      setFallbackFields([
        ...new Set([
          ...missing,
          ...(!sources.some(
            (source) =>
              source.type === "civ" || source.type === "import_document",
          )
            ? importedFallbackFields
            : []),
          ...(registration ? ["registrationType" as const] : []),
          ...extraFields,
        ]),
      ]);
    }
    setSelectedStep(next);
  }
  function errorStep(errors: FieldErrors<ScooterEditorValues>) {
    const fields = Object.keys(errors) as ScooterEditorField[];
    for (const candidate of steps.filter(
      (item) => item !== "documents" && item !== "operational",
    )) {
      if (fields.some((name) => stepFields(candidate).includes(name))) {
        navigate(candidate);
        return;
      }
    }
    navigate(
      "operational",
      fields.filter((field) => field !== ("insurancePolicies" as string)),
    );
  }
  async function next() {
    const names = step === "documents" ? [] : stepFields(step);
    const valid =
      !names.length || (await form.trigger(names, { shouldFocus: false }));
    if (!valid) return false;
    navigate(steps[index + 1] ?? "operational");
    return true;
  }
  return {
    step,
    steps,
    index,
    fallbackFields,
    last: index === steps.length - 1,
    next,
    errorStep,
    back: () => navigate(steps[Math.max(0, index - 1)]!),
    navigate,
  };
}
