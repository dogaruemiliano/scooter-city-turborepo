"use client";

import { Button, FormActions as SharedFormActions } from "@repo/ui/components";
import { UserPlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { PersonWizardStep } from "./WizardProgress";

export function FormActions({
  creating,
  ready = false,
  uploadingPhotos,
  extracting,
  confirmationRequired = false,
  step,
  canGoBack,
  onBack,
  onNext,
}: {
  creating: boolean;
  ready?: boolean;
  uploadingPhotos: boolean;
  extracting: boolean;
  confirmationRequired?: boolean;
  step: PersonWizardStep;
  canGoBack: boolean;
  onBack: () => void;
  onNext: () => void;
}) {
  const t = useTranslations("persons");

  return (
    <SharedFormActions
      ready={ready}
      pending={creating}
      className="mt-auto w-full"
    >
      {canGoBack ? (
        <Button
          type="button"
          variant="outline"
          className="mr-auto hidden md:inline-flex"
          disabled={creating}
          onClick={onBack}
        >
          {t("wizard.back")}
        </Button>
      ) : null}
      {["documents", "personal", "license", "contact", "address"].includes(
        step,
      ) ? (
        <Button
          type="button"
          disabled={creating || uploadingPhotos}
          onClick={onNext}
        >
          {uploadingPhotos
            ? t("actions.uploadingDocumentPhoto")
            : step === "documents"
              ? t("wizard.continueToReview")
              : t("wizard.next")}
        </Button>
      ) : null}
      {step === "review" ? (
        <Button
          type="submit"
          className="w-full md:w-auto"
          disabled={
            creating || uploadingPhotos || extracting || confirmationRequired
          }
        >
          <UserPlusIcon data-icon="inline-start" />
          {creating ? t("actions.creating") : t("actions.create")}
        </Button>
      ) : null}
    </SharedFormActions>
  );
}
