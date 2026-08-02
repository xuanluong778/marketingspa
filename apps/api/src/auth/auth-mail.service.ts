import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

@Injectable()
export class AuthMailService {
  private readonly logger = new Logger(AuthMailService.name);
  private transporter: Transporter | null = null;

  constructor(private readonly config: ConfigService) {}

  private smtpConfigured(): boolean {
    return Boolean(
      (this.config.get<string>('SMTP_HOST') || '').trim() &&
        (this.config.get<string>('SMTP_USER') || '').trim() &&
        (this.config.get<string>('SMTP_PASS') || '').trim(),
    );
  }

  /** Gmail App Password thường hiện có khoảng trắng — bỏ khoảng trắng khi auth */
  private smtpPass(): string {
    return (this.config.get<string>('SMTP_PASS') || '').replace(/\s+/g, '');
  }

  private getTransporter(): Transporter {
    if (this.transporter) return this.transporter;
    const host = (this.config.get<string>('SMTP_HOST') || '').trim();
    const port = Number(this.config.get<string>('SMTP_PORT') || '587');
    const user = (this.config.get<string>('SMTP_USER') || '').trim();
    const pass = this.smtpPass();
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
    return this.transporter;
  }

  private fromAddress(): string {
    const configured = (this.config.get<string>('SMTP_FROM') || '').trim();
    const user = (this.config.get<string>('SMTP_USER') || '').trim();
    // Gmail yêu cầu From trùng (hoặc alias của) tài khoản đăng nhập SMTP
    if (configured && user && configured.toLowerCase().includes(user.toLowerCase())) {
      return configured;
    }
    if (user) return `MarketingSpa <${user}>`;
    return configured || 'thegioimarketingdigi@gmail.com';
  }

  /** Gửi email xác minh / đặt lại mật khẩu. */
  async sendActionLink(
    type: 'verify-email' | 'reset-password',
    email: string,
    token: string,
  ): Promise<void> {
    const appUrl = (this.config.get<string>('APP_URL') ?? 'http://localhost:3000').replace(
      /\/$/,
      '',
    );
    const path =
      type === 'verify-email'
        ? `/verify-email?token=${encodeURIComponent(token)}`
        : `/reset-password?token=${encodeURIComponent(token)}`;
    const link = `${appUrl}${path}`;

    const subject =
      type === 'verify-email' ? 'Xác minh email MarketingSpa' : 'Đặt lại mật khẩu MarketingSpa';
    const text = `Xin chào,\n\nMở liên kết sau (có hiệu lực giới hạn):\n${link}\n\nNếu bạn không yêu cầu, hãy bỏ qua email này.`;

    await this.dispatch(email, subject, text);
  }

  async sendRegistrationOtp(email: string, otp: string, name: string): Promise<void> {
    const subject = 'Mã OTP đăng ký MarketingSpa';
    const text = [
      `Xin chào ${name},`,
      '',
      `Mã OTP đăng ký của bạn là: ${otp}`,
      'Mã có hiệu lực trong 5 phút và chỉ dùng một lần.',
      '',
      'Nếu bạn không yêu cầu đăng ký, hãy bỏ qua email này.',
    ].join('\n');
    const html = `
      <p>Xin chào <strong>${escapeHtml(name)}</strong>,</p>
      <p>Mã OTP đăng ký MarketingSpa của bạn:</p>
      <p style="font-size:28px;letter-spacing:8px;font-weight:700">${escapeHtml(otp)}</p>
      <p>Mã có hiệu lực trong <strong>5 phút</strong> và chỉ dùng một lần.</p>
      <p style="color:#666">Nếu bạn không yêu cầu đăng ký, hãy bỏ qua email này.</p>
    `;

    await this.dispatch(email, subject, text, { html, debugOtp: otp, requireSmtp: true });
  }

  private async dispatch(
    email: string,
    subject: string,
    text: string,
    opts?: { html?: string; debugOtp?: string; requireSmtp?: boolean },
  ): Promise<void> {
    const allowDevFallback =
      (this.config.get<string>('AUTH_OTP_DEV_FALLBACK') || '').trim() === 'true' ||
      (this.config.get<string>('NODE_ENV') || '').trim() === 'development';

    if (!this.smtpConfigured()) {
      if (opts?.requireSmtp && !allowDevFallback) {
        this.logger.error(`[mail] SMTP chưa cấu hình — không thể gửi OTP tới ${email}`);
        throw new ServiceUnavailableException(
          'Hệ thống chưa cấu hình gửi email. Vui lòng thử lại sau hoặc liên hệ hỗ trợ.',
        );
      }
      this.logger.warn(
        `[mail:dev-fallback] SMTP chưa cấu hình — to=${email} subject=${subject}` +
          (opts?.debugOtp ? ` otp=${opts.debugOtp}` : ''),
      );
      this.logger.log(text);
      return;
    }

    try {
      await this.getTransporter().sendMail({
        from: this.fromAddress(),
        to: email,
        subject,
        text,
        html: opts?.html,
      });
      this.logger.log(`[mail:sent] to=${email} subject=${subject}`);
    } catch (e) {
      this.logger.error(
        `[mail:fail] to=${email} ${e instanceof Error ? e.message : String(e)}`,
      );
      throw new ServiceUnavailableException(
        'Không gửi được email OTP. Vui lòng thử lại sau hoặc kiểm tra cấu hình SMTP.',
      );
    }
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
