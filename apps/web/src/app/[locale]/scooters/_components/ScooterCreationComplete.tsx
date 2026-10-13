"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { FormProvider } from "react-hook-form";
import { v1 } from "@repo/api-shared";
import {
  Alert,
  AlertTitle,
  AlertDescription,
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  FormActions,
} from "@repo/ui/components";
import { CheckCircle2Icon, ArrowRightIcon } from "lucide-react";
import { useZodForm } from "@/lib/form/use-zod-form";
import { webApi } from "@/lib/api";
import { canAccess } from "@/lib/access";
import { useOptionalSession } from "@/components/auth/SessionProvider";
import { FormSummary } from "@/components/form/FormSummary";
import {
  CivVocabularyContext,
  type CivVocabulary,
} from "./CivVocabularyContext";
import { CivMetadataFields } from "./CivMetadataFields";
import { ScooterTechnicalFields } from "./ScooterEditorFields";
import {
  scooterChangedFields,
  scooterEditFormSchema,
  scooterEditorDefaults,
  type ScooterEditorValues,
} from "./scooter-editor-schema";
import {
  scooterEditorMessage,
  scooterServerFieldErrors,
} from "./scooter-editor-messages";

export function ScooterCreationComplete({
  scooter,
  returnHref,
  brands,
  vocabulary,
}: {
  scooter: v1.scooters.Scooter;
  returnHref: string;
  brands: v1.scooterBrands.ScooterBrand[];
  vocabulary: CivVocabulary;
}) {
  const t = useTranslations("scooters");
  const router = useRouter();
  const user = useOptionalSession()?.user;
  const [completing, setCompleting] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const form = useZodForm<ScooterEditorValues, v1.scooters.UpdateScooterInput>(
    scooterEditFormSchema,
    {
      defaultValues: scooterEditorDefaults(scooter),
      labelFor: (path) => t(`fields.${path === "brandId" ? "brand" : path}`),
      messageOverride: (issue, path) => scooterEditorMessage(issue, path, t),
    },
  );
  const busy = form.formState.isSubmitting;
  function finish() {
    router.push(returnHref);
    router.refresh();
  }
  async function save(input: v1.scooters.UpdateScooterInput) {
    setRequestError(null);
    try {
      const changes = scooterChangedFields(input, form.formState.dirtyFields);
      if (!canAccess(user, "scooter_documents.write")) {
        for (const key of [
          "civVersion",
          "civIssuedAt",
          "civIssuingAuthority",
          "civRawFields",
        ] as const)
          delete changes[key];
      }
      if (Object.keys(changes).length)
        await webApi.fetch(
          v1.scooters.ROUTES.update(scooter.id),
          v1.scooters.scooterSchema,
          { method: "PATCH", json: changes },
        );
      finish();
    } catch (error) {
      const errors = scooterServerFieldErrors(error, t);
      for (const [name, message] of Object.entries(errors))
        form.setError(name as keyof ScooterEditorValues, {
          type: "server",
          message,
        });
      setRequestError(t("creation.civSaveError"));
    }
  }
  return (
    <div className="mx-auto flex w-full min-w-0 max-w-(--breakpoint-lg) flex-1 flex-col gap-8 px-4 pt-8 pb-[calc(var(--spacing-16)+env(safe-area-inset-bottom))] sm:px-8 sm:pb-[calc(var(--spacing-24)+env(safe-area-inset-bottom))]">
      <Alert role="status">
        <CheckCircle2Icon aria-hidden="true" />
        <AlertTitle>{t("creation.created")}</AlertTitle>
        <AlertDescription>{t("creation.createdDescription")}</AlertDescription>
      </Alert>
      {!completing ? (
        <Card>
          <CardHeader>
            <CardTitle>{v1.scooters.scooterDisplayCode(scooter)}</CardTitle>
            <CardDescription>{t("creation.savedCode")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button type="button" onClick={finish}>
              {t("creation.finish")}
              <ArrowRightIcon aria-hidden="true" data-icon="inline-end" />
            </Button>
            {canAccess(user, "scooters.update") ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => setCompleting(true)}
              >
                {t("creation.completeCiv")}
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <CivVocabularyContext value={vocabulary}>
          <FormProvider {...form}>
            <form
              className="grid min-w-0 gap-8"
              noValidate
              onSubmit={form.handleSubmit(save)}
            >
              <header className="grid gap-2">
                <h1 className="text-2xl font-semibold">
                  {t("creation.civTitle")}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {t("creation.civHelp")}
                </p>
              </header>
              <FormSummary
                title={t("feedback.updateErrorTitle")}
                message={requestError}
              />
              <ScooterTechnicalFields
                compact={false}
                brands={brands}
                onBrandCreated={() => {}}
                disabled={busy}
                powertrain={scooter.powertrainType}
                excludeFields={[
                  "vin",
                  "brandId",
                  "powertrainType",
                  "model",
                  "manufactureYear",
                  "color",
                  "engineDisplacementCc",
                  "powerKw",
                  "electricMotorPowerKw",
                  "vehicleCategory",
                ]}
              />
              {canAccess(user, "scooter_documents.read") ? (
                <CivMetadataFields
                  disabled={busy || !canAccess(user, "scooter_documents.write")}
                />
              ) : null}
              <FormActions sticky status={t("creation.civHelp")}>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={finish}
                >
                  {t("creation.finish")}
                </Button>
                <Button type="submit" disabled={busy}>
                  {t(busy ? "actions.saving" : "creation.saveCiv")}
                </Button>
              </FormActions>
            </form>
          </FormProvider>
        </CivVocabularyContext>
      )}
    </div>
  );
}
