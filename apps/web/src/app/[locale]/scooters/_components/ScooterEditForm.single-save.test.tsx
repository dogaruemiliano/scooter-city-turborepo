import { mocks, renderEditForm, scooter } from "./ScooterEditForm.test-helpers";
import { v1 } from "@repo/api-shared";
import { screen, within, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
it("saves ITP and insurance with the main scooter action only", async () => {
  mocks.apiFetch.mockResolvedValue(scooter);
  renderEditForm();
  const browser = userEvent.setup();
  expect(
    screen.queryByRole("button", { name: "Save ITP date" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Save insurance" }),
  ).not.toBeInTheDocument();
  await browser.type(screen.getByLabelText("Insured name"), "Fleet SRL");
  const section = screen
    .getByRole("heading", { name: /Technical inspections/ })
    .closest("section")!;
  fireEvent.change(
    within(section).getByRole("textbox", { name: "Valid until" }),
    { target: { value: "01" } },
  );
  fireEvent.change(
    within(section).getByRole("textbox", {
      name: "Valid until MM",
    }),
    { target: { value: "01" } },
  );
  const year = within(section).getByRole("textbox", {
    name: "Valid until YYYY",
  });
  fireEvent.change(year, { target: { value: "2028" } });
  fireEvent.blur(year);
  expect(mocks.apiFetch).not.toHaveBeenCalled();
  await browser.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() =>
    expect(mocks.apiFetch).toHaveBeenCalledWith(
      v1.scooters.ROUTES.update(scooter.id),
      v1.scooters.scooterSchema,
      expect.objectContaining({
        json: expect.objectContaining({
          itpValidUntil: "2028-01-01",
          insurancePolicies: [
            expect.objectContaining({ insuredName: "Fleet SRL" }),
          ],
        }),
      }),
    ),
  );
  expect(mocks.apiFetch).toHaveBeenCalledOnce();
});
