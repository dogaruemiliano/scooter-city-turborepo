/**
 * `nestjs-pino` configuration.
 *
 * Pretty output in non-production (human-readable in dev terminal). JSON
 * output everywhere else (parsed by log shippers in CI/prod).
 *
 * Reads `req.id` from the request object (populated by [RequestIdMiddleware](../middleware/request-id.middleware.ts))
 * so every log line carries a `reqId` for correlation.
 */
import type { Params } from "nestjs-pino";

export function pinoConfig(nodeEnv: string): Params {
  const isProd = nodeEnv === "production";
  return {
    pinoHttp: {
      level: isProd ? "info" : "debug",
      transport: isProd
        ? undefined
        : {
            target: "pino-pretty",
            options: {
              singleLine: true,
              colorize: true,
              translateTime: "SYS:HH:MM:ss.l",
            },
          },
      customProps: (req) => ({ reqId: (req as { id?: string }).id }),
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          'res.headers["set-cookie"]',
        ],
        censor: "[redacted]",
      },
      autoLogging: { ignore: (req) => req.url === "/healthz" },
    },
  };
}
