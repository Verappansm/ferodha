/**
 * Registration writes the user and their pending account request in one
 * transaction: both rows or neither, and an email already taken is still the
 * contract's AUTH-409.
 */
import type { Pool, PoolClient } from 'pg';
import { UsernameTakenError, UsersRepository } from './users.repository';

const USER_ROW = {
  user_id: '7d9f6f2c-9a1b-4e3f-8c2a-5b6d7e8f9a0b',
  email: 'new.user@example.com',
  password_hash: '$2b$12$hash',
  status: 'ACTIVE',
  role_name: 'client',
  created_at: new Date('2026-01-01T00:00:00.000Z'),
};

const INPUT = {
  name: 'New User',
  email: 'new.user@example.com',
  passwordHash: '$2b$12$hash',
};

function setup(failOn?: { sql: RegExp; code?: string }) {
  const statements: string[] = [];
  const query = jest.fn((sql: string, params?: unknown[]) => {
    statements.push(sql.trim().split(/\s+/).slice(0, 3).join(' '));
    if (failOn && failOn.sql.test(sql)) {
      return Promise.reject(
        Object.assign(new Error('db'), { code: failOn.code }),
      );
    }
    void params;
    return Promise.resolve({
      rows: /INSERT INTO Users/.test(sql) ? [USER_ROW] : [],
    });
  });
  const release = jest.fn();
  const client = { query, release } as unknown as PoolClient;
  const pool = { connect: () => Promise.resolve(client) } as unknown as Pool;
  return { repository: new UsersRepository(pool), statements, query, release };
}

describe('UsersRepository.createWithAccountRequest', () => {
  it('inserts the user and a pending account request, then commits', async () => {
    const { repository, statements, query, release } = setup();

    const user = await repository.createWithAccountRequest(INPUT);

    expect(user.id).toBe(USER_ROW.user_id);
    expect(statements).toEqual([
      'BEGIN',
      'INSERT INTO Users',
      'INSERT INTO account_requests',
      'COMMIT',
    ]);
    // The request is filed for the user just created.
    expect(query.mock.calls[2][1]).toEqual([USER_ROW.user_id]);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('rolls back and reports AUTH-409 when the email is taken', async () => {
    const { repository, statements, release } = setup({
      sql: /INSERT INTO Users/,
      code: '23505',
    });

    await expect(
      repository.createWithAccountRequest(INPUT),
    ).rejects.toBeInstanceOf(UsernameTakenError);
    expect(statements).toEqual(['BEGIN', 'INSERT INTO Users', 'ROLLBACK']);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('rolls the user back when the account request cannot be filed', async () => {
    const { repository, statements } = setup({ sql: /account_requests/ });

    await expect(
      repository.createWithAccountRequest(INPUT),
    ).rejects.not.toBeInstanceOf(UsernameTakenError);
    expect(statements).toEqual([
      'BEGIN',
      'INSERT INTO Users',
      'INSERT INTO account_requests',
      'ROLLBACK',
    ]);
  });
});
