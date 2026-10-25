export const REVIEW_STEPS = [
  "personal",
  "address",
  "license",
  "contact",
  "review",
] as const;
export type PersonReviewStep = (typeof REVIEW_STEPS)[number];
export type PersonWizardStep = "citizenship" | "documents" | PersonReviewStep;
export const STEPS = ["citizenship", "documents", ...REVIEW_STEPS] as const;
export type PersonProgressStep = (typeof STEPS)[number];

export function isReviewStep(step: PersonWizardStep): step is PersonReviewStep {
  return REVIEW_STEPS.some((item) => item === step);
}
