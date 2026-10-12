import {
  Controller,
  HttpCode,
  Inject,
  Post,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import type { RawBodyRequest } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import { Webhook } from "standardwebhooks";
import { z } from "zod";
import { Public } from "../auth/decorators/public.decorator";
import { SkipCsrf } from "../common/decorators/skip-csrf.decorator";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import { ScooterDocumentJobsService } from "../scooter-document-jobs/scooter-document-jobs.service";

const eventSchema = z.object({
  id: z.string().min(1).max(200),
  type: z.string(),
  data: z.object({
    id: z
      .string()
      .regex(/^resp_[A-Za-z0-9_-]+$/)
      .max(512),
  }),
});
const terminalEvents = new Set([
  "response.completed",
  "response.failed",
  "response.cancelled",
  "response.incomplete",
]);

@ApiExcludeController()
@Controller({ path: "webhooks/openai/scooter-documents", version: "1" })
export class ScooterDocumentWebhookController {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly jobs: ScooterDocumentJobsService,
  ) {}

  @Public()
  @SkipCsrf()
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Post()
  @HttpCode(200)
  async receive(@Req() req: RawBodyRequest<Request>) {
    const secret = this.env.SCOOTER_DOCUMENT_EXTRACTION_WEBHOOK_SECRET;
    if (!secret)
      throw new ServiceUnavailableException("Webhook is not configured.");
    const headers: Record<string, string> = {};
    for (const name of [
      "webhook-id",
      "webhook-timestamp",
      "webhook-signature",
    ]) {
      const value = req.headers[name];
      if (typeof value !== "string")
        throw new UnauthorizedException("Invalid webhook.");
      headers[name] = value;
    }
    let payload: unknown;
    try {
      if (!req.rawBody || req.rawBody.byteLength > 64 * 1024) throw new Error();
      payload = new Webhook(secret).verify(req.rawBody, headers);
    } catch {
      throw new UnauthorizedException("Invalid webhook.");
    }
    const event = eventSchema.safeParse(payload);
    // Other verified OpenAI events may share this project endpoint.
    if (event.success && terminalEvents.has(event.data.type)) {
      await this.jobs.recordProviderEvent(event.data.id, event.data.data.id);
    }
    return { received: true };
  }
}
