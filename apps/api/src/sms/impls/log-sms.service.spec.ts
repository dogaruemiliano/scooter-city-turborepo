import { Logger } from "nestjs-pino";

import { LogSmsService } from "./log-sms.service";

describe("LogSmsService", () => {
  it("logs messages without calling fetch", async () => {
    const logMock = jest.fn();
    const logger = {
      log: logMock,
    } as unknown as Logger;
    const fetchSpy = jest.fn();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

    try {
      const service = new LogSmsService(logger);
      const message = { to: "+40712345678", body: "Your code is 000000" };

      await service.send(message);

      expect(logMock).toHaveBeenCalledWith(message, "LogSmsService.send");
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
