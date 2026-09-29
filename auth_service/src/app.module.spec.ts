/**
 * The application runs the ValidationPipe that strips the submitted body and
 * rejected value off validation errors (see validation.pipe.spec.ts). An
 * earlier copy without that setting was the one actually wired in, while the
 * spec tested the other; this pins the wiring itself.
 */
import { APP_PIPE } from '@nestjs/core';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { AppModule } from './app.module';
import { createValidationPipe } from './common/validation.pipe';

describe('AppModule', () => {
  it('registers the redacting ValidationPipe as the global pipe', () => {
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      AppModule,
    ) as Array<{ provide?: unknown; useFactory?: unknown }>;

    const pipe = providers.find((provider) => provider.provide === APP_PIPE);
    expect(pipe?.useFactory).toBe(createValidationPipe);
  });
});
