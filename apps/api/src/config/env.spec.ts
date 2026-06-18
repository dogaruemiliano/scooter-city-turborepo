import { loadEnv } from "./env";

function validEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    SMTP_HOST: "smtp.example.com",
    SMTP_PORT: "587",
    SMTP_USER: "test-user",
    SMTP_PASSWORD: "test-password",
    ...overrides,
  };
}

describe("environment schema", () => {
  it.each(["SMTP_USER", "SMTP_PASSWORD"] as const)("requires %s", (key) => {
    const source = validEnv();
    delete source[key];

    expect(() => loadEnv(source)).toThrow(key);
  });

  it("defaults HEALTH_MAX_HEAP_MB to 300", () => {
    const source = validEnv();
    delete source.HEALTH_MAX_HEAP_MB;

    expect(loadEnv(source).HEALTH_MAX_HEAP_MB).toBe(300);
  });

  it("parses a positive HEALTH_MAX_HEAP_MB override", () => {
    expect(
      loadEnv(validEnv({ HEALTH_MAX_HEAP_MB: "1024" })).HEALTH_MAX_HEAP_MB,
    ).toBe(1024);
  });

  it("rejects non-positive HEALTH_MAX_HEAP_MB values", () => {
    expect(() => loadEnv(validEnv({ HEALTH_MAX_HEAP_MB: "0" }))).toThrow(
      "HEALTH_MAX_HEAP_MB",
    );
  });
});
