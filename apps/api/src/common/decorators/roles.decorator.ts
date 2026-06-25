import { applyDecorators, SetMetadata, UseGuards } from "@nestjs/common";

import { REQUIRED_ROLES_KEY } from "../authz/roles.constants";
import { RolesGuard } from "../guards/roles.guard";

export function RequireRoles(
  ...roles: string[]
): MethodDecorator & ClassDecorator {
  return applyDecorators(
    SetMetadata(REQUIRED_ROLES_KEY, roles),
    UseGuards(RolesGuard),
  );
}
