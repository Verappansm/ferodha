import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AppConfigService {
  constructor(private configService: ConfigService) {}

  get nodeEnv(): string {
    return this.configService.get<string>('NODE_ENV') || 'development';
  }

  get port(): number {
    return this.configService.get<number>('PORT') || 3000;
  }

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

  get fauxnanceApiUrl(): string | undefined {
    return this.configService.get<string>('FAUXNANCE_API_URL');
  }

  get fauxnanceApiKey(): string | undefined {
    return this.configService.get<string>('FAUXNANCE_API_KEY');
  }

  get postgresUrl(): string {
    return `postgresql://${this.postgresUser}:${this.postgresPassword}@${this.postgresHost}:${this.postgresPort}/${this.postgresDb}`;
  }
}
