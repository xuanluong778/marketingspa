import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../../common/interfaces/auth-user.interface';

@Injectable()
export class GoogleAdsService {
  getOAuthStartUrl(_user: AuthUser, _context?: string): { url: string } {
    return { url: '' };
  }

  async disconnect(_user: AuthUser): Promise<void> {
    return;
  }
}
