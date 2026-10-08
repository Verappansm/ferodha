import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';

/**
 * What the journeys need from outside the two apps: the customer's bank (a
 * system the platform does not own, decision 0012) and the sign-up code the
 * auth service writes to its log when no mail server is configured.
 *
 * Database settings come from, in order: E2E_PG_* variables, windows/.env.windows
 * (the Windows setup), then the Docker defaults (trade / trade / tradedb).
 */
const REPO = resolve(__dirname, '../../..');

function windowsEnv(): Record<string, string> {
  const file = resolve(REPO, 'windows/.env.windows');
  if (!existsSync(file)) return {};
  const values: Record<string, string> = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Z_]+)\s*=\s*"?(.*?)"?\s*$/.exec(line);
    if (match && !line.trim().startsWith('#') && match[2] !== '') values[match[1]] = match[2];
  }
  return values;
}

function pgConfig() {
  const win = windowsEnv();
  return {
    host: process.env['E2E_PG_HOST'] ?? win['POSTGRES_HOST'] ?? 'localhost',
    port: Number(process.env['E2E_PG_PORT'] ?? win['POSTGRES_PORT'] ?? 5432),
    database: process.env['E2E_PG_DB'] ?? win['POSTGRES_DB'] ?? 'tradedb',
    user: process.env['E2E_PG_USER'] ?? win['POSTGRES_USER'] ?? 'trade',
    password: process.env['E2E_PG_PASSWORD'] ?? win['POSTGRES_PASSWORD'] ?? 'trade',
  };
}

/**
 * The stored PIN verifier for PIN 1234: bcrypt of the browser's proof of the
 * PIN (see trade-api changelog 020), as on the seeded bank accounts.
 */
export const BANK_PIN = '1234';
const PIN_1234_VERIFIER = '$2a$12$ch3EQdBNKa1elzmBWHiDD.X7/MPxjMcRYNO4UoYgmKaxnkp1tO6jG';

/** The bank opens an account under this email, as it would before a sign-up. */
export async function openBankAccount(email: string, balance = 50_000): Promise<string> {
  const number = `BANK-E2E-${Date.now().toString(36).toUpperCase()}`;
  const client = new Client(pgConfig());
  await client.connect();
  try {
    await client.query(
      `INSERT INTO Third_Party_Bank (bank_account_number, email, pin_hash, balance, currency)
       VALUES ($1, $2, $3, $4, 'USD')`,
      [number, email, PIN_1234_VERIFIER, balance],
    );
  } finally {
    await client.end();
  }
  return number;
}

/**
 * The newest sign-up code mailed to `email`. With no SMTP server the auth
 * service logs the mail (development only): read from E2E_AUTH_LOG, the
 * Windows setup's log, or `docker logs auth-service`, whichever exists.
 */
export function signupCode(email: string): string {
  const candidates = [
    process.env['E2E_AUTH_LOG'],
    resolve(REPO, 'windows/.run/logs/auth-service.log'),
  ].filter((p): p is string => !!p && existsSync(p));
  let log = candidates.map((p) => readFileSync(p, 'utf8')).join('\n');
  if (!log) {
    try {
      log = execFileSync('docker', ['logs', 'auth-service'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch {
      log = '';
    }
  }
  const lines = log.split(/\r?\n/).filter((line) => line.includes(`To: ${email}`));
  const code = /\b(\d{6})\b/.exec(lines.at(-1) ?? '')?.[1];
  if (!code) {
    throw new Error(
      `No sign-up code for ${email} in the auth service log. Leave SMTP_HOST unset, and set ` +
        'E2E_AUTH_LOG to the auth service log file if it is not in windows/.run/logs.',
    );
  }
  return code;
}
