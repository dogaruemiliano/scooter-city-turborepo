import { buildCorsOrigins } from "./cors";

describe("buildCorsOrigins", () => {
  it("includes APP_BASE_URL automatically", () => {
    expect(
      buildCorsOrigins({
        APP_BASE_URL: "https://scooter-city.ro",
        CORS_ORIGINS: [],
      }),
    ).toEqual(["https://scooter-city.ro"]);
  });

  it("normalizes and deduplicates configured origins", () => {
    expect(
      buildCorsOrigins({
        APP_BASE_URL: "https://scooter-city.ro/dashboard",
        CORS_ORIGINS: [
          "https://scooter-city.ro",
          "https://www.scooter-city.ro",
          "https://www.scooter-city.ro/sign-in",
        ],
      }),
    ).toEqual(["https://scooter-city.ro", "https://www.scooter-city.ro"]);
  });
});
