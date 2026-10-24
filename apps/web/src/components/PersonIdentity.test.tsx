import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { messages } from "@repo/i18n";
import type { v1 } from "@repo/api-shared";
import { expect, it, vi } from "vitest";
import {
  PersonIdentityCard,
  PersonIdentityRow,
  type PersonSummary,
} from "./PersonIdentity";
import { PersonContactActions } from "./PersonContactActions";
import type { ReactNode } from "react";

vi.mock("@/lib/api", () => ({
  webApi: { url: (path: string) => `https://api.example.test${path}` },
}));

const person: PersonSummary = {
  id: "p1",
  firstName: "Ada",
  lastName: "Lovelace",
  email: "ada@example.com",
  phone: "+40 712 345 678",
};
const doc = (
  type: string,
  status: string,
  expiresOn: string | null = null,
  deletedAt: string | null = null,
) =>
  ({
    id: type,
    type,
    status,
    expiresOn,
    deletedAt,
  }) as v1.persons.PersonDocument;
function show(children: ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      {children}
    </NextIntlClientProvider>,
  );
}

it("shares contact details and verified/expired document indicators across cards and picker rows", () => {
  const data = {
    ...person,
    documents: [
      doc("nationalId", "verified"),
      doc("driverLicense", "verified", "2020-01-01"),
    ],
  };
  const view = show(<PersonIdentityCard person={data} />);
  expect(screen.getByText("Ada Lovelace")).toBeVisible();
  expect(screen.getByText(person.email!)).toBeVisible();
  expect(screen.getByText(person.phone!)).toBeVisible();
  expect(
    screen.getByRole("img", { name: "Identity document: Valid" }),
  ).toBeVisible();
  expect(
    screen.getByRole("img", { name: "Driver license: Expired" }),
  ).toBeVisible();
  const badge = screen.getByRole("img", { name: "Identity document: Valid" });
  const details = badge.closest('[data-slot="person-details"]');
  expect(details).not.toBeNull();
  expect(details).not.toContainElement(screen.getByText("Ada Lovelace"));
  expect(badge.closest('[data-slot="person-avatar-column"]')).toBeNull();
  view.unmount();
  show(
    <button type="button">
      <PersonIdentityRow person={data} />
    </button>,
  );
  expect(
    screen.getByRole("img", { name: "Identity document: Valid" }),
  ).toBeVisible();
  expect(
    screen.getByRole("img", { name: "Driver license: Expired" }),
  ).toBeVisible();
});

it("ignores deleted documents and distinguishes unavailable data from missing documents", () => {
  const view = show(
    <PersonIdentityCard
      person={{
        ...person,
        documents: [doc("driverLicense", "verified", null, "2026-01-01")],
      }}
    />,
  );
  expect(
    screen.getByRole("img", { name: "Driver license: Not present" }),
  ).toBeVisible();
  view.unmount();
  show(<PersonIdentityCard person={person} />);
  expect(
    screen.queryByRole("img", { name: /Not present/ }),
  ).not.toBeInTheDocument();
});

it("preserves unverified and rejected document states", () => {
  show(
    <PersonIdentityCard
      person={{
        ...person,
        documents: [
          doc("nationalId", "unverified"),
          doc("driverLicense", "rejected"),
        ],
      }}
    />,
  );
  expect(
    screen.getByRole("img", { name: "Identity document: Unverified" }),
  ).toBeVisible();
  expect(
    screen.getByRole("img", { name: "Driver license: Rejected" }),
  ).toBeVisible();
});

it("provides three contact destinations without triggering a request", () => {
  show(<PersonContactActions person={person} />);
  expect(
    screen.getByRole("link", { name: "Email Ada Lovelace" }),
  ).toHaveAttribute("href", "mailto:ada@example.com");
  expect(
    screen.getByRole("link", { name: "Call Ada Lovelace" }),
  ).toHaveAttribute("href", "tel:+40 712 345 678");
  const whatsapp = screen.getByRole("link", {
    name: "Message Ada Lovelace on WhatsApp",
  });
  expect(whatsapp).toHaveAttribute("href", "https://wa.me/40712345678");
  expect(whatsapp).toHaveAttribute("rel", "noreferrer");
});

it("disables unavailable contact methods instead of constructing empty destinations", () => {
  show(
    <PersonContactActions
      person={{ id: "p1", firstName: "Ada", lastName: "Lovelace" }}
    />,
  );
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  for (const button of screen.getAllByRole("button"))
    expect(button).toBeDisabled();
});

it("keeps row actions separate from document indicators", () => {
  show(
    <PersonIdentityRow
      person={{ ...person, documents: [] }}
      action={<span aria-label="Selected person">Selected</span>}
    />,
  );
  const action = screen.getByLabelText("Selected person");
  const badge = screen.getByRole("img", {
    name: "Identity document: Not present",
  });
  expect(action.closest('[data-slot="person-action"]')).not.toBeNull();
  expect(badge.closest('[data-slot="person-details"]')).not.toBeNull();
  expect(action.closest('[data-slot="person-trailing"]')).toContainElement(
    badge,
  );
});

it("keeps registration date above documents in the same trailing column", () => {
  show(
    <PersonIdentityCard
      person={{ ...person, documents: [] }}
      metadata="Oct 24, 2026"
    />,
  );
  const date = screen.getByText("Oct 24, 2026");
  const badge = screen.getByRole("img", {
    name: "Identity document: Not present",
  });
  const trailing = date.closest('[data-slot="person-trailing"]');
  expect(trailing).toContainElement(badge);
  expect(trailing).toHaveClass("justify-between", "self-stretch", "shrink-0");
  expect(date.closest('[data-slot="person-metadata"]')).toHaveClass(
    "items-end",
    "text-right",
  );
  expect(trailing?.parentElement).toHaveAttribute("data-slot", "person-row");
  expect(trailing?.parentElement).not.toHaveClass("flex-wrap");
});
