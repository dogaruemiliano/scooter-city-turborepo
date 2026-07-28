import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { v1 } from "@repo/api-shared";
import type { Request } from "express";
import { ZodResponse } from "nestjs-zod";

import type { AuthPrincipal } from "../auth/auth.types";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequireRoles } from "../common/decorators/roles.decorator";
import { getRequestMetadata } from "../common/http/request-metadata";
import { CreateCompanyWalletInput } from "./dto/create-company-wallet.input";
import { CreateFinancialCategoryInput } from "./dto/create-financial-category.input";
import { CreateMoneyTransactionInput } from "./dto/create-money-transaction.input";
import { FinancialCategory } from "./dto/financial-category";
import { FinancialCategoryList } from "./dto/financial-category-list";
import { ListMoneyTransactionsQuery } from "./dto/list-money-transactions.query";
import { MoneyTransaction } from "./dto/money-transaction";
import { MoneyTransactionList } from "./dto/money-transaction-list";
import { OutstandingPersonalClaimList } from "./dto/outstanding-personal-claim-list";
import { ReverseMoneyTransactionInput } from "./dto/reverse-money-transaction.input";
import { UpdateFinancialCategoryInput } from "./dto/update-financial-category.input";
import { Wallet } from "./dto/wallet";
import { WalletList } from "./dto/wallet-list";
import {
  toFinancialCategory,
  toMoneyTransaction,
  toWallet,
} from "./finance.mapper";
import { FinanceService } from "./finance.service";

