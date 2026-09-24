import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AppConfigModule } from '../config/config.module';
import { AppConfigService } from '../config/config.service';
import { PersistenceModule } from '../persistence/persistence.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PasswordService } from './password.service';

/**
 * Registration, login, token refresh and the authenticated user's profile,
 * against contracts/auth-api.yaml.
 *
 * JwtModule signs with the shared HS256 secret from JWT_SECRET - the same
 * value trade_api verifies with - and always stamps `iss: auth-service`, so a
 * consumer that validates the configured issuer accepts exactly these tokens.
 */
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
          // The `iss` claim itself is written by AuthService, in the payload.
          // jsonwebtoken refuses to be told both, and consumers validate the
          // claim, not the option.
          expiresIn: 15 * 60,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  // Listed so the guard's own dependencies (JwtService, config) resolve from
  // this module however it gets instantiated.
  providers: [AuthService, PasswordService, JwtAuthGuard],
  exports: [AuthService],
})
export class AuthModule {}
