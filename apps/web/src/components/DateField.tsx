"use client";

import {
  DatePartsField as DatePartsFieldPrimitive,
  type DatePartsFieldProps as DatePartsFieldPrimitiveProps,
  DatePartsInput as DatePartsInputPrimitive,
  type DatePartsInputProps as DatePartsInputPrimitiveProps,
} from "@repo/ui/components";
import { useLocale, useTranslations } from "next-intl";

/**
 * `@repo/ui` carries no i18n dependency, so the date primitives take their
 * locale and calendar strings as props. These wrappers fill both in from the
 * active request locale — app code should import the date inputs from here
 * rather than straight from `@repo/ui/components`.
 */

type WrapperProps<Props> = Omit<
  Props,
  "calendarLabels" | "calendarTriggerLabel"
>;

export type DatePartsInputProps = WrapperProps<DatePartsInputPrimitiveProps>;
export type DatePartsFieldProps = WrapperProps<DatePartsFieldPrimitiveProps>;

function useDatePickerProps() {
  const locale = useLocale();
  const t = useTranslations("shared.datePicker");

  return {
    calendarLabels: {
      chooseMonthAndYear: t("chooseMonthAndYear"),
      done: t("done"),
      month: t("month"),
      nextMonth: t("nextMonth"),
      previousMonth: t("previousMonth"),
      year: t("year"),
    },
    calendarTriggerLabel: t("open"),
    locale,
  };
}

/** Controlled `DateParts` input with a localized calendar picker. */
export function DatePartsInput(props: DatePartsInputProps) {
  const { calendarLabels, calendarTriggerLabel, locale } = useDatePickerProps();

  return (
    <DatePartsInputPrimitive
      calendarLabels={calendarLabels}
      calendarTriggerLabel={calendarTriggerLabel}
      locale={locale}
      {...props}
    />
  );
}

/** Form-compatible ISO `YYYY-MM-DD` field with a localized calendar picker. */
export function DatePartsField(props: DatePartsFieldProps) {
  const { calendarLabels, calendarTriggerLabel, locale } = useDatePickerProps();

  return (
    <DatePartsFieldPrimitive
      calendarLabels={calendarLabels}
      calendarTriggerLabel={calendarTriggerLabel}
      locale={locale}
      {...props}
    />
  );
}
