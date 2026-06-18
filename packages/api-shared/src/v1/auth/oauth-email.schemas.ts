/**
 * Shared contract for proving an OAuth email the provider did not mark as
 * verified. Provider sign-in returns `verification_required`; the client
 * then submits the emailed code to the generic verification endpoint.
 */
import { z } from "zod";

import { otpCodeSchema } from "../common/common.schemas";
import { tokenPairSchema } from "./auth.schemas";
import {
  otpChallengeIdSchema,
  otpChallengeMetadataSchema,
  type OtpChallengeMetadata,
} from "./otp-challenge.schemas";

export const oauthEmailVerificationRequiredSchema = otpChallengeMetadataSchema;

export type OAuthEmailVerificationRequired = OtpChallengeMetadata;

export const verifyOAuthEmailInputSchema = z
  .object({
    challengeId: otpChallengeIdSchema,
    code: otpCodeSchema.describe(
      "One-time code sent to the email contained in the verified provider token.",
    ),
  })
  .strict()
  .meta({ id: "VerifyOAuthEmailInput" });

export type VerifyOAuthEmailInput = z.infer<typeof verifyOAuthEmailInputSchema>;

export const oauthSignInResultSchema = z
  .union([tokenPairSchema, oauthEmailVerificationRequiredSchema])
  .meta({ id: "OAuthSignInResult" });

export type OAuthSignInResult = z.infer<typeof oauthSignInResultSchema>;
