import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { v1 } from "@repo/api-shared";
import { ZodResponse } from "nestjs-zod";

import { RequireRoles } from "../common/decorators/roles.decorator";
import { CompaniesService } from "./companies.service";
import { toCompany } from "./company.mapper";
import { Company } from "./dto/company";
import { CompanyList } from "./dto/company-list";
import { CreateCompanyInput } from "./dto/create-company.input";
import { ListCompaniesQuery } from "./dto/list-companies.query";
import { UpdateCompanyInput } from "./dto/update-company.input";

@ApiTags("finance")
@ApiCookieAuth(v1.auth.ACCESS_TOKEN_COOKIE)
@ApiBearerAuth("bearer")
@RequireRoles("ADMIN")
@Controller({ path: "finance/companies", version: "1" })
export class CompaniesController {
  constructor(private readonly companies: CompaniesService) {}

  @Post()
  @ApiOperation({
    operationId: "CompaniesController_create_v1",
    summary: "Create a company counterparty",
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: Company })
  async create(@Body() input: CreateCompanyInput): Promise<v1.finance.Company> {
    return toCompany(await this.companies.create(input));
  }

  @Get()
  @ApiOperation({
    operationId: "CompaniesController_list_v1",
    summary: "List company counterparties",
  })
  @ZodResponse({ type: CompanyList })
  async list(
    @Query() query: ListCompaniesQuery,
  ): Promise<v1.finance.CompanyList> {
    const result = await this.companies.list(query);
    return { ...result, items: result.items.map(toCompany) };
  }

  @Get(":id")
  @ApiOperation({
    operationId: "CompaniesController_get_v1",
    summary: "Get a company counterparty",
  })
  @ZodResponse({ type: Company })
  async get(@Param("id") id: string): Promise<v1.finance.Company> {
    return toCompany(await this.companies.get(id));
  }

  @Patch(":id")
  @ApiOperation({
    operationId: "CompaniesController_update_v1",
    summary: "Update a company counterparty",
  })
  @ZodResponse({ type: Company })
  async update(
    @Param("id") id: string,
    @Body() input: UpdateCompanyInput,
  ): Promise<v1.finance.Company> {
    return toCompany(await this.companies.update(id, input));
  }
}
