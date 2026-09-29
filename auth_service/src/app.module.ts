import { Module } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { createValidationPipe } from './common/validation.pipe';
import { AppConfigModule } from './config/config.module';
import { HealthController } from './health/health.controller';
import { PersistenceModule } from './persistence/persistence.module';

/**
 * The ValidationPipe and the exception filter are registered as APP_PIPE /
 * APP_FILTER providers rather than through `app.useGlobalPipes()` in main.ts,
 * so that any application built from this module - the real one, or a test
 * that mounts AppModule directly - runs the same validation and answers every
 * failure in the same envelope.
 */
@Module({
  imports: [AppConfigModule, PersistenceModule, AuthModule],
  controllers: [HealthController],
  providers: [
    { provide: APP_PIPE, useFactory: createValidationPipe },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
