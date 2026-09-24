import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { validationSchema } from './validation.schema';
import { AppConfigService } from './config.service';

/**
 * Global: configuration is infrastructure, and every module that needs a
 * setting - including dynamically registered ones such as JwtModule, whose
 * factory injects AppConfigService - must be able to resolve it without each
 * parent re-importing this module by hand.
 */
@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      // Earlier paths win (@nestjs/config merges each file underneath what it
      // has already read): a developer's auth_service/.env.local or .env
      // overrides the repository-root .env, which is where the JWT_SECRET and
      // POSTGRES_* shared with trade_api live. Container environment
      // variables still take precedence over all of them.
      envFilePath: ['.env.local', '.env', '../.env'],
      validationSchema,
    }),
  ],
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class AppConfigModule {}
