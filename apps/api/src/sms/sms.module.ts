import { Module, type DynamicModule } from "@nestjs/common";

import type { Env } from "../config/env";

import { LogSmsService } from "./impls/log-sms.service";
import { SmsoSmsService } from "./impls/smso-sms.service";
import { SmsService } from "./sms.service";

@Module({})
export class SmsModule {
  static forRoot(env: Env): DynamicModule {
    const implementation =
      env.SMS_PROVIDER === "smso" ? SmsoSmsService : LogSmsService;

    return {
      global: true,
      module: SmsModule,
      providers: [{ provide: SmsService, useClass: implementation }],
      exports: [SmsService],
    };
  }
}
