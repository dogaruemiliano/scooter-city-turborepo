import { v1 } from "@repo/api-shared";
import { messages, type SupportedLocale } from "@repo/i18n";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/api", () => ({
  webApi: { url: (path: string) => `http://localhost:3000${path}` },
}));

import { ScooterCard, type ScooterCardDetails } from "./ScooterCard";

const scooter: v1.scooters.ScooterListItem = {
  id: "scooter-1",
  vin: "JYARN23E0RA123456",
  brandId: "brand-yamaha",
  brand: "Yamaha",
  fleetNumber: 1,
  brandCode: "YAM",
  model: "NMAX",
  color: "White",
  manufactureYear: 2026,
  powertrainType: "combustion",
  engineCode: null,
  engineDisplacementCc: 125,
  powerKw: 8.5,
  registrationType: "local",
  registrationNumber: "VL-BUJORENI-175",
  registrationDate: null,
  temporaryRegistrationExpiresAt: null,
  requiredLicenseCategory: "AM",
  currentMileageKm: 12500,
  hasGps: null,
  odometerWorking: null,
  speedometerWorking: null,
  actualMaxSpeedKmh: null,
  notes: null,
  createdAt: "2026-06-25T10:00:00.000Z",
  updatedAt: "2026-06-25T10:00:00.000Z",
  deletedAt: null,
};

function card(
  details?: ScooterCardDetails,
  locale: SupportedLocale = "en",
  record = scooter,
) {
  return (
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <ScooterCard scooter={record} details={details} />
    </NextIntlClientProvider>
  );
}

function field(label: string) {
  return within(screen.getByText(label).parentElement!);
}

describe("ScooterCard", () => {
  it("uses the selected internal cover from the list API", () => {
    render(
      card(undefined, "en", {
        ...scooter,
        coverUrl: "/v1/scooters/scooter-1/photos/photo-1/content",
      }),
    );
    expect(
      screen.getByRole("img", { name: "Scooter 001 YAM" }),
    ).toHaveAttribute(
      "src",
      "http://localhost:3000/v1/scooters/scooter-1/photos/photo-1/content",
    );
  });
  it("keeps unknown operational data explicit, even when instrument checks pass", () => {
    render(
      card(undefined, "en", {
        ...scooter,
        speedometerWorking: true,
        odometerWorking: true,
      }),
    );
    expect(screen.getByText("No photo")).toBeInTheDocument();
    expect(
      field("Rental status").getByText("Not recorded"),
    ).toBeInTheDocument();
    expect(
      field("Technical condition").getByText("Not assessed"),
    ).toBeInTheDocument();
    expect(field("Renter").getByText("Not recorded")).toBeInTheDocument();
    expect(screen.queryByText("Available")).not.toBeInTheDocument();
    expect(screen.queryByText("Healthy")).not.toBeInTheDocument();
    expect(screen.queryByText("Next payment")).not.toBeInTheDocument();
  });

  it.each([
    ["available", "healthy", "Available", "Healthy"],
    ["rented", "minor", "Rented", "Minor issue"],
    ["reserved", "major", "Reserved", "Major issue"],
    ["maintenance", "critical", "Maintenance", "Critical"],
  ] as const)(
    "keeps %s rental status separate from %s condition",
    (rentalStatus, technicalHealth, rentalLabel, healthLabel) => {
      render(card({ rentalStatus, technicalHealth }));
      expect(field("Rental status").getByText(rentalLabel)).toBeInTheDocument();
      expect(
        field("Technical condition").getByText(healthLabel),
      ).toBeInTheDocument();
    },
  );

  it("shows the renter and calendar payment date in Romanian only while rented", () => {
    const details: ScooterCardDetails = {
      rentalStatus: "rented",
      technicalHealth: "minor",
      renterName: "Alex Popescu",
      nextPaymentDate: "2026-10-15",
    };
    const view = render(card(details, "ro"));
    expect(field("Chiriaș").getByText("Alex Popescu")).toBeInTheDocument();
    expect(field("Închiriere").getByText("Închiriat")).toBeInTheDocument();
    expect(
      field("Stare tehnică").getByText("Problemă minoră"),
    ).toBeInTheDocument();
    expect(field("Următoarea plată").getByText("15 oct. 2026")).toHaveAttribute(
      "datetime",
      "2026-10-15",
    );
    view.rerender(card({ ...details, rentalStatus: "reserved" }, "ro"));
    expect(screen.queryByText("Următoarea plată")).not.toBeInTheDocument();
  });

  it("does not invent a payment date when a rented scooter has none", () => {
    render(card({ rentalStatus: "rented" }));
    expect(field("Next payment").getByText("Not recorded")).toBeInTheDocument();
  });

  it("replaces a broken photo and retries a changed photo source", () => {
    const view = render(card({ photoUrl: "/scooter-photo.jpg" }));
    fireEvent.error(screen.getByRole("img", { name: "Scooter 001 YAM" }));
    expect(screen.getByText("Photo unavailable")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    view.rerender(card({ photoUrl: "/scooter-replacement.jpg" }));
    expect(
      screen.getByRole("img", { name: "Scooter 001 YAM" }),
    ).toBeInTheDocument();
  });

  it("supports an external photo preview without a configured optimization host", () => {
    render(card({ photoUrl: "https://photos.example.com/scooter.jpg" }));
    expect(
      screen.getByRole("img", { name: "Scooter 001 YAM" }),
    ).toHaveAttribute("src", "https://photos.example.com/scooter.jpg");
    fireEvent.error(screen.getByRole("img"));
    expect(screen.getByText("Photo unavailable")).toBeInTheDocument();
  });

  it("opens accessible quick actions without navigating and restores focus on Escape", async () => {
    const user = userEvent.setup();
    render(card());
    const button = screen.getByRole("button", {
      name: "Quick actions for 001 YAM",
    });
    await user.click(button);
    expect(
      await screen.findByRole("menuitem", { name: "View details" }),
    ).toHaveAttribute("href", "/en/scooters/scooter-1");
    expect(
      screen.getByRole("menuitem", { name: "Edit scooter" }),
    ).toHaveAttribute("href", "/en/scooters/scooter-1/edit");
    await user.keyboard("{Escape}");
    expect(button).toHaveFocus();
  });

  it("does not offer detail or edit actions for deleted records", () => {
    render(
      card(undefined, "en", {
        ...scooter,
        deletedAt: "2026-10-11T00:00:00.000Z",
      }),
    );
    expect(screen.getByText("Deleted")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
