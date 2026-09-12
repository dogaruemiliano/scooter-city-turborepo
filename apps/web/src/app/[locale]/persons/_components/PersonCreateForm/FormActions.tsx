"use client";

import { Button, buttonVariants } from "@repo/ui/components";
import { UserPlusIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { PersonWizardStep } from "./WizardProgress";

export function FormActions({
  creating,
  uploadingPhotos,
  extracting,
  personsHref,
  step,
  canGoBack,
  forwardStepLabel,
  onBack,
  onForward,
  onNext,
}: {
  creating: boolean;
  uploadingPhotos: boolean;
  extracting: boolean;
  personsHref: string;
  step: PersonWizardStep;
  canGoBack: boolean;
  forwardStepLabel?: string;
  onBack: () => void;
  onForward: () => void;
  onNext: () => void;
}) {
  const t = useTranslations("persons");

  return (
    <div className="mt-auto flex flex-col gap-2 border-t border-border pt-4 md:items-end">
      {canGoBack || forwardStepLabel ? (
        <div className="mr-auto hidden flex-wrap items-center gap-2 md:flex">
          {canGoBack ? (
            <Button
              type="button"
              variant="outline"
              disabled={creating}
              onClick={onBack}
            >
              {t("wizard.back")}
            </Button>
          ) : null}
          {forwardStepLabel ? (
            <Button
              type="button"
              variant="text"
              disabled={creating}
              onClick={onForward}
            >
              {t("wizard.returnTo", { step: forwardStepLabel })}
            </Button>
          ) : null}
        </div>
      ) : null}
      {["documents", "personal", "license", "contact", "address"].includes(
        step,
      ) ? (
        <Button
          type="button"
          disabled={
            creating || uploadingPhotos || (step === "personal" && extracting)
          }
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
          disabled={creating || uploadingPhotos || extracting}
        >
          <UserPlusIcon data-icon="inline-start" />
          {creating ? t("actions.creating") : t("actions.create")}
        </Button>
      ) : null}
      {creating ? (
        <Button
          type="button"
          variant="outline"
          className="w-full md:w-auto"
          disabled
        >
          {t("actions.cancel")}
        </Button>
      ) : (
        <Link
          href={personsHref}
          className={buttonVariants({
            variant: "outline",
            className: "w-full md:w-auto",
          })}
        >
          {t("actions.cancel")}
        </Link>
      )}
    </div>
  );
}
