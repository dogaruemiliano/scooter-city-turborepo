import { v1 } from "@repo/api-shared";
import { scrollFade } from "@repo/theme";
import { messages } from "@repo/i18n";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ScooterDocumentAnalysisContext } from "./ScooterDocumentAnalysisStatus";
import type { DocumentAnalysisState } from "./useScooterDocumentAnalysis";
import { ScooterBatchDocuments } from "./ScooterBatchDocuments";
import type { ScooterDocumentsEditor } from "./useScooterDocuments";

vi.mock("@/lib/api", () => ({ webApi: { url: (path: string) => path } }));

vi.mock("@/components/auth/SessionProvider", () => ({
  useOptionalSession: () => ({ user: { isSuperAdmin: true } }),
}));

const existing: v1.scooters.ScooterDocument = {
  id: "civ",
  type: "civ",
  fileName: "CIV.pdf",
  contentType: "application/pdf",
  byteSize: 100,
  createdAt: "2026-10-13",
  contentUrl: "/v1/scooters/s/documents/civ/content",
};
const importResult = {
  ok: true as const,
  values: { color: "Blue" },
  confirmedEmpty: [],
  unresolved: [],
  unresolvedRawFields: [],
  emptyConflicts: [],
};
const add = vi.fn();
const setVersion = vi.fn();

function view({
  attached = [existing],
  disabled = false,
  result = importResult,
  drafts = [],
}: {
  attached?: v1.scooters.ScooterDocument[];
  disabled?: boolean;
  result?: typeof importResult;
  drafts?: ScooterDocumentsEditor["drafts"];
} = {}) {
  const documents = {
    existing: attached,
    drafts,
    extractions: {},
    add,
    setVersion,
  } as unknown as ScooterDocumentsEditor;
  return (
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <ScooterBatchDocuments
        documents={documents}
        disabled={disabled}
        analyzing={false}
        importResult={result}
      />
    </NextIntlClientProvider>
  );
}

function drop(target: HTMLElement, files: File[]) {
  fireEvent.drop(target, { dataTransfer: { files, types: ["Files"] } });
}

beforeEach(() => {
  add.mockReset();
  setVersion.mockReset();
});

