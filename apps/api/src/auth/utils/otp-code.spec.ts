import { deriveOtpCode } from "./otp-code";

describe("deriveOtpCode", () => {
  it("uses the fixed development code", () => {
    expect(
      deriveOtpCode({
        challengeId: "challenge",
        secret: "secret",
        nodeEnv: "test",
        length: 6,
      }),
    ).toBe("000000");
  });

  it("is deterministic and challenge-specific in production", () => {
    const input = {
      secret: "q".repeat(32),
      nodeEnv: "production",
      length: 6,
    };

    const first = deriveOtpCode({ ...input, challengeId: "challenge-a" });
    const repeated = deriveOtpCode({ ...input, challengeId: "challenge-a" });
    const second = deriveOtpCode({ ...input, challengeId: "challenge-b" });

    expect(first).toMatch(/^\d{6}$/);
    expect(repeated).toBe(first);
    expect(second).not.toBe(first);
  });
});
