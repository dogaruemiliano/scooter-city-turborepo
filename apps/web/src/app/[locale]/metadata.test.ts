import { describe, expect, it, vi } from "vitest";

import { generateMetadata as generateAccountSettingsMetadata } from "./account/settings/page";
import { generateMetadata as generateDashboardMetadata } from "./page";
import { generateMetadata as generatePersonsMetadata } from "./persons/page";
import { generateMetadata as generateNewPersonMetadata } from "./persons/new/page";
import { generateMetadata as generateScootersMetadata } from "./scooters/page";
import { generateMetadata as generateNewScooterMetadata } from "./scooters/new/page";
import { generateMetadata as generateSignInMetadata } from "./sign-in/page";

const mocks = vi.hoisted(() => ({
  activeSessionsFromApi: vi.fn(),
  apiFetch: vi.fn(),
  meFromApi: vi.fn(),
  meOnServer: vi.fn(),
  notFound: vi.fn(),
  redirect: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  webApi: {
    fetch: mocks.apiFetch,
  },
}));

vi.mock("@/lib/auth-server", () => ({
  activeSessionsFromApi: mocks.activeSessionsFromApi,
  meFromApi: mocks.meFromApi,
  meOnServer: mocks.meOnServer,
}));

vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
  redirect: mocks.redirect,
  usePathname: () => "/",
  useRouter: () => ({
    refresh: vi.fn(),
    replace: mocks.replace,
  }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next-intl/navigation", async () => {
  const { createElement } = await import("react");

  return {
    createNavigation: () => ({
      Link: ({ href, ...props }: { href: string }) =>
        createElement("a", { href, ...props }),
      getPathname: () => "/",
      redirect: mocks.redirect,
      usePathname: () => "/",
      useRouter: () => ({
        replace: mocks.replace,
      }),
    }),
  };
});

describe("localized route metadata", () => {
  it("returns static titles for localized pages", async () => {
    await expect(metadataTitle(generateDashboardMetadata, "ro")).resolves.toBe(
      "Scooter City",
    );
    await expect(metadataTitle(generatePersonsMetadata, "ro")).resolves.toBe(
      "Persoane",
    );
    await expect(metadataTitle(generateNewPersonMetadata, "ro")).resolves.toBe(
      "Adaugă persoană",
    );
    await expect(metadataTitle(generateScootersMetadata, "ro")).resolves.toBe(
      "Scutere",
    );
    await expect(metadataTitle(generateNewScooterMetadata, "ro")).resolves.toBe(
      "Adaugă scuter",
    );
    await expect(metadataTitle(generateSignInMetadata, "ro")).resolves.toBe(
      "Autentificare",
    );
    await expect(
      metadataTitle(generateAccountSettingsMetadata, "en"),
    ).resolves.toBe("Account settings");
  });
});

async function metadataTitle(
  generateMetadata: (props: {
    params: Promise<{ locale: string }>;
  }) => Promise<{ title?: unknown }>,
  locale: string,
) {
  const metadata = await generateMetadata({
    params: Promise.resolve({ locale }),
  });

  return metadata.title;
}
