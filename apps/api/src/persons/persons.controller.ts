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
import { CreatePersonInput } from "./dto/create-person.input";
import { ListPersonsQuery } from "./dto/list-persons.query";
import { Person } from "./dto/person";
import { PersonList } from "./dto/person-list";
import { UpdatePersonInput } from "./dto/update-person.input";
import { toPerson } from "./persons.mapper";
import { PersonsService } from "./persons.service";

@ApiTags("persons")
@ApiCookieAuth(v1.auth.ACCESS_TOKEN_COOKIE)
@ApiBearerAuth("bearer")
@RequireRoles("ADMIN")
@Controller({ path: "persons", version: "1" })
export class PersonsController {
  constructor(private readonly persons: PersonsService) {}

  @Post()
  @ApiOperation({
    operationId: "PersonsController_create_v1",
    summary: "Create an admin-managed person record",
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: Person })
  async create(@Body() input: CreatePersonInput): Promise<v1.persons.Person> {
    return toPerson(await this.persons.create(input));
  }

  @Get()
  @ApiOperation({
    operationId: "PersonsController_list_v1",
    summary: "List admin-managed person records",
  })
  @ZodResponse({ type: PersonList })
  async list(@Query() query: ListPersonsQuery): Promise<v1.persons.PersonList> {
    const result = await this.persons.list(query);
    return {
      ...result,
      items: result.items.map(toPerson),
    };
  }

  @Get(":id")
  @ApiOperation({
    operationId: "PersonsController_get_v1",
    summary: "Get one active person record",
  })
  @ZodResponse({ type: Person })
  async get(@Param("id") id: string): Promise<v1.persons.Person> {
    const row = await this.persons.findActiveById(id);
    if (!row) {
      throw new NotFoundException("Person not found");
    }
    return toPerson(row);
  }

  @Patch(":id")
  @ApiOperation({
    operationId: "PersonsController_update_v1",
    summary: "Update one active person record",
  })
  @ZodResponse({ type: Person })
  async update(
    @Param("id") id: string,
    @Body() input: UpdatePersonInput,
  ): Promise<v1.persons.Person> {
    return toPerson(await this.persons.update(id, input));
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    operationId: "PersonsController_delete_v1",
    summary: "Soft-delete one active person record",
  })
  @ApiNoContentResponse()
  async delete(@Param("id") id: string): Promise<void> {
    await this.persons.softDelete(id);
  }
}
