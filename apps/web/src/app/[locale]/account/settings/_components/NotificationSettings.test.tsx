import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { messages } from "@repo/i18n";
import { v1 } from "@repo/api-shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationSettings } from "./NotificationSettings";

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/lib/api", () => ({ webApi: { fetch: mocks.fetch } }));
vi.mock("@/components/auth/SessionProvider", () => ({
  useSession: () => ({ user: { id: "mechanic" } }),
}));

function show(element: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      {element}
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  mocks.fetch.mockReset();
  mocks.fetch.mockImplementation((path: string) =>
    Promise.resolve(
      path === v1.notifications.ROUTES.preferences
        ? { pushEnabled: true, mutedCategories: [] }
        : { configured: false, publicKey: null },
    ),
  );
});

describe("notification preferences", () => {
  it("preserves the selection and action label on failure and blocks Enter resubmission while pending", async () => {
    let fail: (() => void) | undefined;
    mocks.fetch.mockImplementation(
      (path: string, _schema: unknown, options?: { method?: string }) => {
        if (options?.method === "PATCH")
          return new Promise((_resolve, reject) => {
            fail = () => reject(new Error("unavailable"));
          });
        return Promise.resolve(
          path.includes("preferences")
            ? { pushEnabled: true, mutedCategories: [] }
            : { configured: false, publicKey: null },
        );
      },
    );
    show(<NotificationSettings />);
    const toggle = await screen.findByRole("switch", {
      name: "Allow push notifications",
    });
    fireEvent.click(toggle);
    const submit = screen.getByRole("button", {
      name: "Save notification preferences",
    });
    const form = submit.closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(
      mocks.fetch.mock.calls.filter(
        ([, , options]) => options?.method === "PATCH",
      ),
    ).toHaveLength(1);
    expect(submit).toBeDisabled();
    await act(async () => {
      fail?.();
    });
    expect(
      screen.getByRole("button", { name: "Save notification preferences" }),
    ).toBeEnabled();
    expect(toggle).not.toBeChecked();
    expect(
      screen.getByText(
        "Your preferences could not be saved. Your selections have been kept.",
      ),
    ).toBeInTheDocument();
  });
});
