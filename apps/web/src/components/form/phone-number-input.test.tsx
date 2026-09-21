import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PhoneNumberInput } from "@repo/ui/components/phone-number-input";

describe("PhoneNumberInput", () => {
  it.each(["0749096855", "0749 096 855", "+40 749 096 855", "749096855"])(
    "formats pasted %s while submitting only the international digits",
    async (pastedValue) => {
      const user = userEvent.setup();
      const onValueChange = vi.fn();
      const { container } = render(
        <form>
          <PhoneNumberInput name="phone" onValueChange={onValueChange} />
        </form>,
      );

      await user.click(screen.getByRole("textbox"));
      await user.paste(pastedValue);

      expect(screen.getByRole("textbox")).toHaveValue("749 096 855");
      expect(onValueChange).toHaveBeenLastCalledWith("+40749096855", {
        country: "RO",
        countryCallingCode: "40",
        nationalNumber: "749096855",
      });
      expect(new FormData(container.querySelector("form")!).get("phone")).toBe(
        "+40749096855",
      );
    },
  );

  it("groups digits during controlled typing and clears the value", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    function ControlledInput() {
      const [value, setValue] = useState("");
      return (
        <PhoneNumberInput
          value={value}
          onValueChange={(nextValue, details) => {
            setValue(nextValue);
            onValueChange(nextValue, details);
          }}
        />
      );
    }
    render(<ControlledInput />);

    await user.type(screen.getByRole("textbox"), "0749096855");
    expect(screen.getByRole("textbox")).toHaveValue("749 096 855");
    expect(onValueChange).toHaveBeenLastCalledWith(
      "+40749096855",
      expect.objectContaining({ nationalNumber: "749096855" }),
    );

    await user.clear(screen.getByRole("textbox"));
    expect(screen.getByRole("textbox")).toHaveValue("");
    expect(onValueChange).toHaveBeenLastCalledWith(
      "",
      expect.objectContaining({ nationalNumber: "" }),
    );
  });

  it("formats initial and externally updated values", () => {
    const { rerender } = render(<PhoneNumberInput value="0749096855" />);
    expect(screen.getByRole("textbox")).toHaveValue("749 096 855");

    rerender(<PhoneNumberInput value="+40211234567" />);
    expect(screen.getByRole("textbox")).toHaveValue("211 234 567");
  });

  it("preserves leading zeros for other selected countries", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<PhoneNumberInput defaultCountry="IT" onValueChange={onValueChange} />);

    await user.click(screen.getByRole("textbox"));
    await user.paste("0669820000");

    expect(screen.getByRole("textbox")).toHaveValue("066 982 000 0");
    expect(onValueChange).toHaveBeenLastCalledWith(
      "+390669820000",
      expect.objectContaining({ nationalNumber: "0669820000" }),
    );
  });

  it("keeps the cursor beside digits inserted in the middle", async () => {
    const user = userEvent.setup();
    render(<PhoneNumberInput defaultValue="+40749096855" />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    await user.click(input);
    input.setSelectionRange(5, 5);

    await user.keyboard("2");

    expect(input).toHaveValue("749 029 685 5");
    expect(input.selectionStart).toBe(6);
    await user.keyboard("{Backspace}");
    expect(input).toHaveValue("749 096 855");
    expect(input.selectionStart).toBe(5);
  });

  it.each([
    [4, "{Backspace}", "740 968 55", 2],
    [3, "{Delete}", "749 968 55", 3],
  ] as const)(
    "deletes across a separator at cursor position %s",
    async (position, key, expected, expectedCursor) => {
      const user = userEvent.setup();
      render(<PhoneNumberInput defaultValue="+40749096855" />);
      const input = screen.getByRole("textbox") as HTMLInputElement;
      await user.click(input);
      input.setSelectionRange(position, position);

      await user.keyboard(key);

      expect(input).toHaveValue(expected);
      expect(input.selectionStart).toBe(expectedCursor);
    },
  );
});
