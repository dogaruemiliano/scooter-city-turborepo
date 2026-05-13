/**
 * Internal module exposing `UsersService`. No HTTP controller in this PR.
 * Auth modules in PR 5+ import this module to read/create/delete users.
 */
import { Module } from "@nestjs/common";

import { UsersService } from "./users.service";

@Module({
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
