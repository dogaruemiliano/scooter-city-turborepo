import { Inject, Injectable } from "@nestjs/common";

import { ENV } from "../../config/config.module";
import type { Env } from "../../config/env";
import { SmsService, type SmsMessage } from "../sms.service";

const SMSO_ENDPOINT = "https://app.smso.ro/api/v1/send";
const ERROR_BODY_TRUNCATE = 512;

interface SmsoSuccessResponse {
  status: number;
  responseToken?: string;
  transaction_cost?: number;
}

/** Production SMS implementation backed by SMSO.ro. */
@Injectable()
export class SmsoSmsService extends SmsService {
  private readonly apiKey: string;
  private readonly sender: string;

  constructor(@Inject(ENV) env: Env) {
    super();
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
