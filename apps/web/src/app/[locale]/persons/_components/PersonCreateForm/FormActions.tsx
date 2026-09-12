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
  onBack,
  onNext,
}: {
  creating: boolean;
  uploadingPhotos: boolean;
  extracting: boolean;
  personsHref: string;
  step: PersonWizardStep;
  onBack: () => void;
  onNext: () => void;
}) {
  const t = useTranslations("persons");

  return (
    <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
      {creating ? (
        <Button
          type="button"
          variant="outline"
          className="w-full sm:w-auto"
          disabled
        >
          {t("actions.cancel")}
        </Button>
      ) : (
        <Link
          href={personsHref}
          className={buttonVariants({
            variant: "outline",
            className: "w-full sm:w-auto",
          })}
        >
          {t("actions.cancel")}
        </Link>
      )}
      {step !== "citizenship" ? (
        <Button
          type="button"
          variant="outline"
          disabled={creating}
          onClick={onBack}
        >
          {t("wizard.back")}
        </Button>
      ) : null}
      {step === "documents" ? (
        <Button
          type="button"
          disabled={creating || uploadingPhotos}
          onClick={onNext}
        >
          {uploadingPhotos
            ? t("actions.uploadingDocumentPhoto")
            : t("wizard.continueToReview")}
        </Button>
      ) : null}
      {step === "review" ? (
        <Button
          type="submit"
          className="w-full sm:w-auto"
          disabled={creating || uploadingPhotos || extracting}
        >
          <UserPlusIcon data-icon="inline-start" />
          {creating ? t("actions.creating") : t("actions.create")}
        </Button>
      ) : null}
    </div>
  );
}
