import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { invalidInput } from '../common/error-envelope';
import { MailService } from '../mail/mail.service';
import { EmailOtpsRepository } from '../persistence/email-otps.repository';
import { UsersRepository } from '../persistence/users.repository';

export const CODE_TTL_MS = 10 * 60 * 1000;
export const MAX_ATTEMPTS = 5;
export const RESEND_COOLDOWN_MS = 60 * 1000;

/**
 * Proves a new user owns the email address they registered with. The bank holds
 * the customer's account under that address, so a verified address is what lets
 * us treat the bank account as theirs.
 *
 * A code is six digits, lives ten minutes and is only ever stored as a hash. Five
 * wrong guesses burn it: six digits is only a million, so the guess budget is what
 * keeps it safe, not the length. Every failure is the same VAL-422, so the answer
 * never says whether the address is registered.
 */
@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);

  constructor(
    private readonly users: UsersRepository,
    private readonly otps: EmailOtpsRepository,
    private readonly mail: MailService,
  ) {}

  /** Creates a fresh code for the user and mails it. */
  async issue(userId: string, email: string): Promise<void> {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.otps.replace(
      userId,
      hashCode(userId, code),
      new Date(Date.now() + CODE_TTL_MS),
    );
    await this.mail.send(
      email,
      'Your Ferodha verification code',
      `Your verification code is ${code}. It expires in 10 minutes. If you did not register, ignore this message.`,
    );
    this.logger.log(`Verification code issued for user ${userId}`);
  }

  /** Mails a new code, at most one a minute. Says nothing about whether it did. */
  async resend(email: string): Promise<void> {
    const user = await this.users.findByEmail(email);
    if (!user || (await this.users.isEmailVerified(user.id))) {
      return;
    }
    const current = await this.otps.find(user.id);
    if (current && Date.now() - current.sentAt.getTime() < RESEND_COOLDOWN_MS) {
      return;
    }
    await this.issue(user.id, user.email);
  }

  async verify(email: string, code: string): Promise<void> {
    const user = await this.users.findByEmail(email);
    if (!user) {
      throw invalidInput();
    }
    if (await this.users.isEmailVerified(user.id)) {
      return;
    }
    // The guess is counted first, atomically: concurrent guesses cannot exceed the budget.
    const codeHash = await this.otps.claimAttempt(user.id, MAX_ATTEMPTS);
    if (!codeHash) {
      throw invalidInput();
    }
    const expected = Buffer.from(codeHash, 'hex');
    const given = Buffer.from(hashCode(user.id, code), 'hex');
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
      this.logger.warn(`Wrong verification code for user ${user.id}`);
      throw invalidInput();
    }
    await this.users.markEmailVerified(user.id);
    await this.otps.delete(user.id);
    this.logger.log(`Email verified: user ${user.id}`);
  }
}

function hashCode(userId: string, code: string): string {
  return createHash('sha256').update(`${userId}:${code}`).digest('hex');
}
