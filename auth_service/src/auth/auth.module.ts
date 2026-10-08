import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AppConfigModule } from '../config/config.module';
import { AppConfigService } from '../config/config.service';
import { PersistenceModule } from '../persistence/persistence.module';
import { MailService } from '../mail/mail.service';
import { AuthController } from './auth.controller';
import { EmailVerificationService } from './email-verification.service';
import { VerificationController } from './verification.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { LoginAttemptLimiter } from './login-attempt-limiter';
import { LoginThrottleGuard } from './login-throttle.guard';
import { PasswordService } from './password.service';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';

@Module({
  imports: [
    AppConfigModule,
    PersistenceModule,
    JwtModule.registerAsync({
      global: true,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        secret: config.jwtSecret,
        signOptions: {
          algorithm: 'HS256',
          expiresIn: 15 * 60,
        },
      }),
    }),
  ],
  controllers: [AuthController, VerificationController, ProfileController],
  providers: [
    AuthService,
    EmailVerificationService,
    MailService,
    ProfileService,
    PasswordService,
    JwtAuthGuard,
    LoginAttemptLimiter,
    LoginThrottleGuard,
  ],
  exports: [AuthService, ProfileService],
})
export class AuthModule {}
