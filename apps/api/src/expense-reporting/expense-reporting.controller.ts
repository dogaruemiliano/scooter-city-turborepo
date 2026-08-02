import { Controller, Get, Query } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { v1 } from "@repo/api-shared";
import { ZodResponse } from "nestjs-zod";

import { RequireRoles } from "../common/decorators/roles.decorator";
import { ExpenseAttributionReport } from "./dto/expense-attribution-report";
import { ExpenseDocumentReviewReport } from "./dto/expense-document-review-report";
import { ExpensePaymentSourceReport } from "./dto/expense-payment-source-report";
import { ExpenseReimbursementReport } from "./dto/expense-reimbursement-report";
import { ExpenseReportQuery } from "./dto/expense-report.query";
import { ExpenseReportingService } from "./expense-reporting.service";

@ApiTags("expense reports")
@ApiCookieAuth(v1.auth.ACCESS_TOKEN_COOKIE)
@ApiBearerAuth("bearer")
@RequireRoles("ADMIN")
@Controller({ path: "finance/expense-reports", version: "1" })
export class ExpenseReportingController {
  constructor(private readonly reports: ExpenseReportingService) {}

  @Get("attribution")
  @ApiOperation({
    operationId: "ExpenseReportingController_attribution_v1",
    summary: "Report business and formal-owner expense attribution",
  })
  @ZodResponse({ type: ExpenseAttributionReport })
  attribution(
    @Query() query: ExpenseReportQuery,
  ): Promise<v1.finance.ExpenseAttributionReport> {
    return this.reports.getAttributionReport(query);
  }

  @Get("reimbursements")
  @ApiOperation({
    operationId: "ExpenseReportingController_reimbursements_v1",
    summary: "Report specialized expense reimbursement claim state",
  })
  @ZodResponse({ type: ExpenseReimbursementReport })
  reimbursements(
    @Query() query: ExpenseReportQuery,
  ): Promise<v1.finance.ExpenseReimbursementReport> {
    return this.reports.getReimbursementReport(query);
  }

  @Get("payment-sources")
  @ApiOperation({
    operationId: "ExpenseReportingController_paymentSources_v1",
    summary: "Report expense gross amounts by payment source",
  })
  @ZodResponse({ type: ExpensePaymentSourceReport })
  paymentSources(
    @Query() query: ExpenseReportQuery,
  ): Promise<v1.finance.ExpensePaymentSourceReport> {
    return this.reports.getPaymentSourceReport(query);
  }

  @Get("document-review")
  @ApiOperation({
    operationId: "ExpenseReportingController_documentReview_v1",
    summary: "Report manual expense document review coverage",
  })
  @ZodResponse({ type: ExpenseDocumentReviewReport })
  documentReview(
    @Query() query: ExpenseReportQuery,
  ): Promise<v1.finance.ExpenseDocumentReviewReport> {
    return this.reports.getDocumentReviewReport(query);
  }
}
