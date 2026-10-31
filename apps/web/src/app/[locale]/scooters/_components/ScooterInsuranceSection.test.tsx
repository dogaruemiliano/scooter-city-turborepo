import { v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { FormProvider, useForm } from "react-hook-form";
import { beforeEach, expect, it, vi } from "vitest";
import { ScooterInsuranceSection } from "./ScooterInsuranceSection";
import { scooterEditorDefaults } from "./scooter-editor-schema";
const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/lib/api", () => ({ webApi: { fetch: mocks.fetch } }));
vi.mock("@/components/auth/SessionProvider", () => ({
  useOptionalSession: () => ({ user: { id: "admin" } }),
}));
vi.mock("@/lib/access", () => ({ canAccess: () => true }));
const scooter = {
  id: "s",
  vin: "LXYTCKP05P0000001",
  insurancePolicies: [],
  updatedAt: "2026-10-01T00:00:00.000Z",
} as unknown as v1.scooters.Scooter;
function Harness({
  initialScooter = scooter,
}: {
  initialScooter?: v1.scooters.Scooter;
}) {
  const form = useForm({
    defaultValues: scooterEditorDefaults(initialScooter),
  });
  return (
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <FormProvider {...form}>
        <ScooterInsuranceSection scooter={initialScooter} />
      </FormProvider>
    </NextIntlClientProvider>
  );
}
beforeEach(() => vi.clearAllMocks());
it("starts with one policy, blocks a second blank policy, and allows removing the empty draft", async () => {
  render(<Harness />);
  const browser = userEvent.setup();
  expect(await screen.findAllByLabelText("Insured name")).toHaveLength(1);
  expect(
    screen.queryByRole("button", { name: messages.en.scooters.insurance.add }),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  expect(
    screen.queryByText("Complete the current insurance before adding another"),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Delete insurance" }),
  ).not.toBeInTheDocument();
  await browser.type(screen.getByLabelText("Insured name"), "Fleet SRL");
  await browser.click(
    screen.getByRole("button", { name: messages.en.scooters.insurance.add }),
  );
  expect(screen.getAllByLabelText("Insured name")).toHaveLength(2);
  expect(
    screen.queryByRole("button", { name: messages.en.scooters.insurance.add }),
  ).not.toBeInTheDocument();
  await browser.click(
    screen.getAllByRole("button", { name: "Delete insurance" })[1]!,
  );
  expect(screen.getAllByLabelText("Insured name")).toHaveLength(1);
  expect(
    screen.queryByRole("button", { name: "Delete insurance" }),
  ).not.toBeInTheDocument();
});
it("uses the scooter save instead of its own save action", async () => {
  render(<Harness />);
  const browser = userEvent.setup();
  await browser.type(screen.getByLabelText("Insured name"), "Fleet SRL");
  expect(
    screen.queryByRole("button", { name: "Save insurance" }),
  ).not.toBeInTheDocument();
  expect(mocks.fetch).not.toHaveBeenCalled();
});
it("stages deleting a saved policy without an HTTP request and keeps the last row", async () => {
  const base = {
    insuredName: "Fleet",
    validFrom: "2026-01-01",
    validUntil: "2027-01-01",
    premiumAmount: null,
    currency: "RON",
    documentVin: null,
    vinReviewConfirmed: false,
    createdAt: scooter.updatedAt,
    updatedAt: scooter.updatedAt,
  };
  render(
    <Harness
      initialScooter={{
        ...scooter,
        insurancePolicies: [
          { ...base, id: "first" },
          { ...base, id: "second" },
        ],
      }}
    />,
  );
  const browser = userEvent.setup();
  await browser.click(
    screen.getAllByRole("button", { name: "Delete insurance" })[0]!,
  );
  expect(screen.getAllByLabelText("Insured name")).toHaveLength(1);
  expect(
    screen.queryByRole("button", { name: "Delete insurance" }),
  ).not.toBeInTheDocument();
  expect(mocks.fetch).not.toHaveBeenCalled();
});
