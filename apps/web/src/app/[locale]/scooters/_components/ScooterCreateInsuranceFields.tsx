"use client";

import { useEffect, useRef } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { useTranslations } from "next-intl";
import { useOptionalSession } from "@/components/auth/SessionProvider";
import { canAccess } from "@/lib/access";
import { ScooterInsuranceFields } from "./ScooterInsuranceFields";
import {
  insuranceEditorDefaults,
  insuranceEditorHasContent,
  type ScooterEditorValues,
} from "./scooter-editor-schema";

export function ScooterCreateInsuranceFields({
  disabled,
}: {
  disabled: boolean;
}) {
  const t = useTranslations("scooters");
  const { control, getValues, setValue } =
    useFormContext<ScooterEditorValues>();
  const policies = useWatch({ control, name: "insurancePolicies" }) ?? [];
  const placeholder = useRef<ReturnType<typeof insuranceEditorDefaults> | null>(
    null,
  );
  const canRead = canAccess(
    useOptionalSession()?.user,
    "scooter_documents.read",
  );

  useEffect(() => {
    if (!canRead || getValues("insurancePolicies")?.length) return;
    placeholder.current ??= insuranceEditorDefaults();
    setValue("insurancePolicies", [placeholder.current]);
  }, [canRead, policies.length, getValues, setValue]);

  return (
    <ScooterInsuranceFields
      panel
      disabled={disabled}
      fieldKeys={policies.map((policy) => policy.id)}
      title={t("creation.insuranceDetails")}
      number={4}
      showPolicyStatus={policies.some(insuranceEditorHasContent)}
    />
  );
}
