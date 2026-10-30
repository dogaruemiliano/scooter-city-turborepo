"use client";
import { FormProvider, useForm } from "react-hook-form";
import { v1 } from "@repo/api-shared";
import { useOptionalSession } from "@/components/auth/SessionProvider";
import { canAccess } from "@/lib/access";
import { ScooterInsuranceSection } from "./ScooterInsuranceSection";
import { ScooterItpValidityFields } from "./ScooterItpValidityFields";
import {
  scooterEditorDefaults,
  type ScooterEditorValues,
} from "./scooter-editor-schema";

/** Detail-page values are read-only; changes belong to the scooter editor. */
export function ScooterComplianceSection({
  scooter,
}: {
  scooter: v1.scooters.Scooter;
}) {
  const user = useOptionalSession()?.user;
  const form = useForm<ScooterEditorValues>({
    defaultValues: scooterEditorDefaults(scooter),
  });
  if (!canAccess(user, "scooter_documents.read")) return null;
  return (
    <FormProvider {...form}>
      <div className="grid gap-6">
        <ScooterItpValidityFields
          scooter={scooter}
          evidence={scooter.documents ?? []}
          disabled
        />
        <ScooterInsuranceSection scooter={scooter} disabled />
      </div>
    </FormProvider>
  );
}
