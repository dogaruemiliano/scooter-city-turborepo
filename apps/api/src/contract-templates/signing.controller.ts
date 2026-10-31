import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { createZodDto } from "nestjs-zod";
import { v1 } from "@repo/api-shared";
import type { Request, Response } from "express";
import { Public } from "../auth/decorators/public.decorator";
import { SigningService } from "./signing.service";

class Exchange extends createZodDto(
  v1.contracts.exchangeInvitationInputSchema,
) {}
class RequestOtp extends createZodDto(
  v1.contracts.requestSigningOtpInputSchema,
) {}
class VerifyOtp extends createZodDto(
  v1.contracts.verifySigningOtpInputSchema,
) {}
class Sign extends createZodDto(v1.contracts.documentSignInputSchema) {}
class Complete extends createZodDto(v1.contracts.completeSigningInputSchema) {}
class Telemetry extends createZodDto(
  v1.contracts.signingTelemetryInputSchema,
) {}

/** Guest cookies have their own CSRF/Origin boundary; account JWTs grant no signing authority. */
@Public()
@Controller({ path: "signing", version: "1" })
export class SigningController {
  constructor(readonly signing: SigningService) {}

  private secureResponse(res: Response): void {
    res.set({
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    });
  }
  private mutation(req: Request): void {
    const allowed = [
      this.signing.env.APP_BASE_URL,
      this.signing.env.API_BASE_URL,
      ...this.signing.env.CORS_ORIGINS,
    ].map((url) => new URL(url).origin);
    if (
      req.header("x-requested-with") !== "fetch" ||
      !req.header("origin") ||
      !allowed.includes(req.header("origin")!)
    )
      throw new ForbiddenException("A same-origin signing request is required");
  }
  private token(req: Request): string {
    const cookies = req.cookies as
      | Record<string, string | undefined>
      | undefined;
    return cookies?.[v1.contracts.signingCookie] ?? "";
  }
  private context(req: Request) {
    return { ip: req.ip ?? null, userAgent: req.header("user-agent") ?? null };
  }

  @Post("session")
  async exchange(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() input: Exchange,
  ) {
    this.mutation(req);
    this.secureResponse(res);
    const result = await this.signing.exchange(input.token, this.context(req));
    res.cookie(v1.contracts.signingCookie, result.token, {
      httpOnly: true,
      secure: this.signing.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: this.signing.env.CONTRACT_SESSION_TTL_SECONDS * 1000,
    });
    return result.state;
  }
  @Get("state")
  state(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.secureResponse(res);
    return this.signing.state(this.token(req));
  }

  @Post("otp/request")
  requestOtp(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() input: RequestOtp,
  ) {
    this.mutation(req);
    this.secureResponse(res);
    return this.signing.requestOtp(
      this.token(req),
      input.purpose,
      this.context(req),
    );
  }

  @Post("otp/verify")
  verifyOtp(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() input: VerifyOtp,
  ) {
    this.mutation(req);
    this.secureResponse(res);
    return this.signing.verifyOtp(
      this.token(req),
      input.purpose,
      input.code,
      this.context(req),
    );
  }

  @Post("selfie")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 2 },
    }),
  )
  selfie(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @UploadedFile() file: Express.Multer.File,
    @Body("noticeVersion") noticeVersion: string,
    @Body("noticeAccepted") noticeAccepted: string,
  ) {
    this.mutation(req);
    this.secureResponse(res);
    return this.signing.selfie(
      this.token(req),
      file,
      noticeVersion,
      noticeAccepted,
    );
  }

  @Get("documents/:id/file")
  async file(
    @Req() req: Request,
    @Res() res: Response,
    @Param("id") id: string,
    @Query("variant") variant?: string,
  ) {
    this.secureResponse(res);
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="contract-document.pdf"`,
    });
    res.send(
      await this.signing.file(
        this.token(req),
        id,
        variant === "signed" ? "signed" : "presented",
      ),
    );
  }
  @Get("supporting-files/:assetId/content")
  async supportingFile(
    @Req() req: Request,
    @Res() res: Response,
    @Param("assetId") assetId: string,
  ) {
    this.secureResponse(res);
    const file = await this.signing.supportingFile(this.token(req), assetId);
    res.set({
      "Content-Type": file.contentType,
      "Content-Disposition": `attachment; filename="supporting-file"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    });
    res.send(file.buffer);
  }

  @Post("documents/:id/sign")
  sign(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param("id") id: string,
    @Body() input: Sign,
  ) {
    this.mutation(req);
    this.secureResponse(res);
    return this.signing.sign(
      this.token(req),
      id,
      input,
      false,
      this.context(req),
    );
  }

  @Post("documents/:id/sign-limiter")
  signLimiter(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param("id") id: string,
    @Body() input: Sign,
  ) {
    this.mutation(req);
    this.secureResponse(res);
    return this.signing.sign(
      this.token(req),
      id,
      input,
      true,
      this.context(req),
    );
  }

  @Post("complete")
  complete(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() input: Complete,
  ) {
    this.mutation(req);
    this.secureResponse(res);
    return this.signing.complete(this.token(req), input);
  }

  @Post("telemetry")
  telemetry(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() input: Telemetry,
  ) {
    this.mutation(req);
    this.secureResponse(res);
    return this.signing.telemetry(this.token(req), input);
  }
}
