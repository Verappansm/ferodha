import { ConfigService } from '@nestjs/config';
import { AppConfigService, MIN_JWT_SECRET_BYTES } from './config.service';

function withSecret(secret: string | undefined): AppConfigService {
  const config = {
    get: (key: string) => (key === 'JWT_SECRET' ? secret : undefined),
  } as unknown as ConfigService;
  return new AppConfigService(config);
}

describe('AppConfigService JWT_SECRET check', () => {
  it('refuses to start without JWT_SECRET', () => {
    expect(() => withSecret(undefined).onModuleInit()).toThrow(/JWT_SECRET/);
    expect(() => withSecret('').onModuleInit()).toThrow(/JWT_SECRET/);
  });

  it('refuses a secret shorter than 32 bytes', () => {
    expect(() =>
      withSecret('x'.repeat(MIN_JWT_SECRET_BYTES - 1)).onModuleInit(),
    ).toThrow(/at least 32 bytes/);
  });

  it('never puts the secret in the error message', () => {
    const secret = 'too-short-but-secret';
    let message = '';
    try {
      withSecret(secret).onModuleInit();
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/JWT_SECRET/);
    expect(message).not.toContain(secret);
  });

  it('accepts a secret of 32 bytes or more', () => {
    expect(() =>
      withSecret('x'.repeat(MIN_JWT_SECRET_BYTES)).onModuleInit(),
    ).not.toThrow();
  });
});
