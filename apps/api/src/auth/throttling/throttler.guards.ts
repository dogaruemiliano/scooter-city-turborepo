import { Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  type ThrottlerModuleOptions,
  type ThrottlerStorage,
} from "@nestjs/throttler";

import { THROTTLER_NAMES } from "../throttler.config";

abstract class SingleBucketThrottlerGuard extends ThrottlerGuard {
  protected selectBucket(name: string): void {
    this.throttlers = this.throttlers.filter(
      (throttler) => throttler.name === name,
    );
    if (this.throttlers.length !== 1) {
      throw new Error(`Missing throttler configuration for "${name}"`);
    }
  }
}

@Injectable()
export class GlobalRequestThrottlerGuard extends SingleBucketThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storage: ThrottlerStorage,
    reflector: Reflector,
  ) {
    super(options, storage, reflector);
  }

  override async onModuleInit(): Promise<void> {
    await super.onModuleInit();
    this.selectBucket(THROTTLER_NAMES.global);
  }
}

@Injectable()
export class OtpRequestBurstGuard extends SingleBucketThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storage: ThrottlerStorage,
    reflector: Reflector,
  ) {
    super(options, storage, reflector);
  }

  override async onModuleInit(): Promise<void> {
    await super.onModuleInit();
    this.selectBucket(THROTTLER_NAMES.otpRequestBurst);
  }
}

@Injectable()
export class LoginBurstGuard extends SingleBucketThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storage: ThrottlerStorage,
    reflector: Reflector,
  ) {
    super(options, storage, reflector);
  }

  override async onModuleInit(): Promise<void> {
    await super.onModuleInit();
    this.selectBucket(THROTTLER_NAMES.loginIp);
  }
}
