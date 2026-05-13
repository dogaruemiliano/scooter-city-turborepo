/**
 * Marks a route as not requiring authentication. The global
 * `JwtAuthGuard` reads this metadata via `Reflector` and short-circuits.
 *
 * Apply at the method level (single route) or the class level (every
 * route on the controller is public).
 *
 * ```ts
 * @Public()
 * @Post("refresh")
 * refresh(@Req() req, @Res({ passthrough: true }) res) { ... }
 * ```
 */
import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC_KEY = "isPublic";
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_KEY, true);
