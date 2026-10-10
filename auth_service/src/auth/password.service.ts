import { randomBytes } from 'node:crypto';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { compare, hash } from 'bcryptjs';

/** A well-formed bcrypt string: $2a$/$2b$/$2y$, two-digit cost, 53 chars. */
const BCRYPT_HASH = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

/**
 * Password storage. bcrypt at cost 12 - the floor the contract allows
 * ("argon2id or bcrypt at cost 12 or above"). See
 * contracts/docs/auth-password-hashing.md for why 12 and not higher.
 * Never MD5, never SHA-256, never an unsalted hash.
 */
@Injectable()
export class PasswordService implements OnModuleInit {
  static readonly COST = 12;

  /**
   * The decoy for "this username does not exist". Built once at start-up so
   * that the first unknown-user login does not also pay for creating it,
   * which would make that one request measurably slower than a wrong password.
   */
  private dummyHash?: Promise<string>;

  async onModuleInit(): Promise<void> {
    await this.decoy();
  }

  hash(plain: string): Promise<string> {
    return hash(plain, PasswordService.COST);
  }

  /**
   * bcryptjs answers `false` in about a millisecond for a stored value that
   * is not a bcrypt hash (a placeholder in seed data, a truncated column).
   * That would tell a stopwatch which usernames exist, so such a row costs a
   * full decoy comparison and still fails.
   */
  async verify(plain: string, storedHash: string): Promise<boolean> {
    if (!BCRYPT_HASH.test(storedHash)) {
      return this.verifyAgainstDecoy(plain);
    }
    return compare(plain, storedHash);
  }

  /**
   * Runs the same bcrypt work at the same cost as a real check, so an unknown
   * user and a wrong password cost the same wall-clock time. Always false.
   */
  async verifyAgainstDecoy(plain: string): Promise<false> {
    await compare(plain, await this.decoy());
    return false;
  }

  private decoy(): Promise<string> {
    this.dummyHash ??= hash(
      randomBytes(32).toString('hex'),
      PasswordService.COST,
    );
    return this.dummyHash;
  }
}
