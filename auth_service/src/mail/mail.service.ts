import { Injectable, Logger } from '@nestjs/common';
import { createTransport, Transporter } from 'nodemailer';
import { AppConfigService } from '../config/config.service';

/**
 * Sends the one kind of mail this service sends: the sign-up verification code.
 *
 * With SMTP_HOST set it goes out over SMTP. Without it (a developer's machine)
 * nothing leaves the process and, outside production, the message is written to
 * the log so the flow can still be walked through. A log line holding a code is
 * exactly what production must never write: there, a missing SMTP_HOST is an error
 * the caller reports, and the message itself is never logged.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null | undefined;

  constructor(private readonly config: AppConfigService) {}

  async send(to: string, subject: string, text: string): Promise<void> {
    const transporter = this.transport();
    if (!transporter) {
      if (this.config.nodeEnv === 'production') {
        throw new Error('SMTP_HOST is not set: mail cannot be sent');
      }
      this.logger.warn(
        `SMTP_HOST is not set, so no mail was sent (development only). To: ${to} | ${subject} | ${text}`,
      );
      return;
    }
    await transporter.sendMail({
      from: this.config.mailFrom,
      to,
      subject,
      text,
    });
  }

  private transport(): Transporter | null {
    if (this.transporter === undefined) {
      this.transporter = this.config.smtpHost
        ? createTransport({
            host: this.config.smtpHost,
            port: this.config.smtpPort,
            secure: this.config.smtpPort === 465,
            auth: this.config.smtpUser
              ? {
                  user: this.config.smtpUser,
                  pass: this.config.smtpPassword,
                }
              : undefined,
          })
        : null;
    }
    return this.transporter;
  }
}
