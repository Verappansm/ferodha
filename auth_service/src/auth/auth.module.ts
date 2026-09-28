import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AppConfigModule } from '../config/config.module';
import { AppConfigService } from '../config/config.service';
import { PersistenceModule } from '../persistence/persistence.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { LoginAttemptLimiter } from './login-attempt-limiter';
import { LoginThrottleGuard } from './login-throttle.guard';
import { PasswordService } from './password.service';

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
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    JwtAuthGuard,
    LoginAttemptLimiter,
    LoginThrottleGuard,
  ],
  exports: [AuthService],
})
export class AuthModule {}
