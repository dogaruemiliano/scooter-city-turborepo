/**
 * Internal module exposing `UsersService`. No HTTP controller in this PR.
 * Auth modules in PR 5+ import this module to read/create/delete users.
 */
import { Module } from "@nestjs/common";

import { UserAvatarService } from "./user-avatar.service";
import { ImageStorageModule } from "../image-storage/image-storage.module";
import { UsersService } from "./users.service";

@Module({
  imports: [ImageStorageModule],
  providers: [UsersService, UserAvatarService],
  exports: [UsersService, UserAvatarService],
})
export class UsersModule {}
