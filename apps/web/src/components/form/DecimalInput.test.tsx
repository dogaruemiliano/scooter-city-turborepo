import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, it, expect } from "vitest";
import { DecimalInput } from "@repo/ui/components/decimal-input";
import { NormalizedInput } from "@repo/ui/components/normalized-input";
import { parseDecimalInput } from "@repo/ui/lib/decimal";

function DecimalExample({ locale = "ro" }) {
  const [value, setValue] = useState("");
  return (
    <>
      <DecimalInput
        aria-label="Power"
        locale={locale}
        value={value}
        onValueChange={setValue}
      />
      <output>{value}</output>
    </>
  );
}

describe("shared decimal input", () => {
  it("accepts both separators, preserves a trailing separator and precision", async () => {
    const user = userEvent.setup();
    render(<DecimalExample />);
    const input = screen.getByLabelText("Power");
    await user.type(input, "8.");
    expect(input).toHaveValue("8,");
    await user.type(input, "01230");
    expect(input).toHaveValue("8,01230");
    expect(screen.getByRole("status")).toHaveTextContent("8,01230");
    await user.clear(input);
    await user.paste("0.075");
    expect(input).toHaveValue("0,075");
    await user.clear(input);
    expect(input).toHaveValue("");
    expect(parseDecimalInput("")).toBeNull();
  });
  it("uses a dot for English, accepts a pasted comma and preserves the caret", async () => {
    const user = userEvent.setup();
    render(<DecimalExample locale="en" />);
    const input = screen.getByLabelText("Power") as HTMLInputElement;
    await user.click(input);
    await user.paste("8,50");
    expect(input).toHaveValue("8.50");
    input.setSelectionRange(1, 2);
    await user.keyboard(",");
    expect(input).toHaveValue("8.50");
    expect(input.selectionStart).toBe(2);
  });
  it.each(["1,234.56", "1.2.3", "1e2", "Infinity", "1 000"])(
    "rejects ambiguous input %s",
    (value) => {
      expect(Number.isNaN(parseDecimalInput(value))).toBe(true);
    },
  );
  it("normalizes pasted and typed identifier values", async () => {
    function Example() {
      const [value, setValue] = useState("");
      return (
        <NormalizedInput
          aria-label="Registry"
          normalize={(v) => v.toUpperCase()}
          value={value}
          onValueChange={setValue}
        />
      );
    }
    const user = userEvent.setup();
    render(<Example />);
    const input = screen.getByLabelText("Registry");
    await user.type(input, "ab");
    await user.paste("-001/c");
    expect(input).toHaveValue("AB-001/C");
  });
  it("does not uppercase an IME composition until it completes", () => {
    function Example() {
      const [value, setValue] = useState("");
      return (
        <NormalizedInput
          aria-label="Registry"
          normalize={(v) => v.toUpperCase()}
          value={value}
          onValueChange={setValue}
        />
      );
    }
    render(<Example />);
    const input = screen.getByLabelText("Registry");
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "ab" } });
    expect(input).toHaveValue("ab");
    fireEvent.compositionEnd(input);
    expect(input).toHaveValue("AB");
  });
});
