import { render, screen } from "@testing-library/react";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { FormField, FormFieldWarningsContext } from "./FormField";
import { FormInput } from "./controls";

function Fixture({ invalid = false }: { invalid?: boolean }) {
  const form = useForm({
    defaultValues: { code: "" },
    errors: invalid
      ? { code: { type: "required", message: "Code is required" } }
      : {},
  });
  return (
    <FormProvider {...form}>
      <FormFieldWarningsContext value={{ code: "Check the document" }}>
        <FormField name="code" label="Code">
          <FormInput />
        </FormField>
      </FormFieldWarningsContext>
    </FormProvider>
  );
}

describe("FormField review warnings", () => {
  it("announces a warning without marking the value invalid", () => {
    const { container } = render(<Fixture />);
    expect(container.querySelector('[data-field-name="code"]')).toHaveAttribute(
      "data-warning",
      "true",
    );
    expect(screen.getByLabelText("Code")).toHaveAccessibleDescription(
      "Check the document",
    );
    expect(screen.getByLabelText("Code")).not.toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });
  it("gives blocking validation errors precedence over review warnings", () => {
    const { container } = render(<Fixture invalid />);
    expect(
      container.querySelector('[data-field-name="code"]'),
    ).not.toHaveAttribute("data-warning");
    expect(screen.getByLabelText("Code")).toHaveAccessibleDescription(
      "Code is required",
    );
    expect(screen.getByLabelText("Code")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });
});
