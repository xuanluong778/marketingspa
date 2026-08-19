import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

@Injectable()
export class BillingMailService {
  private readonly logger = new Logger(BillingMailService.name);
  private transporter: Transporter | null = null;

  constructor(private readonly config: ConfigService) {}

  private smtpConfigured() {
    return Boolean(
      (this.config.get<string>('SMTP_HOST') || '').trim() &&
      (this.config.get<string>('SMTP_USER') || '').trim() &&
      (this.config.get<string>('SMTP_PASS') || '').trim(),
    );
  }

  private getTransporter(): Transporter {
    if (this.transporter) return this.transporter;
    const host = (this.config.get<string>('SMTP_HOST') || '').trim();
    const port = Number(this.config.get<string>('SMTP_PORT') || '587');
    const user = (this.config.get<string>('SMTP_USER') || '').trim();
    const pass = (this.config.get<string>('SMTP_PASS') || '').replace(/\s+/g, '');
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
    return this.transporter;
  }

  private fromAddress(): string {
    const user = (this.config.get<string>('SMTP_USER') || '').trim();
    const configured = (this.config.get<string>('SMTP_FROM') || '').trim();
    if (configured && user && configured.toLowerCase().includes(user.toLowerCase())) {
      return configured;
    }
    return user ? `MarketingSpa <${user}>` : configured || 'thegioimarketingdigi@gmail.com';
  }

  async sendPaymentSuccess(params: {
    email: string;
    name: string;
    orderCode: string;
    planName: string;
    amountVnd: number;
    periodEnd: Date;
  }) {
    const subject = `Thanh toán thành công — ${params.orderCode}`;
    const amount = params.amountVnd.toLocaleString('vi-VN');
    const end = params.periodEnd.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    const text = [
      `Xin chào ${params.name},`,
      '',
      `Thanh toán đơn ${params.orderCode} đã thành công.`,
      `Gói: ${params.planName}`,
      `Số tiền: ${amount}đ`,
      `Hạn sử dụng đến: ${end}`,
      '',
      'Cảm ơn bạn đã sử dụng MarketingSpa.',
    ].join('\n');

    if (!this.smtpConfigured()) {
      this.logger.warn(`[billing-mail:dev] ${subject} → ${params.email}`);
      this.logger.log(text);
      return;
    }

    try {
      await this.getTransporter().sendMail({
        from: this.fromAddress(),
        to: params.email,
        subject,
        text,
      });
      this.logger.log(`[billing-mail:sent] ${params.email} ${params.orderCode}`);
    } catch (e) {
      this.logger.error(
        `[billing-mail:fail] ${params.email} ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  async sendGiftNotice(params: {
    email: string;
    name: string;
    durationLabel: string;
    creditsGranted: number;
    periodEnd: Date;
  }) {
    const hasDuration = Boolean(params.durationLabel?.trim());
    const hasCredit = params.creditsGranted > 0;
    const subject = hasDuration && hasCredit
      ? 'Bạn được tặng thời hạn sử dụng và AI Credit'
      : hasCredit
        ? 'Bạn được tặng AI Credit'
        : 'Bạn được tặng thời hạn sử dụng';
    const end = params.periodEnd.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    const creditLine = hasCredit
      ? `AI Credit tặng: ${params.creditsGranted.toLocaleString('vi-VN')}`
      : null;
    const intro = hasDuration && hasCredit
      ? 'Tài khoản của bạn vừa được tặng thời hạn sử dụng và AI Credit MarketingAutoAZ.'
      : hasCredit
        ? 'Tài khoản của bạn vừa được tặng AI Credit MarketingAutoAZ.'
        : 'Tài khoản của bạn vừa được tặng thời hạn sử dụng MarketingAutoAZ.';
    const text = [
      `Xin chào ${params.name},`,
      '',
      intro,
      ...(hasDuration ? [`Thời hạn: ${params.durationLabel}`] : []),
      ...(creditLine ? [creditLine] : []),
      `Hạn sử dụng đến: ${end}`,
      '',
      'Cảm ơn bạn đã sử dụng MarketingAutoAZ.',
    ].join('\n');

    if (!this.smtpConfigured()) {
      this.logger.warn(`[billing-mail:dev] ${subject} → ${params.email}`);
      this.logger.log(text);
      return;
    }

    try {
      await this.getTransporter().sendMail({
        from: this.fromAddress(),
        to: params.email,
        subject,
        text,
      });
      this.logger.log(`[billing-mail:gift-sent] ${params.email}`);
    } catch (e) {
      this.logger.error(
        `[billing-mail:gift-fail] ${params.email} ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
}
