import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { messages } from "@repo/i18n";
import { ApiError, v1 } from "@repo/api-shared";
import { beforeEach, expect, it, vi } from "vitest";
import { RentalCheckout } from "./RentalCheckout";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  scopes: { "rentals.read": ["ALL"], "rentals.handover": ["ALL"] } as Record<
    string,
    string[]
  >,
}));
vi.mock("@/lib/api", () => ({
  webApi: { fetch: mocks.fetch, url: (path: string) => path },
}));
vi.mock("@/components/auth/SessionProvider", () => ({
  useSession: () => ({ user: { id: "staff", effectiveScopes: mocks.scopes } }),
}));
const at = "2026-10-30T12:00:00.000Z";
const equipment = { presence: "unknown", condition: "not_checked" } as const;
const inspection: v1.rentals.RentalInspectionData = {
  schemaVersion: 1,
  odometerDisplayedKm: 120,
  odometer: "not_checked",
  speedometer: "not_checked",
  brakes: "not_checked",
  tyres: "not_checked",
  lights: "not_checked",
  horn: "not_checked",
  mirrors: "not_checked",
  phoneStand: equipment,
  chargingOutlet: equipment,
  helmetCount: 0,
  keysCount: 0,
  fuelPercent: null,
  observedSpeedKmh: null,
  speedVerificationMethod: null,
  limiterCheck: "not_checked",
  operatorSpeedConfirmed: false,
  cosmeticNotes: "",
  mediaIds: [],
  criticalDefect: null,
  additionalChecks: {
    engine: "not_checked",
    electricStart: "not_checked",
    kickstart: "not_checked",
    batteryCharge: "not_checked",
    frontTyre: "not_checked",
    rearTyre: "not_checked",
    headlight: "not_checked",
    indicators: "not_checked",
    brakeLight: "not_checked",
    helmet: "not_checked",
    keys: "not_checked",
  },
  additionalEquipment: {
    topCase: equipment,
    luggageRack: equipment,
    antitheft: equipment,
  },
  technicalNotes: "",
  equipmentNotes: "",
};
const rental = v1.rentals.rentalSchema.parse({
  id: "rental",
  personId: "person",
  scooterId: "scooter",
  scooter: {
    id: "scooter",
    fleetNumber: 7,
    model: "Vision",
    brandName: "Honda",
    brandCode: "HON",
    registrationNumber: "B123",
  },
  person: { id: "person", firstName: "Ada", lastName: "Lovelace" },
  startsAt: at,
  endsAt: "2026-11-06T12:00:00.000Z",
  status: "reserved",
  customerNotes: null,
  internalNotes: null,
  revision: 1,
  handedOverAt: null,
  returnedAt: null,
  createdAt: at,
  workflowVersion: 1,
  terms: v1.rentals.calculateRentalTerms("without_license"),
});
const checkout = () => ({
  rental,
  inspection: null,
  prefill: inspection,
  expectedScooterUpdatedAt: at,
  lastKnownMileageKm: 120,
  payments: [],
  issues: [],
  handoverRecipients: [
    { personId: "driver", firstName: "Grace", lastName: "Hopper" },
  ],
});
beforeEach(() => {
  mocks.fetch.mockReset();
  mocks.scopes = { "rentals.read": ["ALL"], "rentals.handover": ["ALL"] };
});
function show(row = rental) {
  const changed = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <RentalCheckout rental={row} onChanged={changed} />
    </NextIntlClientProvider>,
  );
  return changed;
}

it("autosaves edited inspection data without confirming it or disabling further edits", async () => {
  let resolveDraft!: (value: unknown) => void;
  mocks.fetch.mockImplementation(async (url) => {
    if (url.endsWith("/checkout")) return checkout();
    if (url.includes("/media?")) return { items: [] };
    if (url.endsWith("/inspections/draft"))
      return new Promise((resolve) => {
        resolveDraft = resolve;
      });
    throw new Error(`Unexpected request ${url}`);
  });
  show();
  const notes = await screen.findByRole("textbox", {
    name: "Cosmetic findings",
  });
  fireEvent.change(notes, { target: { value: "Recorded scratch" } });
  await waitFor(
    () =>
      expect(
        mocks.fetch.mock.calls.some(([url]) =>
          url.endsWith("/inspections/draft"),
        ),
      ).toBe(true),
    { timeout: 2000 },
  );
  const draft = mocks.fetch.mock.calls.find(([url]) =>
    url.endsWith("/inspections/draft"),
  )!;
  expect(draft[2].json.data.cosmeticNotes).toBe("Recorded scratch");
  expect(draft[2].keepalive).toBe(true);
  expect(notes).toBeEnabled();
  expect(
    screen.getByRole("button", { name: "Confirm inspection" }),
  ).toBeDisabled();
  expect(
    mocks.fetch.mock.calls.some(([url]) =>
      url.endsWith("/inspections/confirm"),
    ),
  ).toBe(false);
  resolveDraft({});
  await screen.findByText("Operation completed");
});

it("preserves an inspection on a version conflict and requires explicit recovery", async () => {
  mocks.fetch.mockImplementation(async (url) => {
    if (url.endsWith("/checkout")) return checkout();
    if (url.includes("/media?")) return { items: [] };
    throw new ApiError(409, "The mechanic updated this scooter");
  });
  show();
  const notes = await screen.findByRole("textbox", {
    name: "Cosmetic findings",
  });
  fireEvent.change(notes, { target: { value: "Keep my recorded defect" } });
  await screen.findByRole(
    "button",
    { name: "Discard unsaved inspection and reload current state" },
    { timeout: 2000 },
  );
  expect(notes).toHaveValue("Keep my recorded defect");
  expect(
    screen.getByRole("button", { name: "Confirm inspection" }),
  ).toBeDisabled();
});

it("requires the actual authorized recipient and original identity check before handover", async () => {
  mocks.fetch.mockImplementation(async (url, _schema, options) => {
    if (url.endsWith("/checkout")) return checkout();
    if (url.includes("/media?")) return { items: [] };
    if (url.endsWith("/handover")) return rental;
    throw new Error(`Unexpected request ${url} ${options?.method}`);
  });
  show();
  const handover = await screen.findByRole("button", {
    name: "Confirm actual handover",
  });
  expect(handover).toBeDisabled();
  fireEvent.click(
    screen.getByRole("checkbox", {
      name: "I checked the original identity document and the person present at handover.",
    }),
  );
  fireEvent.click(handover);
  await waitFor(() =>
    expect(
      mocks.fetch.mock.calls.some(([url]) => url.endsWith("/handover")),
    ).toBe(true),
  );
  const sent = mocks.fetch.mock.calls.find(([url]) =>
    url.endsWith("/handover"),
  )!;
  expect(sent[2].json).toEqual({
    revision: 1,
    recipientPersonId: "driver",
    originalIdentityChecked: true,
  });
});

it("allows a return-only operator to record the mandatory return inspection", async () => {
  mocks.scopes = { "rentals.read": ["ALL"], "rentals.return": ["ALL"] };
  const active = { ...rental, status: "active" as const };
  mocks.fetch.mockImplementation(async (url) =>
    url.includes("/media?") ? { items: [] } : { ...checkout(), rental: active },
  );
  show(active);
  expect(
    await screen.findByRole("button", { name: "Confirm inspection" }),
  ).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Confirm actual handover" }),
  ).not.toBeInTheDocument();
});
