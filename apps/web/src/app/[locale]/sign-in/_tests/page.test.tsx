import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SignInPage from "../page";

const mocks = vi.hoisted(() => ({ theme: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: mocks.theme }) }),
}));
vi.mock("@/lib/auth-server", () => ({ meOnServer: async () => null }));
vi.mock("@/lib/api", () => ({
  webApi: { fetch: async () => ({ methods: [] }) },
}));
vi.mock("@/components/LanguageSwitcher", () => ({
  LanguageSwitcher: () => null,
}));
vi.mock("@/components/auth", () => ({
  SignInMethods: () => <form aria-label="Sign in" />,
}));

describe("sign-in logo", () => {
  it.each([
    { theme: "light", media: "not all" },
    { theme: "dark", media: "all" },
    { theme: undefined, media: "(prefers-color-scheme: dark)" },
  ])(
    "renders one horizontal logo for theme $theme",
    async ({ theme, media }) => {
      mocks.theme = theme;
      render(
        await SignInPage({
          params: Promise.resolve({ locale: "en" }),
          searchParams: Promise.resolve({}),
        }),
      );
      // Keep a single rendered image: CSS visibility must never expose two logos.
      const images = screen.getAllByRole("img", {
        name: "Scooter City",
        hidden: true,
      });
      expect(images).toHaveLength(1);
      expect(images[0]).toHaveAttribute(
        "src",
        "/logo/scooter-city-logo-horizontal-dark.svg",
      );
      const picture = images[0]!.closest("picture")!;
      expect(picture.querySelector("source")).toHaveAttribute("media", media);
      expect(picture.querySelector("source")).toHaveAttribute(
        "srcset",
        "/logo/scooter-city-logo-horizontal-light.svg",
      );
      expect(
        picture.compareDocumentPosition(
          screen.getByRole("form", { name: "Sign in" }),
        ) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    },
  );
});
