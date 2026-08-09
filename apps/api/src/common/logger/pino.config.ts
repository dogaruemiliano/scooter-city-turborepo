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

const FINANCE_SEARCH_PATHS = new Set([
  "/v1/finance/wallet-options",
  "/v1/finance/wallets",
]);

function redactFinanceWalletSearch(
  url: string | undefined,
): string | undefined {
  if (!url) return url;

  const queryStart = url.indexOf("?");
  const path = url.slice(0, queryStart).replace(/\/$/, "");
  if (queryStart < 0 || !FINANCE_SEARCH_PATHS.has(path)) {
    return url;
  }

  return url.replace(
    /([?&])([^=&#]*)(=)([^&#]*)/g,
    (match, separator: string, rawKey: string, equals: string) => {
      try {
        const decodedKey = decodeURIComponent(rawKey.replace(/\+/g, " "));
        return decodedKey.toLowerCase() === "search"
          ? `${separator}${rawKey}${equals}[redacted]`
          : match;
      } catch {
        return match;
      }
    },
  );
}

export function pinoConfig(nodeEnv: string): Params {
  const isProd = nodeEnv === "production";
  return {
    pinoHttp: {
      level: isProd ? "info" : "debug",
      serializers: {
        req: (req: { url?: string }) => {
          req.url = redactFinanceWalletSearch(req.url);
          return req;
        },
      },
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
          "req.query.search",
          'res.headers["set-cookie"]',
        ],
        censor: "[redacted]",
      },
      autoLogging: { ignore: (req) => req.url === "/healthz" },
    },
  };
}
