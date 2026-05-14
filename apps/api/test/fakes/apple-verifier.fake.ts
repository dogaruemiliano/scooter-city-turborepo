/**
 * Test-only `AppleVerifier` implementation.
 *
 * Tests register `(idToken → claims)` pairs via `registerToken(...)`. The
 * verifier accepts pre-registered tokens; everything else throws the
 * same `UnauthorizedException` the real verifier would throw on a
 * signature / audience / expiry failure.
 *
 * Wired into the test module via
 *   `.overrideProvider(AppleVerifier).useClass(FakeAppleVerifier)`.
 */
import { Injectable, UnauthorizedException } from "@nestjs/common";

import {
  AppleVerifier,
  type AppleIdTokenClaims,
} from "../../src/auth/modules/apple/apple-verifier.service";

@Injectable()
export class FakeAppleVerifier implements AppleVerifier {
  private readonly map = new Map<string, AppleIdTokenClaims>();

  registerToken(idToken: string, claims: AppleIdTokenClaims): void {
    this.map.set(idToken, claims);
  }

  reset(): void {
    this.map.clear();
  }

  verify(idToken: string): Promise<AppleIdTokenClaims> {
    const hit = this.map.get(idToken);
    if (!hit) {
      return Promise.reject(
        new UnauthorizedException("Invalid Apple identity token"),
      );
    }
    return Promise.resolve(hit);
  }
}
