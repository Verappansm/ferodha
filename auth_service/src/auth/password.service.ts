import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { compare, hash } from 'bcryptjs';

/**
 * Password storage. bcrypt at cost 12 - the floor the contract allows
 * ("argon2id or bcrypt at cost 12 or above"), slow enough that an offline
 * attack on a stolen hash is expensive, fast enough (~250ms) to be usable.
 * Never MD5, never SHA-256, never an unsalted hash.
 */
@Injectable()
export class PasswordService {
  static readonly COST = 12;

  hash(plain: string): Promise<string> {
    return hash(plain, PasswordService.COST);
  }

  verify(plain: string, storedHash: string): Promise<boolean> {
    return compare(plain, storedHash);
  }

  /**
   * The decoy comparison for "this username does not exist": it runs the same
   * bcrypt work at the same cost as a real check, so an unknown user and a
   * wrong password cost the same wall-clock time. Without it, response latency
   * enumerates which usernames are registered.
   */
  private dummyHash?: Promise<string>;

  async verifyAgainstDecoy(plain: string): Promise<false> {
    this.dummyHash ??= hash(
      randomBytes(32).toString('hex'),
      PasswordService.COST,
    );
    await compare(plain, await this.dummyHash);
    return false;
  }
}
