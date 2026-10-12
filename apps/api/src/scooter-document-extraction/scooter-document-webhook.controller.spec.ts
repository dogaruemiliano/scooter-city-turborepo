import type { RawBodyRequest } from "@nestjs/common";
import type { Request } from "express";
import { Webhook } from "standardwebhooks";
import type { Env } from "../config/env";
import type { ScooterDocumentJobsService } from "../scooter-document-jobs/scooter-document-jobs.service";
import { ScooterDocumentWebhookController } from "./scooter-document-webhook.controller";

const secret = `whsec_${Buffer.from("synthetic-webhook-secret-32-bytes!").toString("base64")}`;
function request(
  body: unknown,
  timestamp = new Date(),
): RawBodyRequest<Request> {
  const rawBody = Buffer.from(JSON.stringify(body));
  const id = "msg_test";
  return {
    rawBody,
    headers: {
      "webhook-id": id,
      "webhook-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
      "webhook-signature": new Webhook(secret).sign(id, timestamp, rawBody),
    },
  } as unknown as RawBodyRequest<Request>;
}
const event = {
  id: "evt_1",
  type: "response.completed",
  data: { id: "resp_123" },
};
function setup() {
  const jobs = { recordProviderEvent: jest.fn().mockResolvedValue(undefined) };
  return {
    jobs,
    controller: new ScooterDocumentWebhookController(
      { SCOOTER_DOCUMENT_EXTRACTION_WEBHOOK_SECRET: secret } as Env,
      jobs as unknown as ScooterDocumentJobsService,
    ),
  };
}

describe("scooter document provider webhook", () => {
  it("verifies the original bytes and durably records an event before acknowledging", async () => {
    const { controller, jobs } = setup();
    await expect(controller.receive(request(event))).resolves.toEqual({
      received: true,
    });
    expect(jobs.recordProviderEvent).toHaveBeenCalledWith("evt_1", "resp_123");
  });

  it.each(["tampered", "stale", "missing"])(
    "rejects %s signatures without side effects",
    async (kind) => {
      const { controller, jobs } = setup();
      const req = request(
        event,
        kind === "stale" ? new Date(Date.now() - 600_000) : new Date(),
      );
      if (kind === "tampered")
        req.rawBody = Buffer.from(
          JSON.stringify({ ...event, data: { id: "resp_other" } }),
        );
      if (kind === "missing") delete req.headers["webhook-signature"];
      await expect(controller.receive(req)).rejects.toMatchObject({
        status: 401,
      });
      expect(jobs.recordProviderEvent).not.toHaveBeenCalled();
    },
  );

  it("lets the provider retry if the durable inbox is unavailable", async () => {
    const { controller, jobs } = setup();
    jobs.recordProviderEvent.mockRejectedValue(new Error("database offline"));
    await expect(controller.receive(request(event))).rejects.toThrow(
      "database offline",
    );
  });

  it("acknowledges unrelated signed events without creating jobs", async () => {
    const { controller, jobs } = setup();
    await controller.receive(request({ ...event, type: "batch.completed" }));
    expect(jobs.recordProviderEvent).not.toHaveBeenCalled();
  });
});
