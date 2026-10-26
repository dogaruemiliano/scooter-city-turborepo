import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DocumentStatus } from "@repo/ui/components/document-status";

describe("DocumentStatus", () => {
  it("keeps queued work distinct from active analysis", () => {
    const view = render(<DocumentStatus state="queued" label="Queued" />);
    expect(screen.getByRole("status")).toHaveTextContent("Queued");
    expect(view.container.querySelector('[data-slot="spinner"]')).toBeNull();
    view.rerender(<DocumentStatus state="analyzing" label="Analyzing" />);
    expect(screen.getByRole("status")).toHaveTextContent("Analyzing");
    expect(
      view.container.querySelector('[data-slot="spinner"]'),
    ).toBeInTheDocument();
    expect(view.container.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });
  it.each(["uploading", "uploaded", "analyzing", "analyzed"] as const)(
    "keeps %s text accessible without a visible label",
    (state) => {
      render(<DocumentStatus state={state} label="Localized state" />);
      expect(screen.getByText("Localized state")).toHaveClass("sr-only");
      expect(screen.getByRole("status")).toHaveTextContent("Localized state");
    },
  );
  it("shows green AI sparkles without a checkmark for analyzed documents", () => {
    const view = render(<DocumentStatus state="analyzed" label="Analyzed" />);
    expect(
      view.container.querySelector(".lucide-sparkles"),
    ).toBeInTheDocument();
    expect(view.container.querySelector(".lucide-sparkles")).toHaveClass(
      "text-success",
    );
    expect(
      view.container.querySelector(".lucide-check"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Analyzed")).toHaveClass("sr-only");
  });
  it("anchors status to the right with its visible label before the icon", () => {
    render(<DocumentStatus state="queued" label="Queued" />);
    const status = screen.getByRole("status");
    expect(status).toHaveClass("ml-auto", "self-end");
    expect(status.firstElementChild).toHaveTextContent("Queued");
    expect(status.lastElementChild?.tagName.toLowerCase()).toBe("svg");
  });
  it("announces failures separately and preserves the supplied explanation", () => {
    render(
      <DocumentStatus
        state="failed"
        label="Upload expired. Upload the document again."
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Upload expired. Upload the document again.",
    );
  });
});
