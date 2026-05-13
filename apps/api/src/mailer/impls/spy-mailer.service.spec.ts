/**
 * SpyMailerService is the workhorse of every PR-5+ E2E test that needs
 * to grab an OTP / verification code out of an "email". This spec locks
 * down the behaviors those tests will rely on.
 */
import { SpyMailerService } from "./spy-mailer.service";

describe("SpyMailerService", () => {
  let spy: SpyMailerService;

  beforeEach(() => {
    spy = new SpyMailerService();
  });

  it("captures messages into the outbox in send-order", async () => {
    await spy.send({ to: "a@example.com", subject: "First", text: "1" });
    await spy.send({ to: "b@example.com", subject: "Second", text: "2" });
    expect(spy.getOutbox()).toEqual([
      { to: "a@example.com", subject: "First", text: "1" },
      { to: "b@example.com", subject: "Second", text: "2" },
    ]);
  });

  it("findLastTo returns the most recent message for a recipient", async () => {
    await spy.send({ to: "a@example.com", subject: "S1", text: "old" });
    await spy.send({ to: "b@example.com", subject: "S2", text: "other" });
    await spy.send({ to: "a@example.com", subject: "S3", text: "new" });
    expect(spy.findLastTo("a@example.com")?.text).toBe("new");
    expect(spy.findLastTo("nobody@example.com")).toBeUndefined();
  });

  it("reset() clears the outbox", async () => {
    await spy.send({ to: "x@example.com", subject: "S", text: "T" });
    spy.reset();
    expect(spy.getOutbox()).toEqual([]);
  });

  it("snapshots messages so external mutation does not affect the outbox", async () => {
    const message = { to: "x@example.com", subject: "S", text: "original" };
    await spy.send(message);
    message.text = "mutated-after-send";
    expect(spy.findLastTo("x@example.com")?.text).toBe("original");
  });
});