@ApiTags("finance")
@ApiCookieAuth(v1.auth.ACCESS_TOKEN_COOKIE)
@ApiBearerAuth("bearer")
@RequireRoles("ADMIN")
@Controller({ path: "finance", version: "1" })
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  @Post("wallets")
  @ApiOperation({
    operationId: "FinanceController_createWallet_v1",
    summary: "Create a company money-location wallet",
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: Wallet })
  async createWallet(
    @Body() input: CreateCompanyWalletInput,
    @CurrentUser() actor: AuthPrincipal,
    @Req() req: Request,
  ): Promise<v1.finance.Wallet> {
    return toWallet(
      await this.finance.createCompanyWallet(input, {
        actor,
        ...getRequestMetadata(req),
      }),
    );
  }

  @Get("wallets")
  @ApiOperation({
    operationId: "FinanceController_listWallets_v1",
    summary: "List user and company wallets with current balances",
  })
  @ZodResponse({ type: WalletList })
  async listWallets(): Promise<v1.finance.WalletList> {
    return { items: (await this.finance.listWallets()).map(toWallet) };
  }

  @Get("wallets/:id")
  @ApiOperation({
    operationId: "FinanceController_getWallet_v1",
    summary: "Get one wallet with current balances",
  })
  @ZodResponse({ type: Wallet })
  async getWallet(@Param("id") id: string): Promise<v1.finance.Wallet> {
    return toWallet(await this.finance.getWallet(id));
  }

  @Post("categories")
  @ApiOperation({
    operationId: "FinanceController_createCategory_v1",
    summary: "Create an income or expense category",
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: FinancialCategory })
  async createCategory(
    @Body() input: CreateFinancialCategoryInput,
    @CurrentUser() actor: AuthPrincipal,
    @Req() req: Request,
  ): Promise<v1.finance.FinancialCategory> {
    return toFinancialCategory(
      await this.finance.createCategory(input, {
        actor,
        ...getRequestMetadata(req),
      }),
    );
  }

  @Get("categories")
  @ApiOperation({
    operationId: "FinanceController_listCategories_v1",
    summary: "List financial categories",
  })
  @ZodResponse({ type: FinancialCategoryList })
  async listCategories(): Promise<{ items: v1.finance.FinancialCategory[] }> {
    return {
      items: (await this.finance.listCategories()).map(toFinancialCategory),
    };
  }

  @Patch("categories/:id")
  @ApiOperation({
    operationId: "FinanceController_updateCategory_v1",
    summary: "Update a financial category",
  })
  @ZodResponse({ type: FinancialCategory })
  async updateCategory(
    @Param("id") id: string,
    @Body() input: UpdateFinancialCategoryInput,
    @CurrentUser() actor: AuthPrincipal,
    @Req() req: Request,
  ): Promise<v1.finance.FinancialCategory> {
    return toFinancialCategory(
      await this.finance.updateCategory(id, input, {
        actor,
        ...getRequestMetadata(req),
      }),
    );
  }

  @Post("transactions")
  @ApiOperation({
    operationId: "FinanceController_createTransaction_v1",
    summary: "Create and optionally post a money transaction",
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: MoneyTransaction })
  async createTransaction(
    @Body() input: CreateMoneyTransactionInput,
    @CurrentUser() actor: AuthPrincipal,
    @Req() req: Request,
  ): Promise<v1.finance.MoneyTransaction> {
    return toMoneyTransaction(
      await this.finance.createTransaction(input, {
        actor,
        ...getRequestMetadata(req),
      }),
    );
  }

  @Get("transactions")
  @ApiOperation({
    operationId: "FinanceController_listTransactions_v1",
    summary: "List and filter money transactions",
  })
  @ZodResponse({ type: MoneyTransactionList })
  async listTransactions(
    @Query() query: ListMoneyTransactionsQuery,
  ): Promise<v1.finance.MoneyTransactionList> {
    const result = await this.finance.listTransactions(query);
    return {
      ...result,
      items: result.items.map(toMoneyTransaction),
    };
  }

  @Get("transactions/:id")
  @ApiOperation({
    operationId: "FinanceController_getTransaction_v1",
    summary: "Get one money transaction",
  })
  @ZodResponse({ type: MoneyTransaction })
  async getTransaction(
    @Param("id") id: string,
  ): Promise<v1.finance.MoneyTransaction> {
    return toMoneyTransaction(await this.finance.getTransaction(id));
  }

  @Post("transactions/:id/post")
  @ApiOperation({
    operationId: "FinanceController_postTransaction_v1",
    summary: "Post a draft transaction and update wallet balances",
  })
  @ZodResponse({ type: MoneyTransaction })
  async postTransaction(
    @Param("id") id: string,
    @CurrentUser() actor: AuthPrincipal,
    @Req() req: Request,
  ): Promise<v1.finance.MoneyTransaction> {
    return toMoneyTransaction(
      await this.finance.postTransaction(id, {
        actor,
        ...getRequestMetadata(req),
      }),
    );
  }

  @Post("transactions/:id/reverse")
  @ApiOperation({
    operationId: "FinanceController_reverseTransaction_v1",
    summary: "Reverse one posted money transaction",
  })
  @ZodResponse({ type: MoneyTransaction })
  async reverseTransaction(
    @Param("id") id: string,
    @Body() input: ReverseMoneyTransactionInput,
    @CurrentUser() actor: AuthPrincipal,
    @Req() req: Request,
  ): Promise<v1.finance.MoneyTransaction> {
    return toMoneyTransaction(
      await this.finance.reverseTransaction(id, input, {
        actor,
        ...getRequestMetadata(req),
      }),
    );
  }

  @Get("claims/outstanding")
  @ApiOperation({
    operationId: "FinanceController_listOutstandingClaims_v1",
    summary: "List current personal-funds debts between admins",
  })
  @ZodResponse({ type: OutstandingPersonalClaimList })
  async listOutstandingClaims(): Promise<{
    items: v1.finance.OutstandingPersonalClaim[];
  }> {
    return { items: await this.finance.listOutstandingClaims() };
  }
}

@ApiTags("finance")
@ApiCookieAuth(v1.auth.ACCESS_TOKEN_COOKIE)
@ApiBearerAuth("bearer")
@Controller({ path: "finance/me", version: "1" })
export class MyFinanceController {
  constructor(private readonly finance: FinanceService) {}

  @Get("wallet")
  @ApiOperation({
    operationId: "MyFinanceController_getWallet_v1",
    summary: "Get the authenticated user's wallet balance",
  })
  @ZodResponse({ type: Wallet })
  async getWallet(
    @CurrentUser() user: AuthPrincipal,
  ): Promise<v1.finance.Wallet> {
    return toWallet(await this.finance.getUserWallet(user.id));
  }
}
