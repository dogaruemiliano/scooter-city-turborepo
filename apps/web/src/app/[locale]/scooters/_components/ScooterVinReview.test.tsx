import { messages } from "@repo/i18n";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScooterVinReview, type VinReviewDocument } from "./ScooterVinReview";

const correct = "LXYTCZP05P0000001";
const misread = "LXYTC2P05P0000001";
const documents: VinReviewDocument[] = [
  { sourceId: "civ", fileName: "civ.pdf", vin: correct, originalVin: correct },
  {
    sourceId: "registration",
    fileName: "registration.pdf",
    vin: misread,
    originalVin: misread,
    src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E",
    contentType: "image/svg+xml",
  },
  {
    sourceId: "insurance",
    fileName: "insurance.pdf",
    vin: null,
    originalVin: null,
  },
];
afterEach(() => vi.useRealTimers());
function setup(
  locale: "en" | "ro" = "en",
  docs = documents,
  onApply = vi.fn(),
) {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
  render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <ScooterVinReview documents={docs} disabled={false} onApply={onApply} />
    </NextIntlClientProvider>,
  );
  return {
    user: userEvent.setup(),
    t: messages[locale].scooters.extraction.vinReview,
    onApply,
  };
}
async function enterVin(
  user: ReturnType<typeof userEvent.setup>,
  t: { vinLabel: string; continue: string },
  value = correct,
) {
  fireEvent.change(screen.getByRole("textbox", { name: t.vinLabel }), {
    target: { value },
  });
  await user.click(screen.getByRole("button", { name: t.continue }));
}
const tick = (ms: number) => act(() => vi.advanceTimersByTime(ms));

