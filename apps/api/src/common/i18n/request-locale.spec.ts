import { getRequestLocale } from "./request-locale";

describe("getRequestLocale", () => {
  it("prefers X-Locale over Accept-Language", () => {
    expect(
      getRequestLocale({
        headers: {
          "x-locale": "ro",
          "accept-language": "en-US,en;q=0.9",
        },
      }),
    ).toBe("ro");
  });

  it("uses Accept-Language before the API fallback", () => {
    expect(
      getRequestLocale({
        headers: {
          "accept-language": "fr-CA;q=0.9,en;q=0.8,ro;q=0.7",
        },
      }),
    ).toBe("en");
  });

  it("falls back to English for unsupported API locales", () => {
    expect(
      getRequestLocale({
        headers: {
          "x-locale": "de",
          "accept-language": "fr-CA,fr;q=0.9",
        },
      }),
    ).toBe("en");
  });
});
