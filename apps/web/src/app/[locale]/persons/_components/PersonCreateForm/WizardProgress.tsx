"use client";

import { CheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";

export const REVIEW_STEPS = [
  "personal",
  "contact",
  "address",
  "review",
] as const;
export type PersonReviewStep = (typeof REVIEW_STEPS)[number];
export type PersonWizardStep =
  | "citizenship"
  | "nationalId"
  | "documents"
  | PersonReviewStep;
const STEPS = ["citizenship", "documents", ...REVIEW_STEPS] as const;

export function isReviewStep(step: PersonWizardStep): step is PersonReviewStep {
  return REVIEW_STEPS.some((item) => item === step);
}

export function WizardProgress({
  step,
  disabled,
  onSelect,
}: {
  step: PersonWizardStep;
  disabled: boolean;
  onSelect: (step: PersonReviewStep) => void;
}) {
  const t = useTranslations("persons");
  const current = STEPS.indexOf(step === "nationalId" ? "documents" : step);
  return (
    <ol
      aria-label={t("wizard.progress")}
      className="grid grid-cols-3 gap-3 sm:grid-cols-6"
    >
      {STEPS.map((item, index) => (
        <li
          key={item}
          aria-current={index === current ? "step" : undefined}
          className={`border-b-2 pb-3 text-sm ${index === current ? "border-primary text-foreground" : "border-border text-muted-foreground"}`}
        >
          {isReviewStep(step) && isReviewStep(item) ? (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onSelect(item)}
              className="flex w-full items-center gap-2 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              aria-label={t(`wizard.steps.${item}`)}
            >
              <span aria-hidden="true">{index + 1}</span>
              <span className={index === current ? "font-medium" : undefined}>
                {t(`wizard.steps.${item}`)}
              </span>
            </button>
          ) : (
            <span className="flex items-center gap-2">
              {index < current && index < 2 ? (
                <CheckIcon
                  aria-hidden="true"
                  className="size-4 shrink-0 text-primary"
                />
              ) : (
                <span aria-hidden="true">{index + 1}</span>
              )}
              <span>{t(`wizard.steps.${item}`)}</span>
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}
