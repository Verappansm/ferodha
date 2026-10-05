/**
 * The UI's origin gets the CORS headers and nothing else does, so a browser
 * page on any other origin cannot read this service's responses.
 */
import { Controller, INestApplication, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { corsOptions } from './cors';

@Controller('auth')
class ProbeController {
  @Post('login')
  login() {
    return {};
  }
}

const UI_ORIGIN = 'http://localhost:4200';

describe('CORS', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ProbeController],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.enableCors(corsOptions([UI_ORIGIN, 'http://localhost:4300']));
    await app.init();
  });

  afterAll(() => app.close());

  function preflight(origin: string) {
    return request(app.getHttpServer())
      .options('/auth/login')
      .set('Origin', origin)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type');
  }

  it('answers a preflight from an allowed origin', async () => {
    const response = await preflight(UI_ORIGIN);
    expect(response.headers['access-control-allow-origin']).toBe(UI_ORIGIN);
  });

  it('allows every origin in the configured list', async () => {
    const response = await preflight('http://localhost:4300');
    expect(response.headers['access-control-allow-origin']).toBe(
      'http://localhost:4300',
    );
  });

  it('gives an origin not on the list no CORS header', async () => {
    const response = await preflight('http://evil.example');
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});
