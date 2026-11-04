"use client";

import { Button, Field, FieldLabel } from "@repo/ui/components";
import { useCallback, useMemo } from "react";
import { v1 } from "@repo/api-shared";
import { useTranslations } from "next-intl";
import { ScooterSelect } from "@/components/ScooterSelect";
import { useSession } from "@/components/auth/SessionProvider";
import { canAccess } from "@/lib/access";
import { webApi } from "@/lib/api";
import { Feedback, useRemote } from "@/components/WorkspaceForm";

export function ProblemScooterPicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("workspace");
  const { user } = useSession();
  const restricted = !canAccess(user, "scooters.read", "ALL");
  const enabled = restricted && !!user;
  const load = useCallback(
    () =>
      enabled
        ? webApi.fetch(
            "/v1/problems/creation-scooters",
            v1.problems.problemCreationScootersSchema,
            { cache: "no-store" },
          )
        : Promise.resolve(null),
    [enabled],
  );
  const remote = useRemote(load);
  const scooters = useMemo(
    () =>
      (remote.data?.items ?? []).map((scooter) => ({
        ...scooter,
        brand: scooter.brandName,
      })),
    [remote.data],
  );
  return (
    <Field>
      <FieldLabel>{t("problems.scooter")}</FieldLabel>
      <ScooterSelect
        value={value}
        scooters={restricted ? scooters : undefined}
        onValueChange={onChange}
        required
        disabled={
          disabled || (restricted && (remote.loading || !!remote.error))
        }
      />
      {restricted ? (
        <>
          <Feedback error={remote.error} />
          {remote.error ? (
            <Button type="button" variant="outline" onClick={remote.reload}>
              {t("retry")}
            </Button>
          ) : null}
        </>
      ) : null}
    </Field>
  );
}
