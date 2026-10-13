import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { FormProvider } from "react-hook-form";
import { messages } from "@repo/i18n";
import { z } from "zod";
import { describe, expect, it } from "vitest";
import { useZodForm } from "@/lib/form/use-zod-form";
import { FormField } from "./FormField";
import {
  FormInput,
  FormDecimalInput,
  FormTextarea,
  FormSelect,
  FormCountrySelect,
} from "./controls";

const schema = z.object({ value: z.string().min(2, "Too short") });
type Control =
  | "text"
  | "normalized"
  | "decimal"
  | "textarea"
  | "select"
  | "country";
function Fixture({ kind }: { kind: Control }) {
  const form = useZodForm(schema, {
    defaultValues: { value: "" },
    labelFor: () => "Value",
  });
  return (
    <FormProvider {...form}>
      <FormField name="value" label="Value" required>
        {kind === "text" ? (
          <FormInput />
        ) : kind === "normalized" ? (
          <FormInput normalize={(value) => value.toUpperCase()} />
        ) : kind === "decimal" ? (
          <FormDecimalInput locale="en" />
        ) : kind === "textarea" ? (
          <FormTextarea />
        ) : kind === "select" ? (
          <FormSelect
            placeholder="Choose"
            options={[
              { value: "1", label: "Invalid" },
              { value: "12", label: "Valid" },
            ]}
          />
        ) : (
          <FormCountrySelect label="Value" placeholder="Choose" locale="en" />
        )}
      </FormField>
      <button type="button">Next</button>
    </FormProvider>
  );
}
function mount(kind: Control) {
  render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <Fixture kind={kind} />
    </NextIntlClientProvider>,
  );
}

describe("shared validation timing", () => {
  it.each(["text", "normalized", "decimal", "textarea"] as const)(
    "revalidates %s on change after first blur, even after clearing an error",
    async (kind) => {
      const browser = userEvent.setup();
      mount(kind);
      const input = screen.getByRole("textbox", { name: "Value" });
      await browser.type(input, "1");
      expect(input).not.toHaveAttribute("aria-invalid", "true");
      await browser.tab();
      await waitFor(() =>
        expect(input).toHaveAttribute("aria-invalid", "true"),
      );
      await browser.type(input, "2");
      await waitFor(() =>
        expect(input).not.toHaveAttribute("aria-invalid", "true"),
      );
      expect(input).toHaveFocus();
      await browser.clear(input);
      await waitFor(() =>
        expect(input).toHaveAttribute("aria-invalid", "true"),
      );
      expect(input).toHaveFocus();
    },
  );
  it.each(["select", "country"] as const)(
    "marks %s as touched when it loses focus without a selection",
    async (kind) => {
      const browser = userEvent.setup();
      mount(kind);
      await browser.tab();
      const trigger = document.activeElement!;
      expect(trigger).not.toHaveAttribute("aria-invalid", "true");
      await browser.tab();
      await waitFor(() =>
        expect(trigger).toHaveAttribute("aria-invalid", "true"),
      );
    },
  );
});
