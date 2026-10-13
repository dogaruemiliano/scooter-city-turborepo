import { v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ScooterBatchDocuments } from "./ScooterBatchDocuments";
import type { ScooterDocumentsEditor } from "./useScooterDocuments";

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

beforeEach(() => add.mockReset());

describe("Scooter batch document states", () => {
  it("keeps the full drop area when an import result exists without attached documents", () => {
    render(view({ attached: [] }));
    expect(
      screen.getByRole("button", { name: /Drop your scooter documents/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Import more documents" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(messages.en.scooters.creation.importComplete),
    ).not.toBeInTheDocument();
  });

  it("restores the drop area when the final attached document is removed", () => {
    const fixture = render(view());
    expect(
      screen.getByRole("button", { name: "Import more documents" }),
    ).toBeInTheDocument();
    fixture.rerender(view({ attached: [] }));
    expect(
      screen.getByRole("button", { name: /Drop your scooter documents/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("list", { name: "Attached documents" }),
    ).not.toBeInTheDocument();
  });

  it("keeps click-to-expand on the compact drop target", async () => {
    const user = userEvent.setup();
    render(view());
    await user.click(
      screen.getByRole("button", { name: "Import more documents" }),
    );
    expect(
      screen.getByRole("button", { name: /Drop your scooter documents/ }),
    ).toBeInTheDocument();
    expect(add).not.toHaveBeenCalled();
  });

  it("highlights file drags and passes dropped files through the existing upload path", () => {
    render(view());
    const target = screen.getByRole("button", {
      name: "Import more documents",
    });
    fireEvent.dragOver(target, { dataTransfer: { types: ["Files"] } });
    expect(target.querySelector('[data-slot="file-drop-overlay"]')).toHaveClass(
      "bg-file-drop-overlay",
      "backdrop-blur-file-drop",
    );
    fireEvent.dragLeave(target, { relatedTarget: null });
    expect(target.querySelector('[data-slot="file-drop-overlay"]')).toBeNull();
    const pdf = new File(["pdf"], "registration.pdf", {
      type: "application/pdf",
    });
    const image = new File(["photo"], "insurance.jpg", { type: "image/jpeg" });
    drop(target, [pdf, image]);
    expect(add).toHaveBeenCalledExactlyOnceWith(null, [pdf, image]);
    expect(
      screen.getByRole("button", { name: /Drop your scooter documents/ }),
    ).toBeInTheDocument();
  });

  it("shows validation errors when an invalid file is dropped on the compact target", () => {
    render(view());
    drop(screen.getByRole("button", { name: "Import more documents" }), [
      new File(["text"], "notes.txt", { type: "text/plain" }),
    ]);
    expect(add).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("notes.txt");
    expect(
      screen.getByRole("button", { name: /Drop your scooter documents/ }),
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
    drop(screen.getByRole("button", { name: "Import more documents" }), [
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
      name: "Import more documents",
    });
    expect(target).toBeDisabled();
    fireEvent.dragOver(target, { dataTransfer: { types: ["Files"] } });
    expect(target.querySelector('[data-slot="file-drop-overlay"]')).toBeNull();
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
      name: "Import more documents",
    });
    fireEvent.dragOver(target, { dataTransfer: { types: ["text/plain"] } });
    expect(target.querySelector('[data-slot="file-drop-overlay"]')).toBeNull();
    drop(target, []);
    expect(add).not.toHaveBeenCalled();
    expect(target).toBeInTheDocument();
  });
});
