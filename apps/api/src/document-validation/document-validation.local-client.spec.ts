import { InvokeCommand } from "@aws-sdk/client-lambda";
import { fork, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import type { Env } from "../config/env";
import { LocalDocumentValidationClient } from "./document-validation.local-client";
import { DOCUMENT_VALIDATION_MAX_RUNTIME_MS } from "./document-validation.types";

jest.mock("node:child_process", () => ({ fork: jest.fn() }));
const mockedFork = jest.mocked(fork);
const env = {
  NODE_ENV: "development",
  IMAGE_STORAGE_S3_REGION: "eu-central-1",
  IMAGE_STORAGE_S3_BUCKET: "test-private",
  IMAGE_STORAGE_S3_PREFIX: "documents",
  IMAGE_STORAGE_MAX_BYTES: 15 * 1024 * 1024,
} as Env;
const input = { source: { storageKey: "source" }, outputKey: "snapshot" };
const command = new InvokeCommand({
  FunctionName: "local-development",
  Payload: Buffer.from(JSON.stringify(input)),
});

function setup() {
  const child = Object.assign(new EventEmitter(), {
    kill: jest.fn(),
    send: jest.fn(),
  });
  mockedFork.mockReturnValue(child as unknown as ChildProcess);
  return { child, client: new LocalDocumentValidationClient(env) };
}

describe("isolated development validation", () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => jest.useRealTimers());

  it("uses a separate bounded process and exchanges only metadata", async () => {
    const { child, client } = setup();
    const pending = client.send(command, {
      abortSignal: new AbortController().signal,
    });
    expect(child.send).toHaveBeenCalledWith(input, expect.any(Function));
    const options = mockedFork.mock.calls[0][2]!;
    expect(options.stdio).toEqual(["ignore", "ignore", "ignore", "ipc"]);
    expect(options.execArgv).toEqual(["--max-old-space-size=512"]);
    expect(options.env?.DATABASE_URL).toBeUndefined();
    expect(
      options.env?.SCOOTER_DOCUMENT_EXTRACTION_OPENAI_API_KEY,
    ).toBeUndefined();
    expect(options.env?.DOCUMENT_VALIDATION_MAX_BYTES).toBe("15728640");
    const response = { ok: true, document: { storageKey: "snapshot" } };
    child.emit("message", response);
    const result = await pending;
    expect(result.StatusCode).toBe(200);
    expect(JSON.parse(Buffer.from(result.Payload!).toString())).toEqual(
      response,
    );
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
  });

  it("kills the parser when the caller aborts", async () => {
    const { child, client } = setup();
    const controller = new AbortController();
    const pending = client.send(command, { abortSignal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({
      code: "DOCUMENT_EXTRACTION_UNAVAILABLE",
    });
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
  });

  it("enforces a hard deadline even when the parser is stuck", async () => {
    jest.useFakeTimers();
    const { child, client } = setup();
    const pending = client.send(command, {
      abortSignal: new AbortController().signal,
    });
    const rejected = expect(pending).rejects.toMatchObject({
      code: "DOCUMENT_EXTRACTION_TIMEOUT",
    });
    await jest.advanceTimersByTimeAsync(DOCUMENT_VALIDATION_MAX_RUNTIME_MS);
    await rejected;
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
  });

  it("turns a crashed worker into a retryable safe error", async () => {
    const { child, client } = setup();
    const pending = client.send(command, {
      abortSignal: new AbortController().signal,
    });
    child.emit("exit", 1);
    await expect(pending).rejects.toMatchObject({
      code: "DOCUMENT_EXTRACTION_UNAVAILABLE",
    });
  });

  it("rejects oversized output without forwarding it", async () => {
    const { child, client } = setup();
    const pending = client.send(command, {
      abortSignal: new AbortController().signal,
    });
    child.emit("message", "x".repeat(8193));
    await expect(pending).rejects.toMatchObject({
      code: "DOCUMENT_EXTRACTION_UNAVAILABLE",
    });
  });

  it("never launches for a cancelled request or in production", async () => {
    const { client } = setup();
    await expect(
      client.send(command, { abortSignal: AbortSignal.abort() }),
    ).rejects.toMatchObject({ code: "DOCUMENT_EXTRACTION_UNAVAILABLE" });
    expect(mockedFork).not.toHaveBeenCalled();
    expect(
      () =>
        new LocalDocumentValidationClient({ ...env, NODE_ENV: "production" }),
    ).toThrow("production");
  });
});
