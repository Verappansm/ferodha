/**
 * Unit test execution paths for "Credential Store and Password Hashing":
 *   - correct password verifies
 *   - incorrect password fails verification
 *   - a general-purpose digest such as MD5 or SHA is not used
 *
 * These run real bcrypt at the real cost - a stubbed hash would prove
 * nothing about what is stored - so each hash takes a noticeable fraction
 * of a second, and the timeout is raised accordingly.
 */
import { createHash } from 'node:crypto';
import { PasswordService } from './password.service';

jest.setTimeout(30_000);

const PASSWORD = 'correct horse battery staple';

/** `$2a$` / `$2b$` / `$2y$`, two-digit cost, 22-char salt + 31-char hash. */
const BCRYPT_FORMAT = /^\$2[aby]\$(\d{2})\$[./A-Za-z0-9]{53}$/;

describe('PasswordService', () => {
  const service = new PasswordService();
  let stored: string;

  beforeAll(async () => {
    stored = await service.hash(PASSWORD);
  });

  it('verifies the correct password', async () => {
    await expect(service.verify(PASSWORD, stored)).resolves.toBe(true);
  });

  it('fails verification for an incorrect password', async () => {
    await expect(service.verify('wrong password', stored)).resolves.toBe(false);
    // Near misses too: case, a trailing space, an empty string.
    await expect(service.verify(PASSWORD.toUpperCase(), stored)).resolves.toBe(
      false,
    );
    await expect(service.verify(`${PASSWORD} `, stored)).resolves.toBe(false);
    await expect(service.verify('', stored)).resolves.toBe(false);
  });

  it('stores bcrypt at cost 12 or above, not a general-purpose digest', () => {
    const match = BCRYPT_FORMAT.exec(stored);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBeGreaterThanOrEqual(12);
    expect(PasswordService.COST).toBeGreaterThanOrEqual(12);

    // Not plaintext, and not any MD5/SHA digest of it in hex or base64.
    expect(stored).not.toContain(PASSWORD);
    for (const algorithm of ['md5', 'sha1', 'sha256', 'sha512']) {
      const digest = createHash(algorithm).update(PASSWORD).digest();
      expect(stored).not.toContain(digest.toString('hex'));
      expect(stored).not.toContain(digest.toString('base64'));
    }
  });

  it('salts every hash: the same password never hashes the same way twice', async () => {
    const again = await service.hash(PASSWORD);
    expect(again).not.toBe(stored);
    await expect(service.verify(PASSWORD, again)).resolves.toBe(true);
  });

  it('the unknown-user decoy never verifies', async () => {
    await expect(service.verifyAgainstDecoy(PASSWORD)).resolves.toBe(false);
  });

  it('a stored value that is not a bcrypt hash fails through the decoy, not instantly', async () => {
    const decoy = jest.spyOn(service, 'verifyAgainstDecoy');
    await expect(
      service.verify(PASSWORD, '$2b$12$placeholder_hash'),
    ).resolves.toBe(false);
    expect(decoy).toHaveBeenCalledTimes(1);
    decoy.mockRestore();
  });
});
