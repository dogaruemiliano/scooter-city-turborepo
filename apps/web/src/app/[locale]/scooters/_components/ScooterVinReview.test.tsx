import { messages } from "@repo/i18n";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { ScooterVinReview } from "./ScooterVinReview";

const correct = "LXYTCZP05P0000001";
const misread = "LXYTC2P05P0000001";

describe("VIN conflict review", () => {
  it.each(["en", "ro"] as const)(
    "requires a valid explicit correction and confirmation in %s",
    async (locale) => {
      const onApply = vi.fn();
      const user = userEvent.setup();
      const t = messages[locale].scooters.extraction.vinReview;
      render(
        <NextIntlClientProvider locale={locale} messages={messages[locale]}>
          <ScooterVinReview
            documents={[
              {
                sourceId: "civ",
                fileName: "civ.pdf",
                vin: correct,
                originalVin: correct,
              },
              {
                sourceId: "registration",
                fileName: "registration.pdf",
                vin: misread,
                originalVin: misread,
              },
            ]}
            disabled={false}
            onApply={onApply}
          />
        </NextIntlClientProvider>,
      );
      const apply = screen.getByRole("button", { name: t.apply });
      const confirm = screen.getByRole("checkbox", { name: t.confirm });
      const registration = screen.getByLabelText("registration.pdf");
      expect(registration).toHaveValue(misread);
      await user.click(confirm);
      expect(apply).toBeDisabled();
      fireEvent.change(registration, { target: { value: correct } });
      expect(confirm).not.toBeChecked();
      expect(apply).toBeDisabled();
      await user.click(confirm);
      expect(apply).toBeEnabled();
      await user.click(apply);
      expect(onApply).toHaveBeenCalledExactlyOnceWith([
        { sourceId: "registration", previousVin: misread, vin: correct },
      ]);
      expect(screen.getByLabelText("civ.pdf")).toHaveValue(correct);
      expect(
        screen.getByText(t.original.replace("{vin}", misread)),
      ).toBeInTheDocument();
      fireEvent.change(registration, { target: { value: "invalid" } });
      await user.click(confirm);
      expect(registration).toHaveAttribute("aria-invalid", "true");
      expect(apply).toBeDisabled();
      fireEvent.change(registration, { target: { value: "" } });
      expect(apply).toBeDisabled();
    },
  );
});
