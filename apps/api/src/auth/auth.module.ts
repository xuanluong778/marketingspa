import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { AuthMailService } from './auth-mail.service';
import { GoogleTokenVerifier } from './google-token.verifier';
import { AuditModule } from '../audit/audit.module';
import { AffiliateModule } from '../affiliate/affiliate.module';

@Module({
  imports: [
    AuditModule,
    AffiliateModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: config.get<string>('JWT_EXPIRES_IN', '15m') },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, AuthMailService, GoogleTokenVerifier],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
