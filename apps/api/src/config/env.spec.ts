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
});
