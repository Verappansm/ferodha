import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Pool } from 'pg';
import { SCHEMA_PROBE, SCHEMA_STATEMENTS } from './schema';

export const PG_POOL = 'PG_POOL';

/**
 * Owns the connection pool for the service: makes sure the auth service's
 * own table (and its column on the platform's Users row) exist before the
 * first request arrives, and closes the pool on shutdown so neither the
 * process nor a test run leaks open sockets.
 *
 * Start-up is deliberately strict: a service that cannot reach its database
 * has no way to register or authenticate anyone, so it fails here, loudly and
 * without echoing the connection string, rather than turning every /auth call
 * into a 500 later. When everything is already in place - the normal case -
 * only the probe runs, so no DDL privilege is needed on a locked-down
 * database. The Sprint 3 schema itself (Users, Accounts, Roles) is never
 * created here; that is ./database/apply.sh's job.
 */
@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);

  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.pool.query(SCHEMA_PROBE);
      return;
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code !== '42P01' && code !== '42703') {
        // Neither "relation does not exist" (own table to create) nor
        // "column does not exist" (Users.account_id to add) - so: an
        // unreachable database, bad credentials, or the Sprint 3 schema
        // itself missing, which only ./database/apply.sh lays down (the
        // first ALTER below then fails naming Users). Fail fast; the
        // driver's own code is enough to diagnose it and never echoes the
        // password.
        this.logger.error(
          `Cannot reach the auth tables (postgres code ${code ?? 'unknown'}). ` +
            'Check POSTGRES_HOST/POSTGRES_PORT/POSTGRES_DB/POSTGRES_USER/POSTGRES_PASSWORD.',
        );
        throw error;
      }
    }

    this.logger.log('Creating auth service tables');
    for (const statement of SCHEMA_STATEMENTS) {
      await this.pool.query(statement);
    }
  }

  onModuleDestroy(): Promise<void> {
    return this.pool.end();
  }
}

/**
 * Builds the shared pool from the validated configuration. The parameter type
 * is structural so this module does not depend on the config service's class,
 * only on the values it exposes.
 */
export function createPool(config: {
  postgresHost: string;
  postgresPort: number;
  postgresDb: string;
  postgresUser: string;
  postgresPassword: string;
}): Pool {
  const pool = new Pool({
    host: config.postgresHost,
    port: config.postgresPort,
    database: config.postgresDb,
    user: config.postgresUser,
    password: config.postgresPassword,
    max: 10,
  });
  // An idle client that dies (restart, network blip) must not take the whole
  // process down; pg would otherwise emit an unhandled 'error' event.
  pool.on('error', () => {
    /* the query that was using the client reports its own failure instead */
  });
  return pool;
}
