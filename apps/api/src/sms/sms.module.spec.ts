import type { Env } from "../config/env";

import { LogSmsService } from "./impls/log-sms.service";
import { SmsoSmsService } from "./impls/smso-sms.service";
import { SmsModule } from "./sms.module";
import { SmsService } from "./sms.service";

describe("SmsModule", () => {
  it.each([
    ["log", LogSmsService],
    ["smso", SmsoSmsService],
  ] as const)(
    "binds SMS_PROVIDER=%s to the expected implementation",
    (mode, implementation) => {
      const module = SmsModule.forRoot({ SMS_PROVIDER: mode } as Env);

      expect(module.global).toBe(true);
      expect(module.providers).toContainEqual({
        provide: SmsService,
        useClass: implementation,
      });
      expect(module.exports).toContain(SmsService);
    },
  );
});
