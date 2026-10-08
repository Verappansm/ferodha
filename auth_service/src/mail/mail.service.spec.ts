import { Logger } from '@nestjs/common';
import { AppConfigService } from '../config/config.service';
import { MailService } from './mail.service';

// With no mail server a verification code is only ever logged outside production.
describe('MailService without SMTP_HOST', () => {
  afterEach(() => jest.restoreAllMocks());

  function mail(nodeEnv: string): MailService {
    return new MailService({
      smtpHost: '',
      nodeEnv,
    } as unknown as AppConfigService);
  }

  it('in development the message goes to the log so the flow can be walked through', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    await mail('development').send(
      'a@example.com',
      'Code',
      'Your code is 123456',
    );
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('123456'));
  });

  it('in production nothing holding the code is logged, and the send fails', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    await expect(
      mail('production').send('a@example.com', 'Code', 'Your code is 123456'),
    ).rejects.toThrow('SMTP_HOST is not set');
    for (const call of [...warn.mock.calls, ...log.mock.calls]) {
      expect(String(call[0])).not.toContain('123456');
    }
  });
});
