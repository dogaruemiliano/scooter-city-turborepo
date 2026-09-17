/** Tests for the in-memory mailer used by email-delivery E2E suites. */
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

  it("returns independent recipient snapshots that survive later sends and reset", async () => {
    await spy.send({ to: "x@example.com", subject: "S", text: "original" });
    const captured = spy.findLastTo("x@example.com");
    if (!captured) throw new Error("Expected a captured email");

    captured.text = "changed snapshot";
    expect(spy.findLastTo("x@example.com")?.text).toBe("original");
    const stored = spy.getOutbox()[0];
    if (!stored) throw new Error("Expected a stored email");
    stored.text = "changed outbox";
    expect(captured.text).toBe("changed snapshot");

    await spy.send({ to: "x@example.com", subject: "New", text: "new" });
    await spy.send({ to: "y@example.com", subject: "Other", text: "other" });
    expect(spy.findLastTo("x@example.com")?.text).toBe("new");
    spy.reset();
    expect(captured).toEqual({
      to: "x@example.com",
      subject: "S",
      text: "changed snapshot",
    });
  });
});
