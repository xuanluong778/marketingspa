import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client, type TokenPayload } from 'google-auth-library';

export type VerifiedGoogleIdentity = {
  googleSub: string;
  email: string;
  emailVerified: boolean;
  name: string;
  avatarUrl: string | null;
};

@Injectable()
export class GoogleTokenVerifier {
  private client: OAuth2Client | null = null;

  constructor(private readonly config: ConfigService) {}

  private getClient(): OAuth2Client {
    if (!this.client) {
      this.client = new OAuth2Client();
    }
    return this.client;
  }

  getAudience(): string {
    const clientId = (this.config.get<string>('GOOGLE_CLIENT_ID') || '').trim();
    if (!clientId) {
      throw new UnauthorizedException('Google Sign-In chưa được cấu hình trên server');
    }
    return clientId;
  }

  async verifyIdToken(idToken: string): Promise<VerifiedGoogleIdentity> {
    const audience = this.getAudience();
    let payload: TokenPayload | undefined;
    try {
      const ticket = await this.getClient().verifyIdToken({
        idToken,
        audience,
      });
      payload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException('Google token không hợp lệ hoặc đã hết hạn');
    }

    if (!payload?.sub || !payload.email) {
      throw new UnauthorizedException('Google token thiếu thông tin người dùng');
    }

    // Chống token giả / chưa verify email
    if (payload.email_verified !== true) {
      throw new UnauthorizedException('Email Google chưa được xác minh');
    }

    if (payload.aud !== audience) {
      throw new UnauthorizedException('Google token không thuộc ứng dụng này');
    }

    return {
      googleSub: payload.sub,
      email: payload.email.toLowerCase().trim(),
      emailVerified: true,
      name: (payload.name || payload.email.split('@')[0] || 'Google User').trim(),
      avatarUrl: payload.picture?.trim() || null,
    };
  }
}
