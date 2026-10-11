import { Global, Module } from "@nestjs/common";
import { AccessProjectionInterceptor } from "./access-projection.interceptor";
import { AccessService } from "./access.service";
import {
  AccessRolesController,
  AccessUsersController,
  PersonAccessController,
} from "./access.controller";
@Global()
@Module({
  providers: [AccessService, AccessProjectionInterceptor],
  exports: [AccessService, AccessProjectionInterceptor],
  controllers: [
    AccessRolesController,
    AccessUsersController,
    PersonAccessController,
  ],
})
export class AccessModule {}
