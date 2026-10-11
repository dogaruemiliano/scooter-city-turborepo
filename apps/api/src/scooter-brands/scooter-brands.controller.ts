import { RequireAllScope } from "../access/access.decorators";
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { v1 } from "@repo/api-shared";
import { ZodResponse } from "nestjs-zod";

import { CreateScooterBrandInput } from "./dto/create-scooter-brand.input";
import { ScooterBrand } from "./dto/scooter-brand";
import { ScooterBrandList } from "./dto/scooter-brand-list";
import { UpdateScooterBrandInput } from "./dto/update-scooter-brand.input";
import { toScooterBrand } from "./scooter-brands.mapper";
import { ScooterBrandsService } from "./scooter-brands.service";

@ApiTags("scooter-brands")
@ApiCookieAuth(v1.auth.ACCESS_TOKEN_COOKIE)
@ApiBearerAuth("bearer")
@Controller({ path: "scooter-brands", version: "1" })
export class ScooterBrandsController {
  constructor(private readonly scooterBrands: ScooterBrandsService) {}

  @RequireAllScope("scooter_brands.manage")
  @Post()
  @ApiOperation({
    operationId: "ScooterBrandsController_create_v1",
    summary: "Create a scooter brand",
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: ScooterBrand })
  async create(
    @Body() input: CreateScooterBrandInput,
  ): Promise<v1.scooterBrands.ScooterBrand> {
    return toScooterBrand(await this.scooterBrands.create(input));
  }

  @RequireAllScope("scooter_brands.read")
  @Get()
  @ApiOperation({
    operationId: "ScooterBrandsController_list_v1",
    summary: "List scooter brands",
  })
  @ZodResponse({ type: ScooterBrandList })
  async list(): Promise<v1.scooterBrands.ScooterBrandList> {
    const items = await this.scooterBrands.list();
    return { items: items.map(toScooterBrand) };
  }

  @RequireAllScope("scooter_brands.manage")
  @Patch(":id")
  @ApiOperation({
    operationId: "ScooterBrandsController_update_v1",
    summary: "Update a scooter brand",
  })
  @ZodResponse({ type: ScooterBrand })
  async update(
    @Param("id") id: string,
    @Body() input: UpdateScooterBrandInput,
  ): Promise<v1.scooterBrands.ScooterBrand> {
    return toScooterBrand(await this.scooterBrands.update(id, input));
  }

  @RequireAllScope("scooter_brands.manage")
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    operationId: "ScooterBrandsController_delete_v1",
    summary: "Delete a scooter brand",
  })
  async delete(@Param("id") id: string): Promise<void> {
    await this.scooterBrands.delete(id);
  }
}
