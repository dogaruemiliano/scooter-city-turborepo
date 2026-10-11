"use client";

import { ApiError } from "@repo/api-shared";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components";
import {
  fieldFromIssue,
  type ScooterFormErrors,
  type ScooterFormField,
  type ScooterFormIssue,
} from "./scooter-form";

export interface Feedback {
  kind: "success" | "error";
  title: string;
  messages: string[];
}

export function FeedbackAlert({ feedback }: { feedback: Feedback }) {
  return (
    <Alert variant={feedback.kind === "error" ? "destructive" : "default"}>
      <AlertTitle>{feedback.title}</AlertTitle>
      <AlertDescription>
        {feedback.messages.length === 1 ? (
          feedback.messages[0]
        ) : (
          <ul className="list-disc pl-4">
            {feedback.messages.map((message, index) => (
              <li key={`${message}-${index}`}>{message}</li>
            ))}
          </ul>
        )}
      </AlertDescription>
    </Alert>
  );
}

export function formErrorsFromIssues(
  issues: readonly ScooterFormIssue[],
  formatIssue: (
    issue: ScooterFormIssue,
    field: ScooterFormField | null,
  ) => string,
): ScooterFormErrors {
  const errors: ScooterFormErrors = {};

  for (const issue of issues) {
    const field = fieldFromIssue(issue);
    if (field && !errors[field]) {
      errors[field] = formatIssue(issue, field);
    }
  }

  return errors;
}

export function scooterFieldConflict(error: unknown): {
  field: Extract<ScooterFormField, "vin" | "registrationNumber">;
  message: string;
} | null {
  if (!(error instanceof ApiError) || error.status !== 409) {
    return null;
  }

  const details = error.details;
  const field =
    details &&
    typeof details === "object" &&
    !Array.isArray(details) &&
    "field" in details
      ? details.field
      : null;

  return field === "vin" || field === "registrationNumber"
    ? { field, message: error.message }
    : null;
}
