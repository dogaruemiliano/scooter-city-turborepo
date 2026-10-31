import { v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMediaCollection } from "@repo/ui/components/media-collection";
import { ScooterDetailDocuments } from "./ScooterDetailDocuments";

const access = vi.hoisted(() => ({ read: true }));
vi.mock("@/lib/api", () => ({ webApi: { url: (path: string) => path } }));
vi.mock("@/components/auth/SessionProvider", () => ({
  useOptionalSession: () => ({ user: { isSuperAdmin: access.read } }),
}));
const documents: v1.scooters.ScooterDocument[] = [
  {
    id: "civ",
    type: "civ",
    contentType: "image/png",
    contentUrl: "/civ.png",
    fileName: "civ.png",
    byteSize: 100,
    createdAt: "2026-10-01",
    clientCopy: {
      contentType: "image/png",
      contentUrl: "/copy.png",
      fileName: "copy.png",
      byteSize: 100,
    },
  },
  {
    id: "registration",
    type: "registration_certificate",
    contentType: "image/png",
    contentUrl: "/registration.png",
    fileName: "registration.png",
    byteSize: 100,
    createdAt: "2026-10-01",
  },
];
const media = messages.en.shared.media;
function EvidenceLink() {
  const collection = useMediaCollection();
  return (
    <button onClick={() => collection?.open("registration")}>
      View compliance evidence
    </button>
  );
}
function renderDocuments(docs = documents) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <ScooterDetailDocuments documents={docs}>
        <EvidenceLink />
      </ScooterDetailDocuments>
    </NextIntlClientProvider>,
  );
}
beforeEach(() => {
  access.read = true;
});

describe("read-only scooter documents", () => {
  it("shows a horizontal rail with no remove controls and opens the shared document viewer", () => {
    const { container } = renderDocuments();
    const rail = container.querySelector(
      '[data-slot="horizontal-scroll-area"]',
    ) as HTMLElement;
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
    expect(within(rail).getAllByRole("listitem")).toHaveLength(3);
    expect(within(rail).getAllByRole("button")).toHaveLength(3);
    expect(
      screen.queryByRole("button", { name: /remove|delete/i }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Preview civ.png" }));
    const viewer = screen.getByRole("dialog");
    expect(
      within(viewer).getByRole("img", { name: "civ.png" }),
    ).toBeInTheDocument();
    fireEvent.click(within(viewer).getByRole("button", { name: media.next }));
    expect(
      within(viewer).getByRole("img", { name: "copy.png" }),
    ).toBeInTheDocument();
    fireEvent.click(within(viewer).getByRole("button", { name: media.next }));
    expect(
      within(viewer).getByRole("img", { name: "registration.png" }),
    ).toBeInTheDocument();
    fireEvent.click(
      within(viewer).getByRole("button", { name: media.actions }),
    );
    expect(
      screen.queryByRole("menuitem", { name: media.remove }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: media.crop }),
    ).not.toBeInTheDocument();
  });

  it("keeps compliance evidence in the same viewer collection", () => {
    renderDocuments();
    fireEvent.click(
      screen.getByRole("button", { name: "View compliance evidence" }),
    );
    expect(
      within(screen.getByRole("dialog")).getByRole("img", {
        name: "registration.png",
      }),
    ).toBeInTheDocument();
  });

  it("shows the empty state", () => {
    renderDocuments([]);
    expect(
      screen.getByText(messages.en.scooters.documents.empty),
    ).toBeInTheDocument();
  });

  it("requires document read permission", () => {
    access.read = false;
    const { container } = renderDocuments();
    expect(container).toBeEmptyDOMElement();
  });
});
