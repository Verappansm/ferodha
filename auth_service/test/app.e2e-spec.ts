/**
 * End to end against a real Postgres carrying the Sprint 3 schema (the same
 * database docker compose or windows/start-windows.ps1 brings up). Unlike the
 * unit suites this needs the database, so it is `npm run test:e2e`, not part
 * of `npm test`.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { bodyErrorMiddleware } from '../src/common/body-error.middleware';
import { setupOpenApi } from '../src/openapi';

const PASSWORD = 'correct horse battery staple';

describe('auth service (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // The same order as main.ts.
    setupOpenApi(app);
    await app.init();
    app.use(bodyErrorMiddleware);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('GET /health answers', () =>
    request(app.getHttpServer()).get('/health').expect(200, { status: 'ok' }));

  it('GET /docs/json serves an OpenAPI document with the four routes', async () => {
    const response = await request(app.getHttpServer())
      .get('/docs/json')
      .expect(200);
    const body = response.body as { openapi: string; paths: object };
    expect(body.openapi).toMatch(/^3\./);
    expect(Object.keys(body.paths).sort()).toEqual([
      '/auth/login',
      '/auth/me',
      '/auth/refresh',
      '/auth/register',
    ]);
  });

  it('an unknown path still answers in the envelope', () =>
    request(app.getHttpServer())
      .get('/nope')
      .expect(404, { errorCode: 'VAL-422', message: 'Invalid input' }));

  it('registers a user with a pending account request, who cannot log in until it is approved', async () => {
    const email = `E2E.${Date.now()}@Example.com`;

    const registered = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ username: email, password: PASSWORD })
      .expect(201);
    const user = registered.body as Record<string, unknown>;
    expect(user.username).toBe(email.toLowerCase());
    expect(user).not.toHaveProperty('accountId');
    expect(user).not.toHaveProperty('accessToken');

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: email, password: PASSWORD })
      .expect(401, { errorCode: 'AUTH-401', message: 'Unauthorised' });
  });

  it('refuses the same email in a different case as already taken', async () => {
    const email = `e2e.case.${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ username: email, password: PASSWORD })
      .expect(201);
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ username: email.toUpperCase(), password: PASSWORD })
      .expect(409, { errorCode: 'AUTH-409', message: 'Registration failed' });
  });
});
