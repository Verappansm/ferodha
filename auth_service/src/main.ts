import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { bodyErrorMiddleware } from './common/body-error.middleware';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  // After init() on purpose: body-parser and the router are already in place,
  // so the error middleware can catch what they reject. See the middleware's
  // own comment.
  await app.init();
  app.use(bodyErrorMiddleware);
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
