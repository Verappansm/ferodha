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
  // allow(''): the repo-root .env (read via ../.env) ships these as empty
  // placeholders, and an empty string would otherwise fail boot validation.
  FAUXNANCE_API_URL: Joi.string().uri().allow('').optional(),
  FAUXNANCE_API_KEY: Joi.string().allow('').optional(),
});
