import { HttpException } from '@nestjs/common';
import { MailService } from '../mail/mail.service';
import {
  EmailOtp,
  EmailOtpsRepository,
} from '../persistence/email-otps.repository';
import { AuthUser, UsersRepository } from '../persistence/users.repository';
import {
  CODE_TTL_MS,
  EmailVerificationService,
  MAX_ATTEMPTS,
  RESEND_COOLDOWN_MS,
} from './email-verification.service';
import { Role } from './role.enum';

const USER: AuthUser = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Priya',
  email: 'priya@example.com',
  passwordHash: 'x',
  status: 'ACTIVE',
  roles: [Role.CUSTOMER],
  createdAt: new Date('2026-01-01T00:00:00Z'),
  phone: undefined,
};

describe('EmailVerificationService', () => {
  let stored: EmailOtp | null;
  let verified: boolean;
  let sent: { to: string; text: string }[];
  let service: EmailVerificationService;

  const users = {
    findByEmail: (email: string) =>
      Promise.resolve(email === USER.email ? USER : null),
    isEmailVerified: () => Promise.resolve(verified),
    markEmailVerified: () => {
      verified = true;
      return Promise.resolve();
    },
  } as unknown as UsersRepository;

  const otps = {
    replace: (_id: string, codeHash: string, expiresAt: Date) => {
      stored = { codeHash, expiresAt, attempts: 0, sentAt: new Date() };
      return Promise.resolve();
    },
    find: () => Promise.resolve(stored),
    recordFailedAttempt: () => {
      if (stored) stored.attempts += 1;
      return Promise.resolve();
    },
    delete: () => {
      stored = null;
      return Promise.resolve();
    },
  } as unknown as EmailOtpsRepository;

  const mail = {
    send: (to: string, _subject: string, text: string) => {
      sent.push({ to, text });
      return Promise.resolve();
    },
  } as unknown as MailService;

  const lastCode = (): string => /\b(\d{6})\b/.exec(sent.at(-1)!.text)![1];
  const statusOf = async (p: Promise<unknown>): Promise<number> =>
    p.then(
      () => 0,
      (e: unknown) => (e as HttpException).getStatus(),
    );

  beforeEach(() => {
    stored = null;
    verified = false;
    sent = [];
    service = new EmailVerificationService(users, otps, mail);
  });

  it('mails a six-digit code to the registered address and stores only its hash', async () => {
    await service.issue(USER.id, USER.email);

    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(USER.email);
    expect(lastCode()).toMatch(/^\d{6}$/);
    expect(stored!.codeHash).not.toContain(lastCode());
    expect(stored!.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(
      CODE_TTL_MS,
    );
  });

  it('the right code verifies the email and uses the code up', async () => {
    await service.issue(USER.id, USER.email);

    await service.verify(USER.email, lastCode());

    expect(verified).toBe(true);
    expect(stored).toBeNull();
  });

  it('a wrong code is refused and counted, and the right one still works afterwards', async () => {
    await service.issue(USER.id, USER.email);
    const wrong = lastCode() === '000000' ? '000001' : '000000';

    expect(await statusOf(service.verify(USER.email, wrong))).toBe(422);
    expect(stored!.attempts).toBe(1);
    expect(verified).toBe(false);

    await service.verify(USER.email, lastCode());
    expect(verified).toBe(true);
  });

  it(`${MAX_ATTEMPTS} wrong guesses burn the code: even the right one is then refused`, async () => {
    await service.issue(USER.id, USER.email);
    const wrong = lastCode() === '000000' ? '000001' : '000000';
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      await statusOf(service.verify(USER.email, wrong));
    }

    expect(await statusOf(service.verify(USER.email, lastCode()))).toBe(422);
    expect(verified).toBe(false);
  });

  it('an expired code is refused', async () => {
    await service.issue(USER.id, USER.email);
    stored!.expiresAt = new Date(Date.now() - 1);

    expect(await statusOf(service.verify(USER.email, lastCode()))).toBe(422);
    expect(verified).toBe(false);
  });

  it('an unknown address gets the same refusal as a wrong code', async () => {
    expect(await statusOf(service.verify('nobody@example.com', '123456'))).toBe(
      422,
    );
  });

  it('a new code replaces the old one, and is not sent again within a minute', async () => {
    await service.issue(USER.id, USER.email);
    await service.resend(USER.email);
    expect(sent).toHaveLength(1);

    stored!.sentAt = new Date(Date.now() - RESEND_COOLDOWN_MS - 1);
    await service.resend(USER.email);
    expect(sent).toHaveLength(2);
  });

  it('nothing is mailed for an unknown address or one already verified', async () => {
    await service.resend('nobody@example.com');
    verified = true;
    await service.resend(USER.email);
    expect(sent).toHaveLength(0);
  });
});
