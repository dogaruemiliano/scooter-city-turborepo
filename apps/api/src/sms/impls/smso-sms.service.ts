/**
 * SMSO.ro SMS adapter — production implementation of `SmsService`.
 *
 * Selected when `env.SMS_PROVIDER === "smso"`. The env validator
 * guarantees `SMSO_API_KEY` and `SMSO_SENDER` are present when this
 * impl is in use, so the constructor's `getOrThrow` calls double-check
 * defense in depth rather than first-line validation.
 *
 * # API contract (verified at https://api-docs.smso.ro/)
 *
 * - Endpoint:   `POST https://app.smso.ro/api/v1/send`
 * - Auth:       `X-Authorization: <SMSO_API_KEY>` header.
 * - Body shape: JSON `{ sender, to, body, type: "otp" }`. The `type`
 *   field marks the message as transactional-OTP so SMSO's routing
 *   prioritizes deliverability and bypasses marketing-opt-out filters.
 * - Success:    HTTP 200 with `{ status: 200, responseToken, transaction_cost }`.
 * - Errors:     Non-2xx. Notable codes: 400 (bad request), 401 (bad
 *               API key), 402 (insufficient credit), 403 (blacklisted
 *               content), 405 (recipient unsubscribed), 409 (rate
 *               limited), 422 (international messaging prohibited).
 *
 * # Error handling
 *
 * Any non-2xx response throws a typed `Error` carrying the SMSO status
 * code and the response body (truncated for log safety). Network
 * failures bubble the underlying `fetch` rejection unchanged — pino's
 * default error serializer captures the cause.
 *
 * We deliberately do NOT retry inside the adapter. The OTP `/request`
 * endpoint is idempotent from the caller's perspective (re-requesting
 * just issues a new code), so retry policy belongs at the call site
 * (or at the operator level), not buried inside the SMS layer.
 */
import { Injectable } from "@nestjs/common";

import type { Env } from "../../config/env";
import { ENV } from "../../config/config.module";
import { Inject } from "@nestjs/common";

import { SmsService, type SmsMessage } from "../sms.service";

const SMSO_ENDPOINT = "https://app.smso.ro/api/v1/send";
/**
 * Max characters of the SMSO response body we keep in the thrown error.
 * Keeps stack traces and log lines bounded even if SMSO returns a huge
 * HTML error page on a misconfigured host.
 */
const ERROR_BODY_TRUNCATE = 512;

interface SmsoSuccessResponse {
  status: number;
  responseToken?: string;
  transaction_cost?: number;
}

@Injectable()
export class SmsoSmsService extends SmsService {
  private readonly apiKey: string;
  private readonly sender: string;

  constructor(@Inject(ENV) env: Env) {
    super();
    // Defense in depth — the env schema's cross-field rule already
    // requires these when `SMS_PROVIDER=smso`, but a misconfigured DI
    // override (or a future env-loader bypass) would otherwise fail
    // silently here with `undefined` headers.
    if (!env.SMSO_API_KEY) {
      throw new Error("SMSO_API_KEY is required when SMS_PROVIDER=smso.");
    }
    if (!env.SMSO_SENDER) {
      throw new Error("SMSO_SENDER is required when SMS_PROVIDER=smso.");
    }
    this.apiKey = env.SMSO_API_KEY;
    this.sender = env.SMSO_SENDER;
  }

  async send(message: SmsMessage): Promise<void> {
    const response = await globalThis.fetch(SMSO_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Authorization": this.apiKey,
      },
      body: JSON.stringify({
        sender: this.sender,
        to: message.to,
        body: message.body,
        // OTP type prioritizes deliverability and bypasses marketing
        // opt-outs — see SMSO.ro `type` parameter docs.
        type: "otp",
      }),
    });

    if (!response.ok) {
      const text = await safeReadText(response);
      throw new Error(
        `SMSO.ro send failed: HTTP ${response.status}${
          text ? ` — ${text.slice(0, ERROR_BODY_TRUNCATE)}` : ""
        }`,
      );
    }

    // SMSO returns a 200 envelope even on certain delivery failures.
    // Treat any non-200 `status` field in the JSON body as an error too.
    const data = (await safeReadJson(response)) as SmsoSuccessResponse | null;
    if (data && typeof data.status === "number" && data.status !== 200) {
      throw new Error(
        `SMSO.ro send returned non-200 envelope status: ${data.status}`,
      );
    }
  }
}

async function safeReadText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

async function safeReadJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
