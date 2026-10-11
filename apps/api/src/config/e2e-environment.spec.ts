describe("E2E database selection", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
  });

  const loadSetup = () =>
    jest.isolateModulesAsync(async () => {
      await import("../../test/setup-e2e-env.js");
    });

  it.each([undefined, "", "   "])(
    "refuses to fall back to the development database when URL is %s",
    async (url) => {
      if (url === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = url;

      await expect(loadSetup()).rejects.toThrow(
        "E2E tests require an explicit DATABASE_URL",
      );
      expect(process.env.DATABASE_URL).toBe(url);
    },
  );

  it("preserves an explicit isolated database URL", async () => {
    const url = "postgresql://app:app@localhost:55434/test_database";
    process.env.DATABASE_URL = url;

    await expect(loadSetup()).resolves.toBeUndefined();
    expect(process.env.DATABASE_URL).toBe(url);
  });
});
