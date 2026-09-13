"use client";

import { cn } from "@repo/ui/lib/utils";
import { useTranslations } from "next-intl";
import type { Ref } from "react";

export const REVIEW_STEPS = [
  "personal",
  "address",
  "license",
  "contact",
  "review",
] as const;
export type PersonReviewStep = (typeof REVIEW_STEPS)[number];
export type PersonWizardStep = "citizenship" | "documents" | PersonReviewStep;
const STEPS = ["citizenship", "documents", ...REVIEW_STEPS] as const;
export type PersonProgressStep = (typeof STEPS)[number];

export function isReviewStep(step: PersonWizardStep): step is PersonReviewStep {
  return REVIEW_STEPS.some((item) => item === step);
}

export function WizardProgress({
  step,
  disabled,
  onSelect,
  summaryRef,
}: {
  step: PersonWizardStep;
  disabled: boolean;
  onSelect: (step: PersonProgressStep) => void;
  summaryRef?: Ref<HTMLHeadingElement>;
}) {
  const t = useTranslations("persons");
  const current = STEPS.indexOf(step);
  const currentLabel = t(`wizard.steps.${STEPS[current]!}`);

  return (
    <div className="grid gap-2">
      <ol aria-label={t("wizard.progress")} className="grid grid-cols-7 gap-1">
        {STEPS.map((item, index) => {
          const active = index === current;
          const canSelect =
            index < current || (isReviewStep(step) && isReviewStep(item));
          const label = t(`wizard.steps.${item}`);
          const content = (
            <>
              <span
                aria-hidden="true"
                className={cn(
                  "h-0.5 w-full rounded-full group-disabled:bg-disabled",
                  index <= current ? "bg-primary" : "bg-border-strong",
                )}
              />
              <span className="sr-only">{label}</span>
            </>
          );
          const itemClassName = "flex h-6 w-full items-start rounded-sm";

          return (
            <li
              key={item}
              aria-current={active ? "step" : undefined}
              className="min-w-0"
            >
              {canSelect ? (
                <button
                  type="button"
                  disabled={disabled}
                  aria-label={label}
                  onClick={() => onSelect(item)}
                  className={cn(
                    itemClassName,
                    "group outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:bg-transparent",
                  )}
                >
                  {content}
                </button>
              ) : (
                <span className={itemClassName}>{content}</span>
              )}
            </li>
          );
        })}
      </ol>
      <h2
        ref={summaryRef}
        tabIndex={-1}
        aria-live="polite"
        aria-atomic="true"
        className="text-xl font-semibold outline-none"
      >
        {currentLabel}
      </h2>
    </div>
  );
}
