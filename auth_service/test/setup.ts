import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';

// The signing secret and the database settings are shared with trade_api and
// live in the repository-root .env; auth_service/.env, if a developer keeps
// one, wins over it. dotenv never overwrites a variable that is already set,
// so values exported by a CI job or a container keep priority.
loadEnv({ path: resolve(__dirname, '../../.env') });
loadEnv({ path: resolve(__dirname, '../.env') });

// Fallbacks so the suite still boots on a machine with none of the above -
// the tests then need a Postgres reachable with exactly these settings.
process.env.JWT_SECRET ??= 'test-secret-key-that-is-at-least-32-chars-long';
process.env.POSTGRES_HOST ??= 'localhost';
process.env.POSTGRES_DB ??= 'test_db';
process.env.POSTGRES_USER ??= 'test_user';
process.env.POSTGRES_PASSWORD ??= 'test_password';
process.env.POSTGRES_PORT ??= '5432';
