import {
  PERSON_DOCUMENT_FORM_FIELD_KEYS,
  PERSON_FORM_FIELD_KEYS,
} from "./constants";
import type {
  CreatePersonFormState,
  FormErrorKey,
  FormErrors,
  FormValidationIssue,
  PersonDocumentFormFieldKey,
  PersonFormFieldKey,
} from "./types";

export function formErrorsFromIssues(
  issues: FormValidationIssue[],
  form: CreatePersonFormState,
  formatIssue: (
    issue: FormValidationIssue,
    field: FormErrorKey | null,
  ) => string,
): FormErrors {
  const errors: FormErrors = {};

  for (const issue of issues) {
    const field = formErrorKeyFromPath(issue.path, form);

    if (field && !errors[field]) {
      errors[field] = formatIssue(issue, field);
    }
  }

  return errors;
}

export function formErrorKeyFromPath(
  path: readonly PropertyKey[],
  form: CreatePersonFormState,
): FormErrorKey | null {
  const [field, index, documentField] = path;

  if (field === "documents") {
    if (typeof index === "number") {
      const document = form.documents[index];

      if (!document) {
        return "documents";
      }

      if (
        typeof documentField === "string" &&
        isPersonDocumentFormFieldKey(documentField)
      ) {
        return documentFieldErrorKey(document.key, documentField);
      }
    }

    return "documents";
  }

  return typeof field === "string" && isPersonFormFieldKey(field)
    ? field
    : null;
}

export function documentFieldErrorKey(
  documentKey: string,
  field: PersonDocumentFormFieldKey,
): `document.${string}.${PersonDocumentFormFieldKey}` {
  return `document.${documentKey}.${field}`;
}

export function isDocumentFieldErrorKey(
  field: FormErrorKey | null,
  expectedField: PersonDocumentFormFieldKey,
): boolean {
  return documentFieldFromErrorKey(field)?.field === expectedField;
}

export function documentFieldFromErrorKey(
  field: FormErrorKey | null,
): { documentKey: string; field: PersonDocumentFormFieldKey } | null {
  if (!field || !field.startsWith("document.")) {
    return null;
  }

  const [, documentKey, documentField] = field.split(".");
  if (!documentKey || !documentField) {
    return null;
  }

  return isPersonDocumentFormFieldKey(documentField)
    ? { documentKey, field: documentField }
    : null;
}

export function isBlankField(
  field: FormErrorKey,
  form: CreatePersonFormState,
): boolean {
  const documentField = documentFieldFromErrorKey(field);
  if (documentField) {
    const document = form.documents.find(
      (item) => item.key === documentField.documentKey,
    );
    const value = document?.[documentField.field];

    return typeof value === "string" && value.trim().length === 0;
  }

  if (!isPersonFormFieldKey(field)) {
    return false;
  }

  const value = form[field];
  return typeof value === "string" && value.trim().length === 0;
}

export function fieldErrorId(
  id: string,
  error: string | undefined,
): string | undefined {
  return error ? `${id}-error` : undefined;
}

export function invalidAria(
  invalid: string | boolean | undefined,
): true | undefined {
  return invalid ? true : undefined;
}

export function isPersonFormFieldKey(
  value: string,
): value is PersonFormFieldKey {
  return PERSON_FORM_FIELD_KEYS.has(value as PersonFormFieldKey);
}

export function isPersonDocumentFormFieldKey(
  value: string,
): value is PersonDocumentFormFieldKey {
  return PERSON_DOCUMENT_FORM_FIELD_KEYS.has(
    value as PersonDocumentFormFieldKey,
  );
}
