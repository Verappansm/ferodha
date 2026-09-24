import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppConfigModule } from '../config/config.module';
import { AppConfigService } from '../config/config.service';
import { PersistenceModule } from '../persistence/persistence.module';
import { APP_FILTER } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { LoginThrottleGuard } from './login-throttle.guard';
import { PasswordService } from './password.service';
import { ThrottlerExceptionFilter } from './throttler-exception.filter';


@Module({
  imports: [
    AppConfigModule,
    PersistenceModule,
    ThrottlerModule.forRoot([
      {
        ttl: 15 * 60 * 1000,
        limit: 5,
      },
    ]),
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
    LoginThrottleGuard,
    {
      provide: APP_FILTER,
      useClass: ThrottlerExceptionFilter,
    },
  ],
  exports: [AuthService],
})
export class AuthModule {}
