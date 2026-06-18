import type { Request } from "express";

import { getRequestMetadata } from "./request-metadata";

describe("getRequestMetadata", () => {
  it("uses Express request metadata", () => {
    const header = jest.fn((name: string) =>
      name === "user-agent" ? "test-agent" : undefined,
    );
    const req = {
      ip: "203.0.113.10",
      header,
    } as unknown as Request;

    expect(getRequestMetadata(req)).toEqual({
      ip: "203.0.113.10",
      userAgent: "test-agent",
    });
    expect(header).toHaveBeenCalledWith("user-agent");
    expect(header).not.toHaveBeenCalledWith("x-forwarded-for");
  });

  it("returns null for unavailable metadata", () => {
    const req = {
      ip: undefined,
      header: jest.fn(() => undefined),
    } as unknown as Request;

    expect(getRequestMetadata(req)).toEqual({
      ip: null,
      userAgent: null,
    });
  });
});
