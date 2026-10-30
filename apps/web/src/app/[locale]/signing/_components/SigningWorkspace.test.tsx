import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { messages } from "@repo/i18n";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SigningWorkspace } from "./SigningWorkspace";

vi.mock("@repo/ui/components/pdf-preview", () => ({
  PdfPreview: ({
    onPageRendered,
  }: {
    onPageRendered: (page: number, total: number, text: string) => void;
  }) => (
    <button onClick={() => onPageRendered(1, 1, "Exact PDF document text")}>
      Render document end
    </button>
  ),
}));
vi.mock("@repo/ui/components/signature-capture", () => ({
  SignatureCapture: ({
    onChange,
    disabled,
    label,
  }: {
    onChange: (value: string) => void;
    disabled: boolean;
    label: string;
  }) => (
    <button
      disabled={disabled}
      onClick={() =>
        onChange(
          label.includes("limiter")
            ? "data:image/png;base64,limiter-signature"
            : "data:image/png;base64,drawn-signature",
        )
      }
    >
      {label.includes("limiter") ? "Draw limiter signature" : "Draw signature"}
    </button>
  ),
}));
const hash = "a".repeat(64);
const state = () => ({
  packageId: "package",
  manifestHash: hash,
  phoneMasked: "+40******123",
  phoneVerified: true,
  identityStatus: "approved",
  selfieNotice: "Approved notice for identity processing",
  selfieNoticeVersion: "1",
  signingAcceptanceText:
    "I accept this approved agreement and its payment obligation.",
  finalOtpRequired: false,
  finalOtpVerified: false,
  customerCompletedAt: null,
  documents: [
    {
      id: "agreement",
      type: "RENTAL_AGREEMENT",
      templateVersionId: "v1",
      contentHash: hash,
      signedHash: null,
      status: "published",
      signedAt: null,
      requiresLimiterSignature: false,
      acceptanceText:
        "I accept this approved agreement and its payment obligation.",
      limiterAcceptanceText: null,
    },
  ],
});
beforeEach(() => {
  window.history.replaceState(null, "", "/signing");
  localStorage.clear();
});
afterEach(() => vi.unstubAllGlobals());
function show() {
  render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <SigningWorkspace />
    </NextIntlClientProvider>,
  );
}

it("does not consume an invitation through GET and removes the URL token after explicit exchange", async () => {
  const token = "a".repeat(43);
  window.history.replaceState(null, "", `/signing#token=${token}`);
  const fetch = vi.fn().mockImplementation(async () => Response.json(state()));
  vi.stubGlobal("fetch", fetch);
  show();
  await screen.findByRole("button", { name: "Open secure signing session" });
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: "Open secure signing session" }),
  );
  await waitFor(() => expect(window.location.hash).toBe(""));
  expect(fetch.mock.calls[0]![0]).toBe("/api/signing/session");
  expect(fetch.mock.calls[0]![1].body).toBe(JSON.stringify({ token }));
  expect(localStorage.length).toBe(0);
});

it("requires the loaded document end, approved acceptance and a fresh signature", async () => {
  const fetch = vi.fn().mockImplementation(async () => Response.json(state()));
  vi.stubGlobal("fetch", fetch);
  show();
  const sign = await screen.findByRole("button", {
    name: "Sign agreement with payment obligation",
  });
  expect(sign).toBeDisabled();
  expect(
    screen.getByRole("checkbox", { name: state().signingAcceptanceText }),
  ).toHaveAttribute("aria-disabled", "true");
  fireEvent.click(screen.getByRole("button", { name: "Render document end" }));
  fireEvent.click(
    screen.getByRole("checkbox", { name: state().signingAcceptanceText }),
  );
  expect(sign).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Draw signature" }));
  expect(sign).toBeEnabled();
  fireEvent.click(sign);
  await waitFor(() =>
    expect(
      fetch.mock.calls.some(
        ([url]) => url === "/api/signing/documents/agreement/sign",
      ),
    ).toBe(true),
  );
  const signing = fetch.mock.calls.find(
    ([url]) => url === "/api/signing/documents/agreement/sign",
  )!;
  expect(JSON.parse(signing[1].body)).toEqual({
    contentHash: hash,
    acceptance: true,
    signaturePng: "data:image/png;base64,drawn-signature",
  });
});

it("lets an unapproved customer view documents while keeping signing unavailable", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockImplementation(async () =>
        Response.json({ ...state(), identityStatus: "submitted" }),
      ),
  );
  show();
  await screen.findByRole("button", { name: "Render document end" });
  expect(screen.getByRole("button", { name: "Draw signature" })).toBeDisabled();
  expect(
    screen.getByRole("button", {
      name: "Sign agreement with payment obligation",
    }),
  ).toBeDisabled();
  expect(
    screen.getByText(
      "An authorized operator must review your identity before you can finish signing.",
    ),
  ).toBeVisible();
});

it("records the main technical signature before a separate limiter act and resumes the pending act", async () => {
  let current = {
    ...state(),
    documents: [
      {
        ...state().documents[0]!,
        id: "technical",
        type: "TECHNICAL_HANDOVER",
        acceptanceText: "I confirm the actual technical handover details.",
        requiresLimiterSignature: true,
        limiterAcceptanceText:
          "I personally verified the documented limiter threshold.",
        signedAt: null as string | null,
        limiterSignedAt: null as string | null,
      },
    ],
  };
  const fetch = vi.fn().mockImplementation(async (url: string) => {
    if (url.endsWith("/sign"))
      current = {
        ...current,
        documents: [
          { ...current.documents[0]!, signedAt: "2026-10-30T12:00:00.000Z" },
        ],
      };
    if (url.endsWith("/sign-limiter"))
      current = {
        ...current,
        documents: [
          {
            ...current.documents[0]!,
            limiterSignedAt: "2026-10-30T12:01:00.000Z",
          },
        ],
      };
    return Response.json(current);
  });
  vi.stubGlobal("fetch", fetch);
  show();
  await screen.findByRole("button", { name: "Render document end" });
  fireEvent.click(screen.getByRole("button", { name: "Render document end" }));
  fireEvent.click(
    screen.getByRole("checkbox", {
      name: "I confirm the actual technical handover details.",
    }),
  );
  fireEvent.click(
    screen.getByRole("checkbox", {
      name: "I am physically present and have verified the handover and documented speed configuration.",
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Draw signature" }));
  fireEvent.click(screen.getByRole("button", { name: "Sign this document" }));
  const limiter = await screen.findByRole("button", {
    name: "Sign the separate limiter verification",
  });
  expect(limiter).toBeDisabled();
  expect(
    screen.queryByRole("button", { name: "Confirm document package" }),
  ).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("checkbox", {
      name: "I personally verified the documented limiter threshold.",
    }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Draw limiter signature" }),
  );
  fireEvent.click(limiter);
  await screen.findByRole("button", { name: "Confirm document package" });
  const acts = fetch.mock.calls.filter(([url]) =>
    /\/sign(-limiter)?$/.test(url),
  );
  expect(acts.map(([url]) => url)).toEqual([
    "/api/signing/documents/technical/sign",
    "/api/signing/documents/technical/sign-limiter",
  ]);
  expect(JSON.parse(acts[0]![1].body).signaturePng).not.toBe(
    JSON.parse(acts[1]![1].body).signaturePng,
  );
});
