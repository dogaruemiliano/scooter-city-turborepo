import { z } from "zod";

export const otpChallengeIdSchema = z
  .uuid()
  .describe("Opaque UUID identifying one OTP challenge.");

export const otpChallengeMetadataSchema = z
  .object({
    status: z.literal("verification_required"),
    challengeId: otpChallengeIdSchema,
    expiresInSec: z
      .number()
      .int()
      .positive()
      .describe("Seconds until the challenge expires."),
    resendAfterSec: z
      .number()
      .int()
      .nonnegative()
      .describe("Seconds until another delivery may be requested."),
  })
  .meta({ id: "OtpChallengeMetadata" });

export type OtpChallengeMetadata = z.infer<typeof otpChallengeMetadataSchema>;

export const resendOtpChallengeInputSchema = z
  .object({
    challengeId: otpChallengeIdSchema,
  })
  .strict()
  .meta({ id: "ResendOtpChallengeInput" });

export type ResendOtpChallengeInput = z.infer<
  typeof resendOtpChallengeInputSchema
>;
