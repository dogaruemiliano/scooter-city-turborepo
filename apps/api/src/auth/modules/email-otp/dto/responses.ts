/**
 * Response shapes for the email-OTP controller.
 *
 * `TokenPairResponse` already exists in the core-auth module; the verify
 * endpoint reuses it directly. Only the request-endpoint response
 * (`{ status: "sent" }`) is new — define it here so Orval picks it up
 * as `OtpRequestResponse` in the OpenAPI doc.
 */
import { ApiProperty } from "@nestjs/swagger";

export class OtpRequestResponse {
  @ApiProperty({
    description:
      "Constant acknowledgement of the request. Returned unconditionally — whether the email matched a real user is intentionally not disclosed (anti-enumeration).",
    enum: ["sent"],
  })
  status!: "sent";
}
