import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { messages } from "@repo/i18n";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ScooterDetailPhotos } from "./ScooterDetailPhotos";

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/lib/api", () => ({
  webApi: {
    fetch: mocks.fetch,
    url: (url: string) => `http://localhost:3000${url}`,
  },
}));
const photos = [
  {
    id: "front",
    fileName: "front.jpg",
    caption: "Front view",
    contentUrl: "/front.jpg",
  },
  { id: "side", fileName: "side.jpg", caption: null, contentUrl: "/side.jpg" },
];
function renderPhotos() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <ScooterDetailPhotos scooterId="scooter" />
    </NextIntlClientProvider>,
  );
}
beforeEach(() => mocks.fetch.mockReset().mockResolvedValue(photos));

describe("scooter details photo rail", () => {
  it("shows a horizontal read-only collection and opens the selected photo in the shared viewer", async () => {
    const { container } = renderPhotos();
    const thumbnail = await screen.findByRole("button", {
      name: "Open photo: Front view",
    });
    const rail = container.querySelector(
      '[data-slot="horizontal-scroll-area"]',
    );
    expect(rail).toBeInTheDocument();
    expect(rail).toHaveClass("-mx-(--card-spacing)", "w-auto");
    const viewport = rail!.querySelector(
      '[data-slot="horizontal-scroll-viewport"]',
    )!;
    expect(viewport).toHaveClass(
      "[--scroll-fade-start:transparent]",
      "[--scroll-fade-end:transparent]",
    );
    expect(viewport).toHaveStyle({
      "--scroll-fade-width": "var(--card-spacing)",
    });
    expect(rail!.querySelector("ul")).toHaveClass("px-(--card-spacing)");
    expect(within(rail as HTMLElement).getAllByRole("listitem")).toHaveLength(
      2,
    );
    expect(container.querySelector('input[type="file"]')).toBeNull();
    expect(container.querySelector('[data-slot="sortable-grid"]')).toBeNull();
    fireEvent.click(thumbnail);
    const dialog = await screen.findByRole("dialog");
    expect(
      dialog.querySelector('[data-slot="image-preview"]'),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("img", { name: "Front view" }),
    ).toHaveAttribute("src", "http://localhost:3000/front.jpg");
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: messages.en.scooters.photos.next,
      }),
    );
    expect(
      within(dialog).getByRole("img", { name: "side.jpg" }),
    ).toHaveAttribute("src", "http://localhost:3000/side.jpg");
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: messages.en.scooters.photos.close,
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("shows an empty state", async () => {
    mocks.fetch.mockResolvedValue([]);
    renderPhotos();
    expect(
      await screen.findByText(messages.en.scooters.photos.emptyReadOnly),
    ).toBeInTheDocument();
  });

  it("supports retrying a failed photo load", async () => {
    mocks.fetch
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(photos);
    renderPhotos();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      messages.en.scooters.photos.errors.load,
    );
    fireEvent.click(
      screen.getByRole("button", { name: messages.en.scooters.photos.retry }),
    );
    await screen.findByRole("button", { name: "Open photo: Front view" });
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });
});
