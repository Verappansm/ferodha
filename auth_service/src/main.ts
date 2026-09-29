import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AppConfigService } from './config/config.service';
import { corsOptions } from './cors';
import { bodyErrorMiddleware } from './common/body-error.middleware';
import { RedactingLogger } from './common/logging/redacting-logger';
import { setupOpenApi } from './openapi';

async function bootstrap(): Promise<void> {
  // One logger for the whole service: Nest's own messages and every
  // `new Logger(...)` in our code go through the redacting logger.
  const app = await NestFactory.create(AppModule, {
    logger: new RedactingLogger(),
  });
  app.enableCors(corsOptions(app.get(AppConfigService).corsAllowedOrigins));
  setupOpenApi(app);
  // After init() on purpose: body-parser and the router are already in place,
  // so the error middleware can catch what they reject. See the middleware's
  // own comment.
  await app.init();
  app.use(bodyErrorMiddleware);
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
