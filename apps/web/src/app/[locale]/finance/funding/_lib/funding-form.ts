import { v1 } from "@repo/api-shared";
import { z } from "zod";

import {
  dateToIsoTimestamp,
  safeMinor,
} from "../../expenses/_lib/expense-form";

const amountSchema = z
  .string()
  .trim()
  .min(1)
  .superRefine((value, ctx) => {
    const amount = safeMinor(value);
    if (amount === undefined) {
      ctx.addIssue({ code: "custom", message: "finance.invalidAmount" });
    } else if (amount <= 0) {
      ctx.addIssue({ code: "custom", message: "finance.amountMustBePositive" });
    }
  });

export const fundingFormSchema = z.object({
  amount: amountSchema,
  destinationAccountId: z.string().trim().min(1),
  associateId: z.string().trim().min(1),
  occurredAt: z.string().trim().min(1),
  type: z.enum(v1.finance.ASSOCIATE_FUNDING_TYPES),
  reference: z.string().trim().max(160),
  notes: z.string().trim().max(2_000),
});

export type FundingFormValues = z.infer<typeof fundingFormSchema>;

export function fundingFormDefaults(input: {
  associateId: string;
  destinationAccountId: string;
  today: string;
}): FundingFormValues {
  return {
    amount: "",
    destinationAccountId: input.destinationAccountId,
    associateId: input.associateId,
    occurredAt: input.today,
    type: "LOAN",
    reference: "",
    notes: "",
  };
}

export function toFundingInput(
  bookId: string,
  values: FundingFormValues,
): v1.finance.PreviewAssociateFundingInput {
  return {
    bookId,
    occurredAt: dateToIsoTimestamp(values.occurredAt),
    amountMinor: v1.finance.parseMajorToMinor(values.amount),
    type: values.type,
    associateId: values.associateId,
    destinationAccountId: values.destinationAccountId,
    ...(values.reference ? { reference: values.reference } : {}),
    ...(values.notes ? { notes: values.notes } : {}),
  };
}

export function todayLocalDateOnly(now = new Date()): string {
  const offsetMs = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}
