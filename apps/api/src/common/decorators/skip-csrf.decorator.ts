/**
 * Marks a route as exempt from the CSRF (X-Requested-With) header check.
 * Safe methods are already skipped, so use this only for exceptional public
 * mutation endpoints that cannot send the header.
 */
import { SetMetadata } from "@nestjs/common";

export const SKIP_CSRF_KEY = "skipCsrf";
export const SkipCsrf = (): MethodDecorator & ClassDecorator =>
  SetMetadata(SKIP_CSRF_KEY, true);