describe("Scooter batch document states", () => {
  it("keeps the mobile upload area below the documents without an expand button or ghost card", () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });
    try {
      render(view());
      const list = screen.getByRole("list", { name: "Attached documents" });
      const picker = screen.getByRole("button", {
        name: "Select scooter documents",
      });
      expect(
        list.compareDocumentPosition(picker) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        screen.queryByRole("button", { name: "Add document" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Import more documents" }),
      ).not.toBeInTheDocument();
      expect(within(list).getAllByRole("listitem")).toHaveLength(1);
    } finally {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: originalWidth,
      });
    }
  });

  it("scrolls the mobile rail to newly appended documents, but not on analysis updates or removal", () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });
    try {
      const fixture = render(view());
      const viewport = screen.getByRole("region", {
        name: "Attached documents",
      });
      const scrollTo = vi.fn();
      Object.defineProperties(viewport, {
        scrollTo: { configurable: true, value: scrollTo },
        scrollWidth: { configurable: true, value: 900 },
        clientWidth: { configurable: true, value: 300 },
      });
      expect(scrollTo).not.toHaveBeenCalled();
      const file = {
        id: "new",
        type: "civ" as const,
        status: "uploading" as const,
        file: new File(["image"], "new.jpg", { type: "image/jpeg" }),
      };
      fixture.rerender(view({ drafts: [file] }));
      expect(scrollTo).toHaveBeenCalledExactlyOnceWith({
        left: 600,
        behavior: "smooth",
      });
      const list = screen.getByRole("list", { name: "Attached documents" });
      expect(
        within(within(list).getAllByRole("listitem").at(-1)!).getByText(
          "new.jpg",
        ),
      ).toBeInTheDocument();
      fixture.rerender(view({ drafts: [{ ...file, status: "ready" }] }));
      fixture.rerender(view());
      expect(scrollTo).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: originalWidth,
      });
    }
  });

  it("accepts a file dropped directly on the desktop gallery surrounding the document cards", () => {
    render(view());
    const gallery = screen.getByRole("region", {
      name: "Drop your scooter documents",
    });
    expect(
      within(gallery).getByRole("list", { name: "Attached documents" }),
    ).toBeInTheDocument();
    const file = new File(["pdf"], "new.pdf", { type: "application/pdf" });
    drop(gallery, [file]);
    expect(add).toHaveBeenCalledExactlyOnceWith(null, [file]);
  });

  it("uses a viewport-sized snapping rail for both saved and uploaded document cards", () => {
    const file = {
      id: "one",
      type: "civ" as const,
      status: "ready" as const,
      file: new File(["image"], "CIV.jpg", { type: "image/jpeg" }),
    };
    const fixture = render(view({ drafts: [file] }));
    const list = screen.getByRole("list", {
      name: messages.en.scooters.documents.batch.attached,
    });
    const viewport = screen.getByRole("region", {
      name: messages.en.scooters.documents.batch.attached,
    });
    expect(viewport).toHaveClass(
      "snap-x",
      "snap-proximity",
      "[--scroll-fade-start:transparent]",
      "[--scroll-fade-end:transparent]",
      "scroll-px-(--scroll-fade-width)",
    );
    expect(viewport.style.maskImage).toBe(scrollFade.softMask);
    expect(viewport.className).not.toContain("data-[overflow-x-start]");
    expect(viewport.className).not.toContain("data-[overflow-x-end]");
    expect(viewport.parentElement).toHaveClass(
      "-mx-(--card-spacing)",
      "w-auto",
    );
    expect(list).toHaveClass("px-(--card-spacing)");
    expect(viewport.style.getPropertyValue("--scroll-fade-width")).toBe(
      "var(--gallery-fade-width)",
    );
    expect(list.parentElement).toHaveStyle({ minWidth: 0, width: "100%" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    viewport.scrollLeft = 120;
    fixture.rerender(view({ drafts: [{ ...file, status: "uploading" }] }));
    expect(
      screen.getByRole("region", {
        name: messages.en.scooters.documents.batch.attached,
      }),
    ).toBe(viewport);
    expect(viewport.scrollLeft).toBe(120);
  });

  it("places import more after all document previews", () => {
    const file = {
      id: "one",
      type: "civ" as const,
      status: "ready" as const,
      file: new File(["image"], "CIV.jpg", { type: "image/jpeg" }),
    };
    const viewResult = render(view({ attached: [], drafts: [file] }));
    const preview = viewResult.container.querySelector(
      '[data-slot="document-preview-card"]',
    )!;
    const addMore = screen.getByRole("button", {
      name: "Add document",
    });
    expect(
      preview.compareDocumentPosition(addMore) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it.each([false, true])(
    "animates only newly added previews, respecting reduced motion (%s)",
    (reducedMotion) => {
      const previousAnimate = HTMLElement.prototype.animate;
      const animate = vi.fn(
        () => ({ cancel: vi.fn() }) as unknown as Animation,
      );
      HTMLElement.prototype.animate = animate;
      const previousMatchMedia = window.matchMedia;
      window.matchMedia = vi.fn((query: string) => ({
        ...previousMatchMedia(query),
        matches:
          query === "(prefers-reduced-motion: reduce)" ? reducedMotion : false,
      }));
      const original = {
        id: "original",
        type: "civ" as const,
        status: "ready" as const,
        file: new File(["image"], "CIV.jpg", { type: "image/jpeg" }),
      };
      const added = {
        ...original,
        id: "added",
        file: new File(["image"], "ITP.jpg", { type: "image/jpeg" }),
      };
      const fixture = render(view({ attached: [], drafts: [original] }));
      try {
        expect(animate).not.toHaveBeenCalled();
        fixture.rerender(view({ attached: [], drafts: [original, added] }));
        expect(animate).toHaveBeenCalledTimes(reducedMotion ? 0 : 1);
        fixture.rerender(
          view({
            attached: [],
            drafts: [original, { ...added, type: "itp_card" }],
          }),
        );
        expect(animate).toHaveBeenCalledTimes(reducedMotion ? 0 : 1);
      } finally {
        fixture.unmount();
        HTMLElement.prototype.animate = previousAnimate;
        window.matchMedia = previousMatchMedia;
      }
    },
  );

  it.each(["uploading", "processing", "success"] as const)(
    "puts the type and %s feedback at the bottom of an A4 preview card",
    (phase) => {
      const draft = {
        id: "file",
        type: "civ" as const,
        file: new File(["pdf"], "CIV.pdf", { type: "application/pdf" }),
        status:
          phase === "uploading" ? ("uploading" as const) : ("ready" as const),
      };
      const entry: DocumentAnalysisState =
        phase === "success"
          ? {
              status: "success",
              analysis: {
                sourceId: "file",
                documentType: "civ",
                extractedData: { vin: null, fields: {}, rawFields: {} },
                issues: [],
                reviewRequired: true,
              },
            }
          : { status: "processing" };
      render(
        <ScooterDocumentAnalysisContext value={{ file: entry }}>
          {view({ attached: [], drafts: [draft] })}
        </ScooterDocumentAnalysisContext>,
      );
      const expand = screen.queryByRole("button", {
        name: "Add document",
      });
      if (expand) fireEvent.click(expand);
      const name = screen.getByRole("button", { name: "CIV.pdf" });
      const row = name.closest("li")!;
      expect(within(row).getByText("CIV", { exact: true })).toBeInTheDocument();
      const status = within(row).getByRole("status");
      expect(status.parentElement).toContainElement(
        within(row).getByText("CIV", { exact: true }),
      );
      const card = row.querySelector('[data-slot="document-preview-card"]');
      expect(card).toHaveStyle({ aspectRatio: String(210 / 297) });
      expect(card).toContainElement(name);
      expect(card).toContainElement(status);
      expect(status.parentElement).toHaveClass("bottom-0");
      expect(
        within(row).getByRole("button", { name: /Remove.*CIV.pdf/ }),
      ).toBeEnabled();
      expect(status).toHaveClass("justify-end", "text-right");
      if (phase === "success")
        expect(status).toHaveTextContent(
          messages.en.scooters.documents.batch.read,
        );
    },
  );

  it("identifies client copies below the filename with a colored badge and protective icon", () => {
    render(
      view({
        attached: [],
        drafts: [
          {
            id: "copy",
            type: null,
            version: "client_copy",
            status: "ready",
            file: new File(["pdf"], "client.pdf", { type: "application/pdf" }),
          },
        ],
      }),
    );
    const name = screen.getByRole("button", {
      name: "client.pdf",
    });
    const badge = within(name.closest("li")!).getByText(
      messages.en.scooters.documents.clientCopy,
    );
    expect(badge).toHaveAttribute("data-variant", "default");
    expect(badge).toHaveClass("bg-primary", "text-primary-foreground");
    expect(badge.querySelector('svg[aria-hidden="true"]')).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Use as original" }),
    ).not.toBeInTheDocument();
  });

  it("opens client-copy details from the full-screen corners and keeps assignment controls inside the sheet", async () => {
    render(
      view({
        attached: [],
        drafts: [
          {
            id: "copy",
            type: "civ",
            version: "client_copy",
            status: "ready",
            file: new File(["image"], "client.jpg", { type: "image/jpeg" }),
          },
          {
            id: "original",
            type: "civ",
            status: "ready",
            file: new File(["image"], "original.jpg", { type: "image/jpeg" }),
          },
        ],
      }),
    );
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "client.jpg" }));
    const viewer = await screen.findByRole("dialog", { name: "client.jpg" });
    expect(
      within(
        viewer.querySelector<HTMLElement>(
          '[data-slot="document-preview-header"]',
        )!,
      ).getByText("client.jpg"),
    ).toBeInTheDocument();
    expect(
      within(viewer).getByRole("button", {
        name: messages.en.scooters.documents.closePreview,
      }),
    ).toBeInTheDocument();
    expect(within(viewer).getByRole("status")).toBeInTheDocument();
    fireEvent.click(within(viewer).getByRole("button", { name: "For client" }));
    const sheet = await screen.findByRole("dialog", {
      name: "A protected copy for clients",
    });
    expect(within(sheet).getByText("For client")).toHaveAttribute(
      "data-variant",
      "default",
    );
    expect(
      within(sheet).getByRole("combobox", { name: "Original for client.jpg" }),
    ).toBeInTheDocument();
    fireEvent.click(
      within(sheet).getByRole("combobox", { name: "Original for client.jpg" }),
    );
    fireEvent.click(
      await screen.findByRole("option", { name: "original.jpg" }),
    );
    expect(setVersion).toHaveBeenCalledWith("copy", "client_copy", "original");
    expect(sheet).toHaveClass("bg-popover");
    expect(sheet).not.toHaveClass("bg-background");
    fireEvent.click(
      within(sheet).getByRole("button", { name: "Use as original" }),
    );
    expect(setVersion).toHaveBeenCalledWith("copy", "original");
  });

  it("uses automatic version detection without a document-version input", () => {
    render(view({ attached: [] }));
    expect(
      screen.queryByRole("combobox", {
        name: messages.en.scooters.workspace.version,
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: messages.en.scooters.documents.batch.drop,
      }),
    ).toBeEnabled();
  });
  it("keeps the full drop area when an import result exists without attached documents", () => {
    render(view({ attached: [] }));
    expect(
      screen.getByRole("button", { name: /Drop your scooter documents/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add document" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(messages.en.scooters.creation.importComplete),
    ).not.toBeInTheDocument();
  });

  it("restores the drop area when the final attached document is removed", () => {
    const fixture = render(view());
    expect(
      screen.getByRole("button", { name: "Add document" }),
    ).toBeInTheDocument();
    fixture.rerender(view({ attached: [] }));
    expect(
      screen.getByRole("button", { name: /Drop your scooter documents/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("list", { name: "Attached documents" }),
    ).not.toBeInTheDocument();
  });

  it("opens the file picker directly from the add card without revealing another upload control", async () => {
    const user = userEvent.setup();
    const fixture = render(view());
    const picker =
      fixture.container.querySelector<HTMLInputElement>('input[type="file"]')!;
    const click = vi.spyOn(picker, "click");
    await user.click(screen.getByRole("button", { name: "Add document" }));
    expect(click).toHaveBeenCalledOnce();
    expect(
      screen.queryByRole("button", { name: /Drop your scooter documents/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Import more documents" }),
    ).not.toBeInTheDocument();
  });

  it("highlights file drags and passes dropped files through the existing upload path", () => {
    render(view());
    const target = screen.getByRole("button", {
      name: "Add document",
    });
    fireEvent.dragOver(target, { dataTransfer: { types: ["Files"] } });
    expect(
      target
        .closest('[data-slot="file-drop-gallery"]')!
        .querySelector('[data-slot="file-drop-overlay"]'),
    ).toHaveClass("bg-file-drop-overlay", "backdrop-blur-file-drop");
    fireEvent.dragLeave(target, { relatedTarget: null });
    expect(
      target
        .closest('[data-slot="file-drop-gallery"]')!
        .querySelector('[data-slot="file-drop-overlay"]'),
    ).toBeNull();
    const pdf = new File(["pdf"], "registration.pdf", {
      type: "application/pdf",
    });
    const image = new File(["photo"], "insurance.jpg", { type: "image/jpeg" });
    drop(target, [pdf, image]);
    expect(add).toHaveBeenCalledExactlyOnceWith(null, [pdf, image]);
    expect(
      screen.getByRole("button", { name: "Add document" }),
    ).toBeInTheDocument();
  });

  it("shows validation errors when an invalid file is dropped on the compact target", () => {
    render(view());
    drop(screen.getByRole("button", { name: "Add document" }), [
      new File(["text"], "notes.txt", { type: "text/plain" }),
    ]);
    expect(add).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("notes.txt");
    expect(
      screen.getByRole("button", { name: "Add document" }),
    ).toBeInTheDocument();
  });

  it("validates empty files, file size, duplicate files and the total document limit", () => {
    const large = new File(["pdf"], "large.pdf", { type: "application/pdf" });
    Object.defineProperty(large, "size", {
      value: v1.scooters.SCOOTER_DOCUMENT_MAX_BYTES + 1,
    });
    const duplicate = new File(["pdf"], "duplicate.pdf", {
      type: "application/pdf",
    });
    render(
      view({
        attached: Array.from(
          { length: v1.scooters.SCOOTER_DOCUMENT_MAX_FILES - 1 },
          (_, index) => ({ ...existing, id: `doc-${index}` }),
        ),
      }),
    );
    drop(screen.getByRole("button", { name: "Add document" }), [
      new File([], "empty.pdf", { type: "application/pdf" }),
      large,
      duplicate,
      duplicate,
      new File(["pdf"], "extra.pdf", { type: "application/pdf" }),
    ]);
    expect(add).toHaveBeenCalledExactlyOnceWith(null, [duplicate]);
    const errors = screen.getByRole("alert");
    expect(errors).toHaveTextContent("empty.pdf");
    expect(errors).toHaveTextContent("large.pdf");
    expect(errors).toHaveTextContent("duplicate.pdf");
    expect(errors).toHaveTextContent("extra.pdf");
  });

  it("does not accept or highlight drops while disabled", () => {
    render(view({ disabled: true }));
    const target = screen.getByRole("button", {
      name: "Add document",
    });
    expect(target).toBeDisabled();
    fireEvent.dragOver(target, { dataTransfer: { types: ["Files"] } });
    expect(
      target
        .closest('[data-slot="file-drop-gallery"]')!
        .querySelector('[data-slot="file-drop-overlay"]'),
    ).toBeNull();
    drop(target, [
      new File(["pdf"], "registration.pdf", { type: "application/pdf" }),
    ]);
    expect(add).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: /Drop your scooter documents/ }),
    ).not.toBeInTheDocument();
  });

  it("ignores text drags and empty drops", () => {
    render(view());
    const target = screen.getByRole("button", {
      name: "Add document",
    });
    fireEvent.dragOver(target, { dataTransfer: { types: ["text/plain"] } });
    expect(
      target
        .closest('[data-slot="file-drop-gallery"]')!
        .querySelector('[data-slot="file-drop-overlay"]'),
    ).toBeNull();
    drop(target, []);
    expect(add).not.toHaveBeenCalled();
    expect(target).toBeInTheDocument();
  });
});
