import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * HS256 is only as strong as its key: RFC 7518 requires a key at least as
 * long as the hash output, 256 bits (32 bytes). A shorter or missing
 * JWT_SECRET is refused at boot rather than discovered at the first login.
 */
export const MIN_JWT_SECRET_BYTES = 32;

@Injectable()
export class AppConfigService implements OnModuleInit {
  constructor(private configService: ConfigService) {}

  /**
   * Fail fast: the service does not start without a usable signing key.
   * Without this, an unset JWT_SECRET falls back to '' - login then dies
   * with a 500 at signing time and every protected request answers 401,
   * with nothing pointing at the real cause.
   */
  onModuleInit(): void {
    const secret = this.configService.get<string>('JWT_SECRET');
    if (!secret || Buffer.byteLength(secret, 'utf8') < MIN_JWT_SECRET_BYTES) {
      // Never include the value itself in the message.
      throw new Error(
        `JWT_SECRET must be set and at least ${MIN_JWT_SECRET_BYTES} bytes long (HS256).`,
      );
    }
  }

  get nodeEnv(): string {
    return this.configService.get<string>('NODE_ENV') || 'development';
  }

  get port(): number {
    return this.configService.get<number>('PORT') || 3000;
  }

  /** Validated at boot by onModuleInit - never empty once the app is up. */
  get jwtSecret(): string {
    return this.configService.get<string>('JWT_SECRET') || '';
  }

  get postgresHost(): string {
    return this.configService.get<string>('POSTGRES_HOST') || '';
  }

  get postgresPort(): number {
    return this.configService.get<number>('POSTGRES_PORT') || 5432;
  }

  get postgresDb(): string {
    return this.configService.get<string>('POSTGRES_DB') || '';
  }

  get postgresUser(): string {
    return this.configService.get<string>('POSTGRES_USER') || '';
  }

  get postgresPassword(): string {
    return this.configService.get<string>('POSTGRES_PASSWORD') || '';
  }

  /** The browser origins allowed to call this service, from CORS_ALLOWED_ORIGINS. */
  get corsAllowedOrigins(): string[] {
    return parseOrigins(
      this.configService.get<string>('CORS_ALLOWED_ORIGINS') ||
        'http://localhost:4200,http://localhost:4300',
    );
  }

  /** Contains the database password: never log this value. */
  get postgresUrl(): string {
    return `postgresql://${this.postgresUser}:${this.postgresPassword}@${this.postgresHost}:${this.postgresPort}/${this.postgresDb}`;
  }
}

/** Splits a comma-separated origin list, dropping blanks and stray spaces. */
export function parseOrigins(value: string): string[] {
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}
