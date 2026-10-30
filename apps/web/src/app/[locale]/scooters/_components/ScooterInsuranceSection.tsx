"use client";
import { useEffect } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { useTranslations } from "next-intl";
import { v1 } from "@repo/api-shared";
import { Button } from "@repo/ui/components";
import { useOptionalSession } from "@/components/auth/SessionProvider";
import { canAccess } from "@/lib/access";
import { ScooterInsuranceFields } from "./ScooterInsuranceFields";
import {
  insuranceEditorDefaults,
  insuranceEditorHasContent,
  type ScooterEditorValues,
} from "./scooter-editor-schema";

/** Insurance edits share the scooter form's values and submission. */
export function ScooterInsuranceSection({
  scooter,
  disabled = false,
  number,
  onRemoveDraftPolicy,
}: {
  scooter?: v1.scooters.Scooter;
  disabled?: boolean;
  number?: number;
  onRemoveDraftPolicy?: (id: string) => void;
}) {
  const ti = useTranslations("scooters.insurance");
  const user = useOptionalSession()?.user;
  const form = useFormContext<ScooterEditorValues>();
  const policies =
    useWatch({ control: form.control, name: "insurancePolicies" }) ?? [];
  const canRead = canAccess(user, "scooter_documents.read");
  const canWrite =
    !disabled &&
    !scooter?.deletedAt &&
    canAccess(user, "scooter_documents.write") &&
    canAccess(user, scooter ? "scooters.update" : "scooters.create");
  useEffect(() => {
    if (canRead && !form.getValues("insurancePolicies")?.length)
      form.setValue("insurancePolicies", [insuranceEditorDefaults()]);
  }, [canRead, form, policies.length]);
  if (!canRead) return null;
  const canAdd =
    policies.length < 100 && policies.every(insuranceEditorHasContent);
  function canRemove(index: number) {
    const current = form.getValues("insurancePolicies") ?? [];
    if (current.length <= 1) return false;
    const policy = current[index];
    const persisted = scooter?.insurancePolicies?.some(
      (item) => item.id === policy?.id,
    );
    return (
      !persisted ||
      current.some(
        (item, position) =>
          position !== index && insuranceEditorHasContent(item),
      )
    );
  }
  function remove(index: number) {
    if (!canWrite || !canRemove(index)) return;
    const current = form.getValues("insurancePolicies") ?? [];
    const policy = current[index];
    if (!policy) return;
    onRemoveDraftPolicy?.(policy.id);
    form.setValue(
      "insurancePolicies",
      current.filter((_, position) => position !== index),
      { shouldDirty: true },
    );
  }
  return (
    <div className="grid gap-4">
      <ScooterInsuranceFields
        number={number}
        panel
        title={policies.length <= 1 ? ti("title") : undefined}
        disabled={!canWrite}
        fieldKeys={policies.map((policy) => policy.id)}
        canRemovePolicy={canRemove}
        onRemovePolicy={canWrite ? remove : undefined}
      />
      {scooter && canWrite && canAdd ? (
        <Button
          type="button"
          variant="outline"
          className="justify-self-start"
          onClick={() =>
            form.setValue(
              "insurancePolicies",
              [
                ...(form.getValues("insurancePolicies") ?? []),
                insuranceEditorDefaults(),
              ],
              { shouldDirty: true },
            )
          }
        >
          {ti("add")}
        </Button>
      ) : null}
    </div>
  );
}
