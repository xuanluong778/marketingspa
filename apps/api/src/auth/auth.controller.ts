import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { GoogleAuthDto } from './dto/google-auth.dto';
import {
  ResendRegistrationOtpDto,
  VerifyRegistrationOtpDto,
} from './dto/registration-otp.dto';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ClientIp } from '../common/decorators/client-ip.decorator';
import { SkipSubscription } from '../common/decorators/skip-subscription.decorator';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from './dto/auth-security.dto';
import {
  REFRESH_COOKIE_NAME,
  clearRefreshCookie,
  setRefreshCookie,
} from './auth-cookie.util';

function normalizeRef(raw?: string | null): string | undefined {
  if (!raw?.trim()) return undefined;
  const code = raw.trim().toUpperCase();
  return /^[A-Z0-9]{4,32}$/.test(code) ? code : undefined;
}

function readCookie(req: Request, name: string): string | undefined {
  const parsed = (req as Request & { cookies?: Record<string, string> }).cookies?.[name];
  if (parsed) return normalizeRef(parsed);
  const raw = String(req.headers.cookie || '');
  const re = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`, 'i');
  const m = raw.match(re);
  if (!m?.[1]) return undefined;
  try {
    return normalizeRef(decodeURIComponent(m[1]));
  } catch {
    return normalizeRef(m[1]);
  }
}

/** Ưu tiên: HttpOnly msa_ref → msa_ref_js → header X-Affiliate-Ref */
function readReferralCode(req: Request, bodyCode?: string): string | undefined {
  return (
    readCookie(req, 'msa_ref') ||
    readCookie(req, 'msa_ref_js') ||
    normalizeRef(String(req.headers['x-affiliate-ref'] || '')) ||
    normalizeRef(bodyCode)
  );
}

function authMeta(req: Request, ip?: string, bodyCode?: string) {
  return {
    ip,
    userAgent: req.headers['user-agent'],
    referralCode: readReferralCode(req, bodyCode),
  };
}

@Controller('auth')
@SkipSubscription()
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @ClientIp() ip?: string,
  ) {
    const result = await this.authService.register(dto, authMeta(req, ip));
    setRefreshCookie(res, result.refreshToken, this.config);
    const { refreshToken: _rt, ...body } = result;
    return body;
  }

  /** Gửi OTP đăng ký (chưa tạo tài khoản) */
  @Post('register/send-otp')
  sendRegistrationOtp(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @ClientIp() ip?: string,
  ) {
    return this.authService.sendRegistrationOtp(
      dto,
      authMeta(req, ip, dto.referralCode),
    );
  }

  /** Gửi lại OTP */
  @Post('register/resend-otp')
  resendRegistrationOtp(
    @Body() dto: ResendRegistrationOtpDto,
    @Req() req: Request,
    @ClientIp() ip?: string,
  ) {
    return this.authService.resendRegistrationOtp(dto.registrationId, authMeta(req, ip));
  }

  /** Xác minh OTP → tạo User + Organization + đăng nhập */
  @Post('register/verify-otp')
  async verifyRegistrationOtp(
    @Body() dto: VerifyRegistrationOtpDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @ClientIp() ip?: string,
  ) {
    const result = await this.authService.verifyRegistrationOtp(
      dto.registrationId,
      dto.otp,
      authMeta(req, ip),
    );
    setRefreshCookie(res, result.refreshToken, this.config);
    const { refreshToken: _rt, ...body } = result;
    return body;
  }

  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @ClientIp() ip?: string,
  ) {
    const result = await this.authService.login(dto, authMeta(req, ip));
    setRefreshCookie(res, result.refreshToken, this.config);
    const { refreshToken: _rt, ...body } = result;
    return body;
  }

  @Post('google')
  async google(
    @Body() dto: GoogleAuthDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @ClientIp() ip?: string,
  ) {
    const result = await this.authService.loginWithGoogle(
      dto.idToken,
      authMeta(req, ip, dto.referralCode),
    );
    setRefreshCookie(res, result.refreshToken, this.config);
    const { refreshToken: _rt, ...body } = result;
    return body;
  }

  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @ClientIp() ip?: string,
  ) {
    const refreshToken =
      (req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined) ??
      (typeof req.body?.refreshToken === 'string' ? req.body.refreshToken : undefined);
    if (!refreshToken) {
      clearRefreshCookie(res, this.config);
      throw new UnauthorizedException('Refresh token required');
    }

    const result = await this.authService.refresh(refreshToken, authMeta(req, ip));
    setRefreshCookie(res, result.refreshToken, this.config);
    const { refreshToken: _rt, ...body } = result;
    return body;
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @ClientIp() ip?: string,
  ) {
    const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
    const out = await this.authService.logout(user.id, refreshToken, ip);
    clearRefreshCookie(res, this.config);
    return out;
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  async logoutAll(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
    @ClientIp() ip?: string,
  ) {
    const out = await this.authService.logoutAll(user.id, ip);
    clearRefreshCookie(res, this.config);
    return out;
  }

  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto, @ClientIp() ip?: string) {
    return this.authService.forgotPassword(dto.email, ip);
  }

  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto, @ClientIp() ip?: string) {
    return this.authService.resetPassword(dto.token, dto.password, ip);
  }

  @Post('verify-email')
  verifyEmail(@Body() dto: VerifyEmailDto, @ClientIp() ip?: string) {
    return this.authService.verifyEmail(dto.token, ip);
  }

  @Post('resend-verification')
  @UseGuards(JwtAuthGuard)
  resendVerification(@CurrentUser() user: AuthUser) {
    return this.authService.resendVerification(user.id);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
    @ClientIp() ip?: string,
  ) {
    return this.authService.changePassword(
      user.id,
      dto.currentPassword,
      dto.newPassword,
      ip,
    );
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return this.authService.getCurrentUser(user.id);
  }
}
