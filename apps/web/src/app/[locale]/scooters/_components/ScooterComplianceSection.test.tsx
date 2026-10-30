import { v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScooterComplianceSection } from "./ScooterComplianceSection";

const access = vi.hoisted(() => ({ read: true }));
vi.mock("@/components/auth/SessionProvider", () => ({
  useOptionalSession: () => ({ user: { isSuperAdmin: access.read } }),
}));
const policy = {
  id: "policy",
  insuredName: "Alex Popescu",
  validFrom: "2026-01-01",
  validUntil: "2026-12-31",
  premiumAmount: null,
  currency: null,
  documentVin: null,
  vinReviewConfirmed: false,
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
};
function renderSummary(
  overrides: Partial<v1.scooters.Scooter> = {},
  locale: "en" | "ro" = "en",
) {
  const scooter = {
    itpStatus: "expiring",
    itpValidUntil: "2026-11-04",
    insurancePolicies: [policy],
    ...overrides,
  } as v1.scooters.Scooter;
  return render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <ScooterComplianceSection scooter={scooter} />
    </NextIntlClientProvider>,
  );
}
beforeEach(() => {
  access.read = true;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-30T23:30:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("scooter compliance summaries", () => {
  it("shows ITP validity with calendar days remaining and insured name without disabled form controls", () => {
    const { container } = renderSummary();
    expect(screen.getByText("(5 days remaining)")).toBeInTheDocument();
    expect(
      container.querySelector('time[datetime="2026-11-04"]'),
    ).toHaveTextContent("Nov 4, 2026");
    expect(
      container.querySelector('time[datetime="2026-12-31"]'),
    ).toBeInTheDocument();
    expect(screen.getByText("Alex Popescu")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(
      container.querySelector("input, select, textarea, [disabled]"),
    ).toBeNull();
  });

  it.each([
    ["2026-10-30", "expiring", "(Expires today)"],
    ["2026-10-29", "expired", "(Expired 1 day ago)"],
    ["2026-10-31", "expiring", "(1 day remaining)"],
  ] as const)("handles ITP expiry on %s", (itpValidUntil, itpStatus, text) => {
    renderSummary({ itpValidUntil, itpStatus });
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it.each(["failed", "review"] as const)(
    "does not present %s ITP as available",
    (itpStatus) => {
      renderSummary({ itpStatus });
      expect(
        screen.getByText(messages.en.scooters.itp.status[itpStatus]),
      ).toBeInTheDocument();
      expect(screen.queryByText(/days remaining/)).not.toBeInTheDocument();
    },
  );

  it("shows missing coverage explicitly", () => {
    renderSummary({
      itpStatus: "missing",
      itpValidUntil: null,
      insurancePolicies: [],
    });
    expect(screen.getByText("ITP not recorded")).toBeInTheDocument();
    expect(
      screen.getByText("No ITP validity date recorded."),
    ).toBeInTheDocument();
    expect(screen.getByText("No insurance recorded.")).toBeInTheDocument();
  });

  it("distinguishes upcoming and expired policies and keeps their insured names together", () => {
    renderSummary({
      insurancePolicies: [
        {
          ...policy,
          id: "old",
          insuredName: "Old holder",
          validUntil: "2026-10-01",
        },
        {
          ...policy,
          id: "next",
          insuredName: "New holder",
          validFrom: "2026-11-01",
        },
      ],
    });
    const old = screen.getByText("Old holder").closest("li")!;
    const next = screen.getByText("New holder").closest("li")!;
    expect(within(old).getByText("Expired")).toBeInTheDocument();
    expect(within(next).getByText("Upcoming")).toBeInTheDocument();
    expect(within(next).getByText("Valid from")).toBeInTheDocument();
  });

  it("shows unknown validity and insured name without implying active coverage", () => {
    renderSummary({
      insurancePolicies: [{ ...policy, validUntil: null, insuredName: null }],
    });
    expect(screen.getByText("Needs review")).toBeInTheDocument();
    expect(screen.getByText("Validity date unavailable")).toBeInTheDocument();
    expect(screen.getByText("Insured name unavailable")).toBeInTheDocument();
  });

  it("localizes the countdown in Romanian", () => {
    renderSummary({}, "ro");
    expect(screen.getByText("(5 zile rămase)")).toBeInTheDocument();
  });

  it("requires document read access", () => {
    access.read = false;
    expect(renderSummary().container).toBeEmptyDOMElement();
  });
});