describe("VIN conflict review", () => {
  it.each(["en", "ro"] as const)(
    "reviews one document at a time and enforces the three-second countdown for each in %s",
    async (locale) => {
      const { user, t, onApply } = setup(locale);
      const first = screen.getByRole("dialog", { name: t.title });
      expect(within(first).getByRole("textbox")).toHaveValue("");
      expect(
        within(first).queryByRole("button", { name: t.later }),
      ).not.toBeInTheDocument();
      for (const doc of documents)
        expect(within(first).queryByText(doc.fileName)).not.toBeInTheDocument();
      fireEvent.change(within(first).getByRole("textbox"), {
        target: { value: "invalid" },
      });
      expect(
        within(first).getByRole("button", { name: t.continue }),
      ).toBeDisabled();
      await user.clear(within(first).getByRole("textbox"));
      await user.type(within(first).getByRole("textbox"), "ab1c");
      expect(within(first).getByRole("textbox")).toHaveValue("AB1C");
      await enterVin(user, t, correct.toLowerCase());
      const sheet = screen.getByRole("dialog", { name: t.documentsTitle });
      expect(within(sheet).queryByRole("checkbox")).not.toBeInTheDocument();
      const progress = within(sheet).getByRole("progressbar", {
        name: t.progressLabel,
      });
      expect(progress).toHaveAttribute("aria-valuenow", "1");
      expect(progress).toHaveAttribute("aria-valuemax", "2");
      expect(progress.querySelectorAll("li")).toHaveLength(2);
      const preview = within(sheet).getByRole("region", {
        name: messages[locale].scooters.documents.preview.replace(
          "{name}",
          "registration.pdf",
        ),
      });
      expect(
        within(preview).getByRole("img", { name: "registration.pdf" }),
      ).toBeInTheDocument();
      expect(
        preview.querySelector('[data-slot="document-preview-header"] button'),
      ).toBeNull();
      expect(within(sheet).getByText(correct)).toBeInTheDocument();
      const next = within(sheet).getByRole("button", {
        name: t.waitToConfirm
          .replace("{action}", t.confirmAndNext)
          .replace("{seconds}", "3"),
      });
      expect(next).toBeDisabled();
      tick(1000);
      expect(next).toHaveTextContent("2s");
      tick(1999);
      expect(next).toBeDisabled();
      tick(1);
      expect(next).toBeEnabled();
      await user.click(next);
      expect(onApply).not.toHaveBeenCalled();
      expect(within(sheet).getByRole("progressbar")).toHaveAttribute(
        "aria-valuenow",
        "2",
      );
      expect(within(sheet).queryByRole("img")).not.toBeInTheDocument();
      const finish = within(sheet).getByRole("button", {
        name: t.waitToConfirm
          .replace("{action}", t.confirmAndFinish)
          .replace("{seconds}", "3"),
      });
      expect(finish).toBeDisabled();
      tick(3000);
      await user.click(finish);
      expect(onApply).toHaveBeenCalledExactlyOnceWith(
        [
          { sourceId: "registration", previousVin: misread, vin: correct },
          { sourceId: "insurance", previousVin: null, vin: correct },
        ],
        correct,
      );
    },
  );

  it("resets document progress and the review pause after changing the VIN", async () => {
    const { user, t, onApply } = setup();
    await enterVin(user, t);
    tick(3000);
    await user.click(screen.getByRole("button", { name: t.confirmAndNext }));
    await user.click(screen.getByRole("button", { name: t.back }));
    await enterVin(user, t, misread);
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "1",
    );
    expect(screen.getByRole("button", { name: /3s/ })).toBeDisabled();
    tick(3000);
    await user.keyboard("{Escape}");
    expect(
      screen.getByRole("dialog", { name: t.documentsTitle }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: t.confirmAndNext }),
    ).toBeEnabled();
    expect(onApply).not.toHaveBeenCalled();
  });

  it("requires VIN and document validation despite Escape or outside presses", async () => {
    const { user, t, onApply } = setup();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog", { name: t.title })).toBeInTheDocument();
    fireEvent.click(
      document.querySelector('[data-slot="bottom-sheet-overlay"]')!,
    );
    expect(screen.getByRole("dialog", { name: t.title })).toBeInTheDocument();
    await enterVin(user, t);
    await user.keyboard("{Escape}");
    const sheet = screen.getByRole("dialog", { name: t.documentsTitle });
    expect(sheet).toBeInTheDocument();
    expect(
      sheet.closest('[data-slot="bottom-sheet-viewport"]'),
    ).toHaveAttribute("data-base-ui-swipe-ignore");
    expect(sheet.querySelector('[data-slot="bottom-sheet-handle"]')).toBeNull();
    fireEvent.click(
      document.querySelector('[data-slot="bottom-sheet-overlay"]')!,
    );
    expect(sheet).toBeInTheDocument();
    expect(within(sheet).getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "1",
    );
    expect(onApply).not.toHaveBeenCalled();
    tick(3000);
    await user.click(screen.getByRole("button", { name: t.confirmAndNext }));
    tick(3000);
    await user.click(screen.getByRole("button", { name: t.confirmAndFinish }));
    expect(onApply).toHaveBeenCalledOnce();
    expect(sheet).toHaveAttribute("data-closed");
  });

  it("keeps the distinct sheet surface throughout both steps", async () => {
    const { user, t } = setup();
    const first = screen.getByRole("dialog", { name: t.title });
    expect(first).toHaveClass("bg-popover");
    expect(first.querySelector(".bg-background")).toBeNull();
    await enterVin(user, t);
    const second = screen.getByRole("dialog", { name: t.documentsTitle });
    expect(second).toHaveClass("bg-popover");
    expect(second.querySelector(".bg-background")).toBeNull();
  });

  it("renders the shared PDF preview in the same sheet as the verified VIN", async () => {
    const { user, t } = setup("en", [
      {
        ...documents[1]!,
        src: "https://example.test/registration.pdf",
        contentType: "application/pdf",
      },
    ]);
    await enterVin(user, t);
    const sheet = screen.getByRole("dialog", { name: t.documentsTitle });
    const preview = within(sheet).getByRole("region", {
      name: "Preview registration.pdf",
    });
    expect(preview.querySelector("[data-slot=pdf-preview]")).not.toBeNull();
    expect(within(sheet).getByText(correct)).toBeInTheDocument();
    expect(
      within(sheet).getByText(`AI reading: ${misread}`),
    ).toBeInTheDocument();
  });
});
