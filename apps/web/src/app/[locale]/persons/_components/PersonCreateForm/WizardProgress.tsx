"use client";

import { CheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";

export type PersonWizardStep =
  | "citizenship"
  | "nationalId"
  | "documents"
  | "review";

export function WizardProgress({ step }: { step: PersonWizardStep }) {
  const t = useTranslations("persons");
  const current = step === "citizenship" ? 0 : step === "review" ? 2 : 1;
  return (
    <ol aria-label={t("wizard.progress")} className="grid grid-cols-3 gap-3">
      {(["citizenship", "documents", "review"] as const).map((item, index) => (
        <li
          key={item}
          aria-current={index === current ? "step" : undefined}
          className={`flex items-center gap-2 border-b-2 pb-3 text-sm ${index <= current ? "border-primary text-foreground" : "border-border text-muted-foreground"}`}
        >
          {index < current ? (
            <CheckIcon
              aria-hidden="true"
              className="size-4 shrink-0 text-primary"
            />
          ) : (
            <span aria-hidden="true">{index + 1}</span>
          )}
          <span className={index === current ? "font-medium" : undefined}>
            {t(`wizard.steps.${item}`)}
          </span>
        </li>
      ))}
    </ol>
  );
}
