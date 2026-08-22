/**
 * Reads the `Idempotency-Key` header off a financial write.
 *
 * The key is required, not optional. Money endpoints get retried — by users
 * double-clicking, by flaky mobile networks, by proxies — and without a key
 * the server cannot tell a retry from a second, genuinely new expense. A
 * missing key is therefore a 400, not a silently generated UUID: generating
 * one server-side would make every retry look new, which is exactly the
 * failure this guards against.
 */
import {
  BadRequestException,
  ExecutionContext,
  createParamDecorator,
} from "@nestjs/common";
import { v1 } from "@repo/api-shared";
import type { Request } from "express";

const MIN_KEY_LENGTH = 8;
const MAX_KEY_LENGTH = 200;

export const IdempotencyKey = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const header =
      request.headers[v1.finance.IDEMPOTENCY_KEY_HEADER.toLowerCase()];

    const key = (Array.isArray(header) ? header[0] : header)?.trim() ?? "";

    if (key.length < MIN_KEY_LENGTH || key.length > MAX_KEY_LENGTH) {
      throw new BadRequestException({
        code: "IDEMPOTENCY_KEY_REQUIRED",
        message: `Financial writes require an ${v1.finance.IDEMPOTENCY_KEY_HEADER} header containing a unique value, such as a UUID.`,
      });
    }

    return key;
  },
);
