import { Button } from "@repo/ui/components/button";
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

it("uses variant-specific glows and neutral disabled glows", () => {
  render(
    <>
      <Button>Primary</Button>
      <Button disabled>Disabled primary</Button>
      <Button variant="warning">Warning</Button>
      <Button variant="warning" disabled>
        Disabled warning
      </Button>
      <Button variant="secondary">Secondary</Button>
    </>,
  );
  expect(screen.getByRole("button", { name: "Primary" })).toHaveClass(
    "shadow-primary",
  );
  expect(screen.getByRole("button", { name: "Warning" })).toHaveClass(
    "shadow-warning",
  );
  for (const label of ["Warning", "Disabled warning", "Secondary"]) {
    expect(screen.getByRole("button", { name: label })).not.toHaveClass(
      "shadow-primary",
    );
  }
  for (const label of ["Disabled primary", "Disabled warning"]) {
    expect(screen.getByRole("button", { name: label })).toBeDisabled();
    expect(screen.getByRole("button", { name: label })).toHaveClass(
      "disabled:shadow-disabled",
    );
  }
});
