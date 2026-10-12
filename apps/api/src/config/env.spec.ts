import { loadEnv } from "./env";

function validEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    SMTP_HOST: "smtp.example.com",
    SMTP_PORT: "587",
    SMTP_USER: "test-user",
    SMTP_PASSWORD: "test-password",
    IMAGE_STORAGE_S3_BUCKET: "test-private-document-photos",
    IMAGE_STORAGE_S3_REGION: "eu-central-1",
    IMAGE_STORAGE_UPLOAD_TOKEN_SECRET: "i".repeat(32),
    ...overrides,
  };
}

describe("environment schema", () => {
  it("keeps background extraction disabled until explicitly enabled", () => {
    const source = validEnv();
    delete source.SCOOTER_DOCUMENT_EXTRACTION_JOBS_ENABLED;
    expect(loadEnv(source).SCOOTER_DOCUMENT_EXTRACTION_JOBS_ENABLED).toBe(
      false,
    );
  });

  it.each([
    "SCOOTER_DOCUMENT_VALIDATION_FUNCTION_NAME",
    "SCOOTER_DOCUMENT_EXTRACTION_WEBHOOK_SECRET",
  ])(
    "requires %s when production OpenAI background jobs are enabled",
    (key) => {
      const source = validEnv({
        NODE_ENV: "production",
        SCOOTER_DOCUMENT_VALIDATION_DRIVER: "lambda",
        SCOOTER_DOCUMENT_EXTRACTION_JOBS_ENABLED: "true",
        SCOOTER_DOCUMENT_EXTRACTION_DRIVER: "openai",
        SCOOTER_DOCUMENT_EXTRACTION_OPENAI_API_KEY: "test-key",
        SCOOTER_DOCUMENT_VALIDATION_FUNCTION_NAME: "test-validator",
        SCOOTER_DOCUMENT_EXTRACTION_WEBHOOK_SECRET: "test-signing-secret",
      });
      delete source[key];
      expect(() => loadEnv(source)).toThrow(key);
    },
  );

  it("allows real local background extraction without Lambda or a public webhook", () => {
    const source = validEnv({
      NODE_ENV: "development",
      SCOOTER_DOCUMENT_EXTRACTION_JOBS_ENABLED: "true",
      SCOOTER_DOCUMENT_EXTRACTION_DRIVER: "openai",
      SCOOTER_DOCUMENT_EXTRACTION_OPENAI_API_KEY: "test-key",
      SCOOTER_DOCUMENT_VALIDATION_DRIVER: "local",
    });
    delete source.SCOOTER_DOCUMENT_VALIDATION_FUNCTION_NAME;
    delete source.SCOOTER_DOCUMENT_EXTRACTION_WEBHOOK_SECRET;
    expect(loadEnv(source).SCOOTER_DOCUMENT_EXTRACTION_JOBS_ENABLED).toBe(true);
  });

  it("forbids the local validator in production even when new jobs are disabled", () => {
    expect(() =>
      loadEnv(
        validEnv({
          NODE_ENV: "production",
          SCOOTER_DOCUMENT_VALIDATION_DRIVER: "local",
          SCOOTER_DOCUMENT_EXTRACTION_JOBS_ENABLED: "false",
        }),
      ),
    ).toThrow("SCOOTER_DOCUMENT_VALIDATION_DRIVER");
  });

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

  it("requires S3 bucket and region for image storage", () => {
    const missingBucket = validEnv();
    delete missingBucket.IMAGE_STORAGE_S3_BUCKET;

    expect(() => loadEnv(missingBucket)).toThrow("IMAGE_STORAGE_S3_BUCKET");
    expect(() => loadEnv(validEnv({ IMAGE_STORAGE_S3_REGION: "" }))).toThrow(
      "IMAGE_STORAGE_S3_REGION",
    );
    expect(() =>
      loadEnv(validEnv({ IMAGE_STORAGE_UPLOAD_TOKEN_SECRET: "" })),
    ).toThrow("IMAGE_STORAGE_UPLOAD_TOKEN_SECRET");
  });

  it("keeps document extraction disabled by default", () => {
    const source = validEnv();
    delete source.DOCUMENT_EXTRACTION_DRIVER;

    expect(loadEnv(source).DOCUMENT_EXTRACTION_DRIVER).toBe("disabled");
  });

  it("accepts Textract expense analysis and rejects the fake in production", () => {
    expect(
      loadEnv(validEnv({ DOCUMENT_EXTRACTION_DRIVER: "textract" }))
        .DOCUMENT_EXTRACTION_DRIVER,
    ).toBe("textract");

    expect(() =>
      loadEnv(
        validEnv({
          NODE_ENV: "production",
          DOCUMENT_EXTRACTION_DRIVER: "fake",
        }),
      ),
    ).toThrow("DOCUMENT_EXTRACTION_DRIVER");
  });

  it("keeps person extraction disabled by default and independent from Textract", () => {
    const source = validEnv({ DOCUMENT_EXTRACTION_DRIVER: "textract" });
    delete source.PERSON_DOCUMENT_EXTRACTION_DRIVER;
    expect(loadEnv(source).PERSON_DOCUMENT_EXTRACTION_DRIVER).toBe("disabled");
  });

  it("requires a nonempty server-side key for OpenAI extraction", () => {
    expect(() =>
      loadEnv(
        validEnv({
          PERSON_DOCUMENT_EXTRACTION_DRIVER: "openai",
          PERSON_DOCUMENT_EXTRACTION_OPENAI_API_KEY: " ",
        }),
      ),
    ).toThrow("PERSON_DOCUMENT_EXTRACTION_OPENAI_API_KEY");
    expect(
      loadEnv(
        validEnv({
          PERSON_DOCUMENT_EXTRACTION_DRIVER: "openai",
          PERSON_DOCUMENT_EXTRACTION_OPENAI_API_KEY: "test-key",
        }),
      ).PERSON_DOCUMENT_EXTRACTION_MODEL,
    ).toBe("gpt-4.1-mini-2025-04-14");
  });

  it("forbids fake person extraction in production", () => {
    expect(() =>
      loadEnv(
        validEnv({
          NODE_ENV: "production",
          PERSON_DOCUMENT_EXTRACTION_DRIVER: "fake",
        }),
      ),
    ).toThrow("PERSON_DOCUMENT_EXTRACTION_DRIVER");
  });

  it.each(["0", "45001"])(
    "rejects invalid person-extraction timeout %s",
    (timeout) => {
      expect(() =>
        loadEnv(validEnv({ PERSON_DOCUMENT_EXTRACTION_TIMEOUT_MS: timeout })),
      ).toThrow("PERSON_DOCUMENT_EXTRACTION_TIMEOUT_MS");
    },
  );

  it("keeps scooter extraction independently disabled by default", () => {
    const source = validEnv({ PERSON_DOCUMENT_EXTRACTION_DRIVER: "fake" });
    delete source.SCOOTER_DOCUMENT_EXTRACTION_DRIVER;
    expect(loadEnv(source).SCOOTER_DOCUMENT_EXTRACTION_DRIVER).toBe("disabled");
  });

  it("requires a separate nonempty scooter API key and defaults the pinned model", () => {
    expect(() =>
      loadEnv(
        validEnv({
          SCOOTER_DOCUMENT_EXTRACTION_DRIVER: "openai",
          SCOOTER_DOCUMENT_EXTRACTION_OPENAI_API_KEY: " ",
        }),
      ),
    ).toThrow("SCOOTER_DOCUMENT_EXTRACTION_OPENAI_API_KEY");
    expect(
      loadEnv(
        validEnv({
          SCOOTER_DOCUMENT_EXTRACTION_DRIVER: "openai",
          SCOOTER_DOCUMENT_EXTRACTION_OPENAI_API_KEY: "test-key",
        }),
      ).SCOOTER_DOCUMENT_EXTRACTION_MODEL,
    ).toBe("gpt-5.4-2026-03-05");
  });

  it("forbids fake scooter extraction in production", () => {
    expect(() =>
      loadEnv(
        validEnv({
          NODE_ENV: "production",
          SCOOTER_DOCUMENT_EXTRACTION_DRIVER: "fake",
        }),
      ),
    ).toThrow("SCOOTER_DOCUMENT_EXTRACTION_DRIVER");
  });

  it.each(["0", "90001"])(
    "rejects invalid scooter-extraction timeout %s",
    (timeout) => {
      expect(() =>
        loadEnv(validEnv({ SCOOTER_DOCUMENT_EXTRACTION_TIMEOUT_MS: timeout })),
      ).toThrow("SCOOTER_DOCUMENT_EXTRACTION_TIMEOUT_MS");
    },
  );
  it("allows 90 seconds for full-resolution scooter documents", () => {
    const source = validEnv();
    delete source.SCOOTER_DOCUMENT_EXTRACTION_TIMEOUT_MS;
    expect(loadEnv(source).SCOOTER_DOCUMENT_EXTRACTION_TIMEOUT_MS).toBe(90_000);
    expect(
      loadEnv(validEnv({ SCOOTER_DOCUMENT_EXTRACTION_TIMEOUT_MS: "90000" }))
        .SCOOTER_DOCUMENT_EXTRACTION_TIMEOUT_MS,
    ).toBe(90_000);
  });
});
