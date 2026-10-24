import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { messages } from "@repo/i18n";
import type { v1 } from "@repo/api-shared";
import { expect, it } from "vitest";
import {
  PersonIdentityCard,
  PersonIdentityRow,
  type PersonSummary,
} from "./PersonIdentity";
import { PersonContactActions } from "./PersonContactActions";
import type { ReactNode } from "react";

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
  const avatarColumn = badge.closest('[data-slot="person-avatar-column"]');
  expect(avatarColumn?.querySelector('[data-slot="avatar"]')).not.toBeNull();
  expect(avatarColumn).not.toContainElement(screen.getByText("Ada Lovelace"));
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
