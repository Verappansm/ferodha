import * as Joi from 'joi';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3000),
  JWT_SECRET: Joi.string().min(32).required(),
  POSTGRES_HOST: Joi.string().required(),
  POSTGRES_PORT: Joi.number().default(5432),
  POSTGRES_DB: Joi.string().required(),
  POSTGRES_USER: Joi.string().required(),
  POSTGRES_PASSWORD: Joi.string().required(),
  // Comma-separated browser origins allowed to call this service (the
  // trading UI on 4200, the operations console on 4300). An allow list, never "*".
  CORS_ALLOWED_ORIGINS: Joi.string().default(
    'http://localhost:4200,http://localhost:4300',
  ),
  // FAUXNANCE_* also sits in the repo-root .env (read via ../.env). It is not
  // validated or read here: only the market-data side holds that key.
});
