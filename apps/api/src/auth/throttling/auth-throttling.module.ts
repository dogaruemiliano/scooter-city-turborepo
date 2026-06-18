import { Global, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerModule } from "@nestjs/throttler";

import { ENV } from "../../config/config.module";
import type { Env } from "../../config/env";
import { buildThrottlerOptions } from "../throttler.config";

import {
  GlobalRequestThrottlerGuard,
  LoginBurstGuard,
  OtpRequestBurstGuard,
} from "./throttler.guards";

@Global()
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        throttlers: buildThrottlerOptions(env),
      }),
    }),
  ],
  providers: [
    GlobalRequestThrottlerGuard,
    OtpRequestBurstGuard,
    LoginBurstGuard,
    {
      provide: APP_GUARD,
      useExisting: GlobalRequestThrottlerGuard,
    },
  ],
  exports: [OtpRequestBurstGuard, LoginBurstGuard],
})
export class AuthThrottlingModule {}
