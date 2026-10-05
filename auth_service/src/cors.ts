import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

/**
 * Lets the trading UI, served from its own origin, call this service from the
 * browser. Only the configured origins are allowed, never "*", and no
 * cookies: the access token travels in the Authorization header, and only on
 * /auth/me.
 */
export function corsOptions(allowedOrigins: string[]): CorsOptions {
  return {
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PATCH'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    exposedHeaders: ['Retry-After'],
    credentials: false,
    maxAge: 3600,
  };
}
