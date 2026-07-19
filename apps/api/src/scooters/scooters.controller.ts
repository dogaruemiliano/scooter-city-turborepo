import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { v1 } from "@repo/api-shared";
import { ZodResponse } from "nestjs-zod";

import { RequireRoles } from "../common/decorators/roles.decorator";
import { CreateScooterInput } from "./dto/create-scooter.input";
import { ListScootersQuery } from "./dto/list-scooters.query";
import { Scooter } from "./dto/scooter";
import { ScooterList } from "./dto/scooter-list";
import { UpdateScooterInput } from "./dto/update-scooter.input";
import { toScooter } from "./scooters.mapper";
import { ScootersService } from "./scooters.service";

@ApiTags("scooters")
@ApiCookieAuth(v1.auth.ACCESS_TOKEN_COOKIE)
@ApiBearerAuth("bearer")
@RequireRoles("ADMIN")
@Controller({ path: "scooters", version: "1" })
export class ScootersController {
  constructor(private readonly scooters: ScootersService) {}

  @Post()
  @ApiOperation({
    operationId: "ScootersController_create_v1",
    summary: "Create one scooter inventory record",
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: Scooter })
  async create(
    @Body() input: CreateScooterInput,
  ): Promise<v1.scooters.Scooter> {
    return toScooter(await this.scooters.create(input));
  }

  @Get()
  @ApiOperation({
    operationId: "ScootersController_list_v1",
    summary: "List scooter inventory records",
  })
  @ZodResponse({ type: ScooterList })
  async list(
    @Query() query: ListScootersQuery,
  ): Promise<v1.scooters.ScooterList> {
    const result = await this.scooters.list(query);
    return {
      ...result,
      items: result.items.map(toScooter),
    };
  }

  @Get(":id")
  @ApiOperation({
    operationId: "ScootersController_get_v1",
    summary: "Get one active scooter inventory record",
  })
  @ZodResponse({ type: Scooter })
  async get(@Param("id") id: string): Promise<v1.scooters.Scooter> {
    const row = await this.scooters.findActiveById(id);
    if (!row) {
      throw new NotFoundException("Scooter not found");
    }
    return toScooter(row);
  }

  @Patch(":id")
  @ApiOperation({
    operationId: "ScootersController_update_v1",
    summary: "Update one active scooter inventory record",
  })
  @ZodResponse({ type: Scooter })
  async update(
    @Param("id") id: string,
    @Body() input: UpdateScooterInput,
  ): Promise<v1.scooters.Scooter> {
    return toScooter(await this.scooters.update(id, input));
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    operationId: "ScootersController_delete_v1",
    summary: "Soft-delete one active scooter inventory record",
  })
  @ApiNoContentResponse()
  async delete(@Param("id") id: string): Promise<void> {
    await this.scooters.softDelete(id);
  }
}
