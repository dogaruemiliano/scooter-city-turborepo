import { beforeEach, expect, it, vi } from "vitest";
import Page, { generateMetadata } from "../new/page";

const mocks = vi.hoisted(() => ({ access: vi.fn() }));
vi.mock("@/lib/access-server", () => ({ requireAccess: mocks.access }));
vi.mock("../_components/RentalCreateWizard", () => ({
  RentalCreateWizard: () => null,
}));
beforeEach(() => {
  mocks.access.mockReset();
  mocks.access.mockResolvedValue({ id: "authorized-operator" });
});

it("requires rental creation permission and scopes the draft to the authenticated operator", async () => {
  const page = await Page({
    params: Promise.resolve({ locale: "ro" }),
    searchParams: Promise.resolve({ draftId: "draft", personId: "person" }),
  });
  expect(mocks.access).toHaveBeenCalledWith(
    "ro",
    "/rentals/new",
    "rentals.create",
  );
  expect(page.props).toMatchObject({
    userId: "authorized-operator",
    returnedDraftId: "draft",
    returnedPersonId: "person",
  });
});

it("does not pass ambiguous repeated query parameters to the wizard", async () => {
  const page = await Page({
    params: Promise.resolve({ locale: "en" }),
    searchParams: Promise.resolve({
      draftId: ["one", "two"],
      personId: ["one", "two"],
    }),
  });
  expect(page.props.returnedDraftId).toBeUndefined();
  expect(page.props.returnedPersonId).toBeUndefined();
});

it("does not render a wizard when access fails", async () => {
  mocks.access.mockRejectedValue(new Error("Forbidden"));
  await expect(
    Page({
      params: Promise.resolve({ locale: "en" }),
      searchParams: Promise.resolve({}),
    }),
  ).rejects.toThrow("Forbidden");
});

it("localizes the page title", async () => {
  expect(
    await generateMetadata({ params: Promise.resolve({ locale: "ro" }) }),
  ).toMatchObject({ title: "Creează închiriere" });
});
