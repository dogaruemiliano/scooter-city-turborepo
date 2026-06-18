import { ApiError, v1 } from "@repo/api-shared";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SessionProvider } from "./SessionProvider";
import { SignInMethods } from "./SignInMethods";

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("../../lib/api", () => ({
  webApi: {
    fetch: mocks.apiFetch,
  },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/sign-in",
  useRouter: () => ({
    replace: mocks.replace,
    refresh: mocks.refresh,
  }),
  useSearchParams: () => new URLSearchParams("next=/dashboard"),
}));

vi.mock("next/script", async () => {
  const React = await import("react");

  return {
    default: function MockScript({ onReady }: { onReady?: () => void }) {
      React.useEffect(() => {
        onReady?.();
      }, [onReady]);
      return null;
    },
  };
});

const enabledAll: readonly v1.auth.AuthMethodId[] = [
  "emailOtp",
  "google",
  "apple",
];

const user: v1.auth.SessionUser = {
  id: "user-1",
  email: "person@example.com",
  emailVerified: "2026-06-10T10:00:00.000Z",
  phone: null,
  phoneVerified: null,
  firstName: null,
  lastName: null,
  roles: ["USER"],
  linkedProviders: [],
  createdAt: "2026-06-10T10:00:00.000Z",
};

const tokenPair: v1.auth.TokenPair = {
  accessToken: "access-token",
  refreshToken: "refresh-token",
};

let googleCredentialCallback:
  | ((response: { credential: string }) => void | Promise<void>)
  | undefined;
const renderGoogleButton =
  vi.fn<(parent: HTMLElement, options: unknown) => void>();

beforeEach(() => {
  mocks.apiFetch.mockReset();
  mocks.replace.mockReset();
  mocks.refresh.mockReset();
  googleCredentialCallback = undefined;
  renderGoogleButton.mockReset();

  window.google = {
    accounts: {
      id: {
        initialize: ({ callback }) => {
          googleCredentialCallback = callback;
        },
        renderButton: (parent, options) => {
          renderGoogleButton(parent, options);
        },
      },
    },
  };
});

afterEach(() => {
  vi.useRealTimers();
  delete window.google;
});

