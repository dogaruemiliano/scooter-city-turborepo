import { render, screen } from "@testing-library/react";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";

import { FormField } from "./FormField";
import { FormSelect } from "./controls";

function SelectFixture({
  optional = false,
  value = "",
}: {
  optional?: boolean;
  value?: string;
}) {
  const form = useForm({ defaultValues: { category: value } });

  return (
    <FormProvider {...form}>
      <FormField name="category" label="Category" required={!optional}>
        <FormSelect
          placeholder="Select a category"
          options={[{ value: "fuel", label: "Fuel" }]}
          {...(optional ? { emptyOption: { label: "None" } } : {})}
        />
      </FormField>
    </FormProvider>
  );
}

describe("FormSelect", () => {
  it("shows the option label for a selected value before opening the dropdown", () => {
    render(<SelectFixture value="fuel" />);
    expect(
      screen.getByRole("combobox", { name: /category/i }),
    ).toHaveTextContent("Fuel");
  });

  it("shows a placeholder instead of the internal empty-value sentinel", () => {
    render(<SelectFixture />);

    const select = screen.getByRole("combobox", { name: /category/i });
    expect(select).toHaveTextContent("Select a category");
    expect(select).not.toHaveTextContent("__none__");
  });

  it("keeps an explicit empty choice visible for optional fields", () => {
    render(<SelectFixture optional />);

    expect(
      screen.getByRole("combobox", { name: /category/i }),
    ).toHaveTextContent("None");
  });
});
