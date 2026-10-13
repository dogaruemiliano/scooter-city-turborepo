import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormProvider, useForm } from "react-hook-form";
import { afterEach, expect, it } from "vitest";
import { FormBooleanRow } from "./FormBooleanRow";

afterEach(cleanup);
function Harness({
  value = "",
  disabled = false,
}: {
  value?: string;
  disabled?: boolean;
}) {
  const form = useForm<{ check: string }>({ defaultValues: { check: value } });
  return (
    <FormProvider {...form}>
      <FormBooleanRow<{ check: string }>
        name="check"
        label="Vitezometru"
        falseLabel="Defect"
        trueLabel="Funcțional"
        disabled={disabled}
      />
    </FormProvider>
  );
}

it("preserves existing answers, marks the selection, and clears a repeated selection", async () => {
  const browser = userEvent.setup();
  render(<Harness value="true" />);
  const group = within(screen.getByRole("radiogroup", { name: "Vitezometru" }));
  const yes = group.getByRole("radio", { name: /Funcțional$/ });
  expect(yes).toBeChecked();
  expect(yes.parentElement?.querySelector("svg")).not.toHaveClass("invisible");
  await browser.click(yes);
  expect(
    group
      .getAllByRole("radio")
      .some((radio) => (radio as HTMLInputElement).checked),
  ).toBe(false);
  await browser.click(group.getByRole("radio", { name: /Defect$/ }));
  expect(group.getByRole("radio", { name: /Defect$/ })).toBeChecked();
});

it("starts unverified and supports keyboard selection and clearing", async () => {
  const browser = userEvent.setup();
  render(<Harness />);
  const radios = screen.getAllByRole("radio");
  expect(radios.every((radio) => !(radio as HTMLInputElement).checked)).toBe(
    true,
  );
  await browser.tab();
  await browser.keyboard(" ");
  expect(screen.getByRole("radio", { name: /Defect$/ })).toBeChecked();
  await browser.keyboard("{ArrowRight}");
  expect(screen.getByRole("radio", { name: /Funcțional$/ })).toBeChecked();
  await browser.keyboard(" ");
  expect(radios.every((radio) => !(radio as HTMLInputElement).checked)).toBe(
    true,
  );
});

it("keeps disabled answers unchanged", async () => {
  const browser = userEvent.setup();
  render(<Harness value="false" disabled />);
  await browser.click(screen.getByRole("radio", { name: /Funcțional$/ }));
  expect(screen.getByRole("radio", { name: /Defect$/ })).toBeChecked();
});
