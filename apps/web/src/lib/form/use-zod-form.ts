"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import {
  useForm,
  type FieldErrors,
  type FieldValues,
  type Resolver,
  type UseFormProps,
  type UseFormReturn,
} from "react-hook-form";

import {
  labelPath,
  localizeIssue,
  localizeSchemaMessage,
  type ValidationIssue,
  type ValidationMessageContext,
} from "./messages";

type ZodLikeSchema = Parameters<typeof zodResolver>[0];

export interface UseZodFormOptions<
  Values extends FieldValues,
  Transformed extends FieldValues | undefined = undefined,
> extends Omit<UseFormProps<Values, unknown, Transformed>, "resolver"> {
  /**
   * Label for a field path with array indices already stripped, e.g.
   * `documents.cnp`. Usually ``(path) => t(`fields.${path}`)``.
   */
  labelFor: (path: string) => string;
  messageOverride?: ValidationMessageContext["messageOverride"];
}

/**
 * `useForm` wired to a zod schema with localized messages.
 *
 * Validation timing is the app-wide contract: a field is first validated when
 * it loses focus after being edited (`onTouched`), then re-validated on every
 * change while it has an error (`reValidateMode`). Both can be overridden per
 * form, but prefer not to — consistency is the point.
 */
export function useZodForm<
  Values extends FieldValues,
  Transformed extends FieldValues | undefined = undefined,
>(
  schema: ZodLikeSchema,
  {
    labelFor,
    messageOverride,
    ...formProps
  }: UseZodFormOptions<Values, Transformed>,
): UseFormReturn<Values, unknown, Transformed> {
  const t = useTranslations("shared.validation");

  const resolver = useMemo<Resolver<Values, unknown, Transformed>>(() => {
    const context: ValidationMessageContext = {
      labelFor: (path) => labelFor(labelPath(path)),
      messageOverride,
      t: (key, values) => t(key, values),
    };

    // Rule-driven issues are localized inside zod, where the issue still
    // carries its `minimum`/`maximum`.
    const resolve = zodResolver(schema, {
      error: (issue) => localizeIssue(issue as ValidationIssue, context),
    }) as Resolver<Values, unknown, Transformed>;

    // Messages written on the schema bypass that map, so translate them here.
    const localizingResolver: Resolver<Values, unknown, Transformed> = async (
      values,
      resolverContext,
      options,
    ) => {
      const result = await resolve(values, resolverContext, options);

      if (!result.errors || Object.keys(result.errors).length === 0) {
        return result;
      }

      result.errors = localizeErrors(
        result.errors,
        context,
      ) as typeof result.errors;

      return result;
    };

    return localizingResolver;
  }, [labelFor, messageOverride, schema, t]);

  return useForm<Values, unknown, Transformed>({
    mode: "onTouched",
    reValidateMode: "onChange",
    resolver,
    ...formProps,
  });
}

/** Walks the react-hook-form error tree, translating schema-authored text. */
function localizeErrors(
  errors: FieldErrors,
  context: ValidationMessageContext,
  path: PropertyKey[] = [],
): FieldErrors {
  const localized: Record<string, unknown> = Array.isArray(errors)
    ? ([] as unknown as Record<string, unknown>)
    : {};

  for (const [key, value] of Object.entries(errors)) {
    if (!value || typeof value !== "object") {
      localized[key] = value;
      continue;
    }

    const nodePath = [...path, key];
    const node = value as { message?: unknown; type?: unknown };

    if (typeof node.message === "string") {
      const message = localizeSchemaMessage(
        {
          code: typeof node.type === "string" ? node.type : undefined,
          message: node.message,
          path: nodePath,
        },
        context,
      );

      localized[key] = message ? { ...node, message } : node;
      continue;
    }

    localized[key] = localizeErrors(value as FieldErrors, context, nodePath);
  }

  return localized as FieldErrors;
}
