import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { messages } from "@repo/i18n";
import type { v1 } from "@repo/api-shared";
import { expect, it, vi } from "vitest";
import { PersonDetailHeader } from "./PersonDetailHeader";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/api", () => ({
  webApi: { url: (path: string) => `https://api.example.test${path}` },
}));
vi.mock("@/components/MoreActionsMenu", () => ({
  MoreActionsMenu: () => <button>More actions</button>,
}));
vi.mock("@/components/PersonContactSheet", () => ({
  PersonContactSheet: () => <button>Contact person</button>,
}));

const person: v1.persons.Person = {
  id: "p1",
  firstName: "Ada",
  lastName: "Lovelace",
  email: "ada@example.com",
  phone: "+40712345678",
  dateOfBirth: null,
  addressLine1: null,
  addressLine2: null,
  city: null,
  region: null,
  countryCode: null,
  documents: [],
  notes: null,
  createdAt: "2026-10-24T12:00:00Z",
  updatedAt: "2026-10-24T12:00:00Z",
  deletedAt: null,
};

function header(avatarAssetId: string | null) {
  return (
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <PersonDetailHeader
        person={{ ...person, avatarAssetId }}
        personsHref="/en/persons"
        busyAction={null}
        onDeletePerson={async () => true}
      />
    </NextIntlClientProvider>
  );
}

it("keeps the same compact header layout with and without a profile image", () => {
  const view = render(header(null));
  const layout = () => ({
    identity: screen.getByRole("heading", { name: "Ada Lovelace" })
      .parentElement!.className,
    metadata: screen.getByRole("button", { name: "Contact person" })
      .parentElement!.parentElement!.className,
    actions: screen.getByRole("button", { name: "More actions" }).parentElement!
      .className,
  });
  const withoutImage = layout();
  expect(view.container.querySelector('[data-slot="avatar"]')).toHaveAttribute(
    "data-size",
    "lg",
  );
  expect(
    screen.queryByRole("button", { name: "View: Ada Lovelace" }),
  ).not.toBeInTheDocument();
  view.rerender(header("portrait"));
  expect(layout()).toEqual(withoutImage);
  expect(view.container.querySelectorAll('[data-slot="avatar"]')).toHaveLength(
    1,
  );
  expect(view.container.querySelector('[data-slot="avatar"]')).toHaveAttribute(
    "data-size",
    "lg",
  );
  expect(
    view.container.querySelector('[data-slot="profile-image"]'),
  ).not.toBeInTheDocument();
});

it("opens the original image from the avatar by keyboard and closes the viewer", async () => {
  const user = userEvent.setup();
  render(header("portrait"));
  const avatar = screen.getByRole("button", { name: "View: Ada Lovelace" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  avatar.focus();
  await user.keyboard("{Enter}");
  const dialog = await screen.findByRole("dialog", { name: "Ada Lovelace" });
  expect(
    within(dialog)
      .getByRole("img", { name: "Ada Lovelace" })
      .getAttribute("src"),
  ).toContain("portrait");
  expect(within(dialog).getByRole("button", { name: "Zoom in" })).toBeVisible();
  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
});
