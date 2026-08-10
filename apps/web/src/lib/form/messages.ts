import { v1 } from "@repo/api-shared";

/**
 * Structural view of a zod issue. Declared locally so this module stays
 * independent of the zod version the schemas happen to be built with.
 */
export interface ValidationIssue {
  code?: string;
  path: PropertyKey[];
  message: string;
  maximum?: number | bigint;
  minimum?: number | bigint;
  origin?: string;
}

export type ValidationTranslator = (
  key: string,
  values?: Record<string, string | number>,
) => string;

export interface ValidationMessageContext {
  /** Human label for a field path, e.g. `documents.0.cnp` -> "CNP". */
  labelFor: (path: string) => string;
  /** Translator bound to the `shared.validation` namespace. */
  t: ValidationTranslator;
  /**
   * Domain-specific message for an issue the shared table cannot name, such as
   * an invalid CNP or VIN. Returning `undefined` falls back to the shared table.
   */
  messageOverride?: (
    issue: ValidationIssue,
    path: string,
  ) => string | undefined;
}

/**
 * Field path as a dot-joined string. Mirrors the key react-hook-form uses, so
 * it doubles as the lookup key for labels and for `setError`.
 */
export function issuePath(path: PropertyKey[]): string {
  return path.map((segment) => String(segment)).join(".");
}

/** Path with array indices dropped: `documents.0.cnp` -> `documents.cnp`. */
export function labelPath(path: string): string {
  return path
    .split(".")
    .filter((segment) => !/^\d+$/.test(segment))
    .join(".");
}

/**
 * Localizes an issue raised by a zod *rule* — a type, length or format check.
 *
 * Called from the parse-level error map, where the issue still carries its
 * `minimum`/`maximum`. Messages written by hand on the schema
 * (`.refine({ message })`) never reach this map — zod gives schema-level text
 * precedence — so those go through {@link localizeSchemaMessage} instead.
 */
export function localizeIssue(
  issue: ValidationIssue,
  { labelFor, messageOverride, t }: ValidationMessageContext,
): string {
  const path = issuePath(issue.path);
  const override = messageOverride?.(issue, path);
  if (override) return override;

  const field = labelFor(path);

  if (issue.code === "invalid_type") {
    return t("required", { field });
  }

  if (issue.code === "too_small" && issue.minimum !== undefined) {
    const min = Number(issue.minimum);
    return min <= 1 ? t("required", { field }) : t("minLength", { field, min });
  }

  if (issue.code === "too_big" && issue.maximum !== undefined) {
    return t("maxLength", { field, max: Number(issue.maximum) });
  }

  if (issue.code === "invalid_format" || issue.code === "custom") {
    return t("invalid", { field });
  }

  return t("fallback");
}

/**
 * Localizes a message authored on the schema itself, matched by the sentinel
 * constants `@repo/api-shared` exports for exactly this purpose.
 *
 * Runs after the resolver, over messages the error map never saw. Returns
 * `undefined` when the message is not a known sentinel, leaving it untouched —
 * which also keeps already-localized messages from being mapped twice.
 */
export function localizeSchemaMessage(
  issue: ValidationIssue,
  { labelFor, messageOverride, t }: ValidationMessageContext,
): string | undefined {
  const path = issuePath(issue.path);
  const override = messageOverride?.(issue, path);
  if (override) return override;

  if (issue.message === v1.common.FUTURE_DATE_MESSAGE) {
    return t("futureDate", { field: labelFor(path) });
  }

  return undefined;
}
