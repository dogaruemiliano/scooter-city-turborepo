/**
 * The always-on auth module: session issuance/rotation plus the core
 * session and identity HTTP surfaces.
 *
 * Registers `JwtModule` locally so `CoreAuthService` receives the RS256
 * signing configuration from the same module scope that provides it.
 *
 * Auth-method modules call `coreAuth.issueSession(...)`; they do not
 * import or configure JwtModule themselves.
 *
 * `CoreAuthService`, `LinkedAccountService`, and `OAuthAccountResolver`
 * are re-exported for auth-method modules.
 */
import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";

import { UsersModule } from "../../../users/users.module";
import type { KeyRing } from "../../utils/keys";
import { KEY_RING, KeysModule } from "../../utils/keys.module";

import { AuthIdentityController } from "./auth-identity.controller";
import { AuthSessionController } from "./auth-session.controller";
import { CoreAuthService } from "./core-auth.service";
import { LinkedAccountService } from "./linked-account.service";
import { OAuthAccountResolver } from "./oauth-account-resolver.service";

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [KeysModule],
      inject: [KEY_RING],
      useFactory: (ring: KeyRing) => ({
        privateKey: ring.signingPrivate,
        signOptions: {
          algorithm: "RS256",
          header: { kid: ring.currentKid, alg: "RS256" },
        },
        verifyOptions: { algorithms: ["RS256"] },
      }),
    }),
    UsersModule,
    KeysModule,
  ],
  controllers: [AuthSessionController, AuthIdentityController],
  providers: [CoreAuthService, LinkedAccountService, OAuthAccountResolver],
  exports: [CoreAuthService, LinkedAccountService, OAuthAccountResolver],
})
export class CoreAuthModule {}
