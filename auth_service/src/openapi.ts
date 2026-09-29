import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

/** Where the running service publishes its OpenAPI document. */
export const DOCS_PATH = 'docs';
export const DOCS_JSON_PATH = 'docs/json';

/**
 * Generated from the controller and DTO decorators, never kept by hand, so it
 * describes what is actually deployed. contracts/auth-api.yaml stays the
 * specification; this is the evidence the code still matches it.
 */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Auth service')
    .setDescription(
      'Registration, login, token refresh and the current user. Access tokens are HS256 and carry exactly sub, accountId, roles, iat, exp and iss.',
    )
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  return SwaggerModule.createDocument(app, config);
}

/**
 * Serves the human page at /docs and the JSON at /docs/json. Must run before
 * app.init(): init() installs Nest's catch-all 404, and a route added after
 * it is never reached.
 */
export function setupOpenApi(app: INestApplication): void {
  SwaggerModule.setup(DOCS_PATH, app, buildOpenApiDocument(app), {
    jsonDocumentUrl: DOCS_JSON_PATH,
  });
}
