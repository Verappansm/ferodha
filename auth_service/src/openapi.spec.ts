/**
 * The OpenAPI document is generated from the controller and DTO decorators
 * and describes the four contract routes. Built here without a database; the
 * running service serves the same document at /docs/json.
 */
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { JwtService } from '@nestjs/jwt';
import { AppConfigService } from './config/config.service';
import { LoginAttemptLimiter } from './auth/login-attempt-limiter';
import { LoginThrottleGuard } from './auth/login-throttle.guard';
import { HealthController } from './health/health.controller';
import { buildOpenApiDocument } from './openapi';

describe('OpenAPI document', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController, HealthController],
      providers: [
        { provide: AuthService, useValue: {} },
        // What the guards on the routes need to be constructed; never called.
        { provide: JwtService, useValue: {} },
        { provide: AppConfigService, useValue: {} },
        LoginAttemptLimiter,
        LoginThrottleGuard,
      ],
    }).compile();
    app = moduleRef.createNestApplication();
  });

  afterAll(() => app.close());

  it('describes exactly the four contract routes', () => {
    const document = buildOpenApiDocument(app);

    expect(document.openapi).toMatch(/^3\./);
    expect(Object.keys(document.paths).sort()).toEqual([
      '/auth/change-password',
      '/auth/login',
      '/auth/me',
      '/auth/refresh',
      '/auth/register',
    ]);
    expect(Object.keys(document.paths['/auth/register'])).toEqual(['post']);
    expect(Object.keys(document.paths['/auth/me'])).toEqual(['get']);
  });

  it('marks only /auth/me as needing a bearer token', () => {
    const document = buildOpenApiDocument(app);

    expect(document.paths['/auth/me'].get?.security).toEqual([{ bearer: [] }]);
    expect(document.paths['/auth/login'].post?.security).toBeUndefined();
  });

  it('documents the request and response schemas from the DTOs', () => {
    const schemas = buildOpenApiDocument(app).components?.schemas ?? {};

    expect(Object.keys(schemas)).toEqual(
      expect.arrayContaining([
        'RegisterRequestDto',
        'LoginRequestDto',
        'RefreshRequestDto',
        'UserResponseDto',
        'TokenResponseDto',
        'ErrorResponseDto',
      ]),
    );
  });
});
