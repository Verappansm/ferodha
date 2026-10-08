package com.trade.notification.mail;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;

// Sends one plain-text mail over the configured SMTP server. Throws on any failure,
// which the dispatcher turns into a RETRYING / FAILED status.
@Component
public class NotificationMailer {

    private final ObjectProvider<JavaMailSender> sender;
    private final String from;

    public NotificationMailer(ObjectProvider<JavaMailSender> sender,
                              @Value("${notification.mail.from:Ferodha <no-reply@ferodha.local>}") String from) {
        this.sender = sender;
        this.from = from;
    }

    public boolean isConfigured() {
        return sender.getIfAvailable() != null;
    }

    public void send(String to, String subject, String text) throws MailException {
        JavaMailSender mailSender = sender.getIfAvailable();
        if (mailSender == null) {
            throw new IllegalStateException("No mail server is configured (set SMTP_HOST)");
        }
        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(from);
        message.setTo(to);
        message.setSubject(subject);
        message.setText(text);
        mailSender.send(message);
    }
}
