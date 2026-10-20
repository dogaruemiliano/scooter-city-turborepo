import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { FormProvider, useForm } from "react-hook-form";
import { messages } from "@repo/i18n";
import { v1 } from "@repo/api-shared";
import { beforeEach, expect, it, vi } from "vitest";
import { ScooterFleetNumberField } from "./ScooterFleetNumberField";
import {
  scooterEditorDefaults,
  type ScooterEditorValues,
} from "./scooter-editor-schema";

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/lib/api", () => ({ webApi: { fetch: mocks.fetch } }));
const brands = ["HON", "YAM"].map((code) => ({
  id: code,
  code,
  name: code,
  scooterCount: 0,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
}));
function Example() {
  const form = useForm<ScooterEditorValues>({
    defaultValues: { ...scooterEditorDefaults(), brandId: "HON" },
  });
  return (
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <FormProvider {...form}>
        <ScooterFleetNumberField brands={brands} disabled={false} />
        <button onClick={() => form.setValue("brandId", "YAM")}>
          Switch brand
        </button>
      </FormProvider>
    </NextIntlClientProvider>
  );
}
beforeEach(() => mocks.fetch.mockReset().mockResolvedValue({ fleetNumber: 7 }));
it("prefills the number and updates the brand without reserving a number", async () => {
  render(<Example />);
  await waitFor(() =>
    expect(
      screen.getByRole("textbox", { name: "Internal number" }),
    ).toHaveValue("7"),
  );
  expect(screen.getByText("HON")).toBeInTheDocument();
  expect(mocks.fetch).toHaveBeenCalledWith(
    v1.scooters.ROUTES.nextFleetNumber,
    v1.scooters.nextScooterFleetNumberSchema,
    { cache: "no-store" },
  );
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Switch brand" }));
  expect(screen.getByText("YAM")).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Internal number" })).toHaveValue(
    "7",
  );
  expect(mocks.fetch).toHaveBeenCalledOnce();
});
it("keeps the input editable when the suggestion cannot be loaded", async () => {
  mocks.fetch.mockRejectedValueOnce(new Error("Network unavailable"));
  render(<Example />);
  const input = screen.getByRole("textbox", { name: "Internal number" });
  await userEvent.setup().type(input, "42");
  expect(input).toHaveValue("42");
  expect(screen.queryByRole("button", { name: "Change" })).toBeNull();
  expect(
    screen.queryByText(messages.en.scooters.numbering.manualHelp),
  ).toBeNull();
});
it("does not overwrite a user entry when the suggestion arrives later", async () => {
  let resolve!: (value: { fleetNumber: number }) => void;
  mocks.fetch.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    }),
  );
  render(<Example />);
  const input = screen.getByRole("textbox", { name: "Internal number" });
  await userEvent.setup().type(input, "42");
  await act(async () => resolve({ fleetNumber: 7 }));
  await waitFor(() => expect(input).toHaveValue("42"));
});
