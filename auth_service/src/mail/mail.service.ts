import { Injectable, Logger } from '@nestjs/common';
import { createTransport, Transporter } from 'nodemailer';
import { AppConfigService } from '../config/config.service';

/**
 * Sends the one kind of mail this service sends: the sign-up verification code.
 *
 * With SMTP_HOST set it goes out over SMTP. Without it (a developer's machine)
 * nothing leaves the process and the message is written to the log, so the flow
 * can still be walked through. That fallback is for development only: a log line
 * holding a code is exactly what production must never do, so production sets
 * SMTP_HOST.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null | undefined;

  constructor(private readonly config: AppConfigService) {}

  async send(to: string, subject: string, text: string): Promise<void> {
    const transporter = this.transport();
    if (!transporter) {
      this.logger.warn(
        `SMTP_HOST is not set, so no mail was sent. To: ${to} | ${subject} | ${text}`,
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