describe("SignInMethods", () => {
  it.each([
    {
      name: "email only",
      enabledMethods: ["emailOtp"] as const,
      googleClientId: "google-client-id",
      emailVisible: true,
      googleVisible: false,
      separatorVisible: false,
      unavailableVisible: false,
    },
    {
      name: "Google only",
      enabledMethods: ["google"] as const,
      googleClientId: "google-client-id",
      emailVisible: false,
      googleVisible: true,
      separatorVisible: false,
      unavailableVisible: false,
    },
    {
      name: "Google without a client ID",
      enabledMethods: ["google"] as const,
      googleClientId: undefined,
      emailVisible: false,
      googleVisible: false,
      separatorVisible: false,
      unavailableVisible: true,
    },
    {
      name: "email and Google",
      enabledMethods: ["emailOtp", "google"] as const,
      googleClientId: "google-client-id",
      emailVisible: true,
      googleVisible: true,
      separatorVisible: true,
      unavailableVisible: false,
    },
    {
      name: "Apple only",
      enabledMethods: ["apple"] as const,
      googleClientId: "google-client-id",
      emailVisible: false,
      googleVisible: false,
      separatorVisible: false,
      unavailableVisible: true,
    },
    {
      name: "no methods",
      enabledMethods: [] as const,
      googleClientId: "google-client-id",
      emailVisible: false,
      googleVisible: false,
      separatorVisible: false,
      unavailableVisible: true,
    },
  ])(
    "renders supported controls for $name",
    ({
      enabledMethods,
      googleClientId,
      emailVisible,
      googleVisible,
      separatorVisible,
      unavailableVisible,
    }) => {
      renderSignInMethods({ enabledMethods, googleClientId });

      expect(Boolean(screen.queryByLabelText("Email"))).toBe(emailVisible);
      expect(renderGoogleButton.mock.calls.length > 0).toBe(googleVisible);
      expect(Boolean(screen.queryByText("or"))).toBe(separatorVisible);
      expect(
        Boolean(
          screen.queryByText(
            "No sign-in methods are available on the web. Contact an administrator.",
          ),
        ),
      ).toBe(unavailableVisible);
    },
  );

  it("completes email OTP sign-in through the shared challenge form", async () => {
    const challenge = createChallenge("00000000-0000-4000-8000-000000000001");
    mocks.apiFetch.mockImplementation(async (route: string) => {
      if (route === v1.auth.ROUTES.emailOtp.request) return challenge;
      if (route === v1.auth.ROUTES.emailOtp.verify) return tokenPair;
      if (route === v1.auth.ROUTES.me) return user;
      throw new Error(`Unexpected route: ${route}`);
    });
    const browser = userEvent.setup();

    renderSignInMethods();
    await browser.type(screen.getByLabelText("Email"), user.email);
    await browser.click(screen.getByRole("button", { name: "Send code" }));

    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
    expect(screen.getByText(`Code sent to ${user.email}`)).toBeInTheDocument();

    await browser.type(getOtpInput(), "000000");
    await browser.click(screen.getByRole("button", { name: "Sign in" }));

    expect(mocks.apiFetch).toHaveBeenCalledWith(
      v1.auth.ROUTES.emailOtp.verify,
      v1.auth.tokenPairSchema,
      {
        method: "POST",
        json: {
          challengeId: challenge.challengeId,
          code: "000000",
        },
      },
    );
    expect(mocks.replace).toHaveBeenCalledWith("/dashboard");
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("completes direct Google sign-in", async () => {
    mocks.apiFetch.mockImplementation(async (route: string) => {
      if (route === v1.auth.ROUTES.google) return tokenPair;
      if (route === v1.auth.ROUTES.me) return user;
      throw new Error(`Unexpected route: ${route}`);
    });

    renderSignInMethods({ enabledMethods: ["google"] });
    await triggerGoogleCredential("google-id-token-direct");

    expect(mocks.apiFetch).toHaveBeenCalledWith(
      v1.auth.ROUTES.google,
      v1.auth.oauthSignInResultSchema,
      {
        method: "POST",
        json: { idToken: "google-id-token-direct" },
      },
    );
    expect(mocks.replace).toHaveBeenCalledWith("/dashboard");
  });

  it("verifies a Google email challenge and hides other methods", async () => {
    const challenge = createChallenge("00000000-0000-4000-8000-000000000002");
    mocks.apiFetch.mockImplementation(async (route: string) => {
      if (route === v1.auth.ROUTES.google) return challenge;
      if (route === v1.auth.ROUTES.oauthEmailVerification.verify) {
        return tokenPair;
      }
      if (route === v1.auth.ROUTES.me) return user;
      throw new Error(`Unexpected route: ${route}`);
    });
    const browser = userEvent.setup();

    renderSignInMethods();
    await triggerGoogleCredential("google-id-token-challenge");

    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
    expect(renderGoogleButton).toHaveBeenCalledOnce();
    expect(
      screen.getByText(/Google could not verify the account email/),
    ).toBeInTheDocument();

    await browser.type(getOtpInput(), "000000");
    await browser.click(screen.getByRole("button", { name: "Sign in" }));

    expect(mocks.apiFetch).toHaveBeenCalledWith(
      v1.auth.ROUTES.oauthEmailVerification.verify,
      v1.auth.tokenPairSchema,
      {
        method: "POST",
        json: {
          challengeId: challenge.challengeId,
          code: "000000",
        },
      },
    );
  });

  it("resends an active challenge without replacing its ID", async () => {
    const challenge = createChallenge("00000000-0000-4000-8000-000000000003", {
      resendAfterSec: 0,
    });
    const resent = { ...challenge, resendAfterSec: 30 };
    mocks.apiFetch.mockImplementation(async (route: string) => {
      if (route === v1.auth.ROUTES.emailOtp.request) return challenge;
      if (route === v1.auth.ROUTES.otp.resend) return resent;
      throw new Error(`Unexpected route: ${route}`);
    });
    const browser = userEvent.setup();

    renderSignInMethods();
    await browser.type(screen.getByLabelText("Email"), user.email);
    await browser.click(screen.getByRole("button", { name: "Send code" }));
    await browser.click(screen.getByRole("button", { name: "Resend code" }));

    expect(mocks.apiFetch).toHaveBeenCalledWith(
      v1.auth.ROUTES.otp.resend,
      v1.auth.otpChallengeMetadataSchema,
      {
        method: "POST",
        json: { challengeId: challenge.challengeId },
      },
    );
    expect(
      screen.getByRole("button", { name: "Resend in 0:30" }),
    ).toBeDisabled();
  });

  it("renews an expired email challenge without asking for the email again", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-10T10:00:00.000Z"));
    const first = createChallenge("00000000-0000-4000-8000-000000000004", {
      expiresInSec: 1,
    });
    const replacement = createChallenge("00000000-0000-4000-8000-000000000005");
    mocks.apiFetch
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(replacement);

    renderSignInMethods();
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: user.email },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Send code" }));
    });
    expect(screen.getByText(`Code sent to ${user.email}`)).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(1_000);
    });
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Request another code" }),
      );
    });

    expect(mocks.apiFetch).toHaveBeenCalledTimes(2);
    expect(mocks.apiFetch).toHaveBeenLastCalledWith(
      v1.auth.ROUTES.emailOtp.request,
      v1.auth.emailOtpChallengeSchema,
      {
        method: "POST",
        json: { email: user.email },
      },
    );
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
    expect(screen.getByText("Code expires in 10:00.")).toBeInTheDocument();
  });

  it("reuses the in-memory Google token after expiry", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-10T10:00:00.000Z"));
    const first = createChallenge("00000000-0000-4000-8000-000000000006", {
      expiresInSec: 1,
    });
    const replacement = createChallenge("00000000-0000-4000-8000-000000000007");
    mocks.apiFetch
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(replacement);

    renderSignInMethods({ enabledMethods: ["google"] });
    await triggerGoogleCredential("google-id-token-renew");
    await act(async () => {
      vi.advanceTimersByTime(1_000);
    });
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Request another code" }),
      );
    });

    expect(mocks.apiFetch).toHaveBeenCalledTimes(2);
    expect(mocks.apiFetch).toHaveBeenNthCalledWith(
      2,
      v1.auth.ROUTES.google,
      v1.auth.oauthSignInResultSchema,
      {
        method: "POST",
        json: { idToken: "google-id-token-renew" },
      },
    );
    expect(renderGoogleButton).toHaveBeenCalledOnce();
    expect(screen.getByText("Code expires in 10:00.")).toBeInTheDocument();
  });

  it("returns to the Google button when the retained token is rejected", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-10T10:00:00.000Z"));
    const challenge = createChallenge("00000000-0000-4000-8000-000000000008", {
      expiresInSec: 1,
    });
    mocks.apiFetch
      .mockResolvedValueOnce(challenge)
      .mockRejectedValueOnce(
        new ApiError(401, "Invalid Google ID token", "UNAUTHORIZED"),
      );

    renderSignInMethods({ enabledMethods: ["google"] });
    await triggerGoogleCredential("google-id-token-rejected");
    await act(async () => {
      vi.advanceTimersByTime(1_000);
    });
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Request another code" }),
      );
    });

    expect(
      screen.getByText(
        "Your Google sign-in expired. Continue with Google again.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("group", { name: "6-digit code" }),
    ).not.toBeInTheDocument();
    expect(renderGoogleButton).toHaveBeenCalledTimes(2);
  });

  it("discards the Google challenge and provider token after a remount", async () => {
    const challenge = createChallenge("00000000-0000-4000-8000-000000000011");
    mocks.apiFetch.mockResolvedValueOnce(challenge);

    const view = renderSignInMethods({
      enabledMethods: ["google"],
    });
    await triggerGoogleCredential("google-id-token-reload");
    expect(
      screen.getByRole("group", { name: "6-digit code" }),
    ).toBeInTheDocument();

    view.unmount();
    renderSignInMethods({ enabledMethods: ["google"] });
    await act(async () => {});

    expect(
      screen.queryByRole("group", { name: "6-digit code" }),
    ).not.toBeInTheDocument();
    expect(renderGoogleButton).toHaveBeenCalledTimes(2);
    expect(mocks.apiFetch).toHaveBeenCalledOnce();
  });

  it("supports cancellation and reports invalid codes", async () => {
    const first = createChallenge("00000000-0000-4000-8000-000000000009");
    const second = createChallenge("00000000-0000-4000-8000-000000000010");
    mocks.apiFetch
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second)
      .mockRejectedValueOnce(
        new ApiError(401, "Invalid or expired code.", "UNAUTHORIZED"),
      );
    const browser = userEvent.setup();

    renderSignInMethods();
    await browser.type(screen.getByLabelText("Email"), user.email);
    await browser.click(screen.getByRole("button", { name: "Send code" }));
    await browser.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByLabelText("Email")).toHaveValue("");

    await browser.type(screen.getByLabelText("Email"), user.email);
    await browser.click(screen.getByRole("button", { name: "Send code" }));
    await browser.type(getOtpInput(), "111111");
    await browser.click(screen.getByRole("button", { name: "Sign in" }));

    expect(
      await screen.findByText("Invalid or expired code."),
    ).toBeInTheDocument();
  });
});

function getOtpInput(): HTMLInputElement {
  const input = screen
    .getByRole("group", { name: "6-digit code" })
    .querySelector<HTMLInputElement>('[data-slot="otp-field-input"]');

  if (!input) {
    throw new Error("Expected OTP field to contain an input");
  }

  return input;
}

function renderSignInMethods(
  props: Partial<ComponentProps<typeof SignInMethods>> = {},
) {
  return render(
    <SessionProvider initialUser={null}>
      <SignInMethods
        enabledMethods={enabledAll}
        googleClientId="google-client-id"
        {...props}
      />
    </SessionProvider>,
  );
}

async function triggerGoogleCredential(credential: string) {
  await act(async () => {});
  expect(googleCredentialCallback).toBeTypeOf("function");
  await act(async () => {
    await googleCredentialCallback?.({ credential });
  });
}

function createChallenge(
  challengeId: string,
  overrides: Partial<v1.auth.OtpChallengeMetadata> = {},
): v1.auth.OtpChallengeMetadata {
  return {
    status: "verification_required",
    challengeId,
    expiresInSec: 600,
    resendAfterSec: 30,
    ...overrides,
  };
}
