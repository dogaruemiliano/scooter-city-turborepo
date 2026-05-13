/**
 * Mirror of SpyMailerService spec — same semantics, SMS payload shape.
 */
import { SpySmsService } from "./spy-sms.service";

describe("SpySmsService", () => {
  let spy: SpySmsService;

  beforeEach(() => {
    spy = new SpySmsService();
  });

  it("captures messages into the outbox in send-order", async () => {
    await spy.send({ to: "+40700000001", body: "first" });
    await spy.send({ to: "+40700000002", body: "second" });
    expect(spy.getOutbox()).toEqual([
      { to: "+40700000001", body: "first" },
      { to: "+40700000002", body: "second" },
    ]);
  });

  it("findLastTo returns the most recent message for a phone", async () => {
    await spy.send({ to: "+40700000001", body: "old" });
    await spy.send({ to: "+40700000002", body: "other" });
    await spy.send({ to: "+40700000001", body: "new" });
    expect(spy.findLastTo("+40700000001")?.body).toBe("new");
  });

  it("snapshots messages so external mutation does not affect the outbox", async () => {
    const message = { to: "+40700000001", body: "original" };
    await spy.send(message);
    message.body = "mutated-after-send";
    expect(spy.findLastTo("+40700000001")?.body).toBe("original");
  });
});
