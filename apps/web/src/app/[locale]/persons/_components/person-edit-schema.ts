import { v1 } from "@repo/api-shared";
import { z } from "zod";

import { blankToNull } from "./PersonDetailPage/helpers";
import type { PersonFormState } from "./PersonDetailPage/types";

/** Catalog key under `persons.fields` for each form value. */
const FIELD_LABEL_KEYS: Record<keyof PersonFormState, string> = {
  addressLine1: "addressLine1",
  addressLine2: "addressLine2",
  city: "city",
  countryCode: "country",
  dateOfBirth: "dateOfBirth",
  email: "email",
  firstName: "firstName",
  lastName: "lastName",
  notes: "notes",
  phone: "phone",
  postalCode: "postalCode",
  region: "region",
};

export function personFieldLabelKey(path: string): string {
  return FIELD_LABEL_KEYS[path as keyof PersonFormState] ?? path;
}

const personEditValuesSchema = z.object({
  addressLine1: z.string(),
  addressLine2: z.string(),
  city: z.string(),
  countryCode: z.string(),
  dateOfBirth: z.string(),
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  notes: z.string(),
  phone: z.string(),
  postalCode: z.string(),
  region: z.string(),
});

/**
 * The edit form's text inputs piped into the shared update schema, so the API
 * contract stays the single source of truth for what a valid person is.
 *
 * Inputs always hold strings, so blanks become `null` for the nullable columns
 * before validation — a blank required field stays a blank string, and the
 * schema reports it as missing rather than silently dropping it.
 */
export const personEditFormSchema = personEditValuesSchema
  .transform(
    (form): z.input<typeof v1.persons.updatePersonInputSchema> => ({
      email: form.email,
      phone: form.phone,
      firstName: form.firstName,
      lastName: form.lastName,
      dateOfBirth: blankToNull(form.dateOfBirth),
      addressLine1: blankToNull(form.addressLine1),
      addressLine2: blankToNull(form.addressLine2),
      city: blankToNull(form.city),
      region: blankToNull(form.region),
      postalCode: blankToNull(form.postalCode),
      countryCode: blankToNull(form.countryCode),
      notes: blankToNull(form.notes),
    }),
  )
  .pipe(v1.persons.updatePersonInputSchema);
