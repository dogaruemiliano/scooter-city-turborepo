import { v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScooterDocumentMediaList } from "./ScooterDocumentMediaList";
import { ScooterDocumentList } from "./ScooterDocumentUpload";
import { ScooterBatchDocuments } from "./ScooterBatchDocuments";
import type { ScooterDocumentsEditor } from "./useScooterDocuments";

const access = vi.hoisted(() => ({ write: true }));
vi.mock("@/lib/api", () => ({ webApi: { url: (path: string) => path } }));
vi.mock("@/components/auth/SessionProvider", () => ({
  useOptionalSession: () => ({
    user: {
      isSuperAdmin: access.write,
      permissions: { "scooter_documents.read": ["ALL"] },
    },
  }),
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
      contentUrl: "/client.png",
      fileName: "client.png",
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
const docLabels = messages.en.scooters.documents;
const open = (name: string) => docLabels.preview.replace("{name}", name);
beforeEach(() => {
  access.write = true;
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL = vi.fn((file: File) => `blob:${file.name}`);
      static revokeObjectURL = vi.fn();
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("scooter document list viewer", () => {
  it("opens a details document and navigates across originals, client copies, and document categories", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <ScooterDocumentMediaList documents={documents}>
          <ScooterDocumentList documents={documents} />
        </ScooterDocumentMediaList>
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: open("civ.png") }));
    const viewer = screen.getByRole("dialog");
    expect(
      within(viewer).getByRole("img", { name: "civ.png" }),
    ).toBeInTheDocument();
    fireEvent.click(within(viewer).getByRole("button", { name: media.next }));
    expect(
      within(viewer).getByRole("img", { name: "client.png" }),
    ).toBeInTheDocument();
    fireEvent.click(within(viewer).getByRole("button", { name: media.next }));
    expect(
      within(viewer).getByRole("img", { name: "registration.png" }),
    ).toBeInTheDocument();
    expect(
      within(viewer).getByRole("button", { name: media.next }),
    ).toBeDisabled();
    fireEvent.click(
      within(viewer).getByRole("button", { name: media.actions }),
    );
    expect(
      screen.queryByRole("menuitem", { name: media.crop }),
    ).not.toBeInTheDocument();
  });
  it("opens the create/edit batch list with existing and local files in one viewer", () => {
    const editor = {
      existing: documents,
      drafts: [
        {
          id: "new",
          type: "civ",
          status: "ready",
          file: new File(["image"], "new.png", { type: "image/png" }),
        },
      ],
      extractions: {},
      add: vi.fn(),
      setVersion: vi.fn(),
      classify: vi.fn(),
      removeDraft: vi.fn(),
      removeExisting: vi.fn(),
      preview: vi.fn(),
    } as unknown as ScooterDocumentsEditor;
    render(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <ScooterDocumentMediaList documents={documents} editor={editor}>
          <ScooterBatchDocuments
            documents={editor}
            disabled={false}
            analyzing={false}
          />
        </ScooterDocumentMediaList>
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: open("new.png") }));
    const viewer = screen.getByRole("dialog");
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(
      within(viewer).getByRole("img", { name: "new.png" }),
    ).toHaveAttribute("src", "blob:new.png");
    fireEvent.click(
      within(viewer).getByRole("button", { name: media.previous }),
    );
    expect(
      within(viewer).getByRole("img", { name: "civ.png" }),
    ).toBeInTheDocument();
    // Originals and their client versions now follow the document-type order.
    for (let index = 0; index < 3; index++)
      fireEvent.click(within(viewer).getByRole("button", { name: media.next }));
    expect(
      within(viewer).getByRole("img", { name: "registration.png" }),
    ).toBeInTheDocument();
    fireEvent.click(
      within(viewer).getByRole("button", { name: media.actions }),
    );
    expect(
      screen.getByRole("menuitem", { name: media.crop }),
    ).toBeInTheDocument();
  });
});
