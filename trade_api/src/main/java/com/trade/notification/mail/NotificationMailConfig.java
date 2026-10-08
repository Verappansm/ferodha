package com.trade.notification.mail;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.Properties;

// The outgoing mail server for notifications whose channel is EMAIL. Created only
// when SMTP_HOST is set, so a developer's machine with no mail server still starts
// and the notification is marked FAILED with a reason instead of pretending it was sent.
// Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD and MAIL_FROM (see .env.example).
@Configuration
public class NotificationMailConfig {

    private static final int CONNECT_TIMEOUT_MS = 5_000;

    // Mail goes out on its own small pool, so an order cancel or a price alert never waits on
    // the mail server. A full queue drops the attempt; the row stays QUEUED and the dispatcher's
    // retry sweep sends it.
    @Bean(name = "notificationMailExecutor")
    public ThreadPoolTaskExecutor notificationMailExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(2);
        executor.setMaxPoolSize(2);
        executor.setQueueCapacity(500);
        executor.setThreadNamePrefix("notification-mail-");
        executor.setRejectedExecutionHandler(new java.util.concurrent.ThreadPoolExecutor.DiscardPolicy());
        executor.setWaitForTasksToCompleteOnShutdown(true);
        executor.setAwaitTerminationSeconds(10);
        return executor;
    }

    @Bean(name = "notificationMailSender")
    @ConditionalOnExpression("!'${notification.mail.host:}'.isBlank()")
    public JavaMailSenderImpl notificationMailSender(
            @Value("${notification.mail.host}") String host,
            @Value("${notification.mail.port:587}") int port,
            @Value("${notification.mail.username:}") String username,
            @Value("${notification.mail.password:}") String password) {
        JavaMailSenderImpl sender = new JavaMailSenderImpl();
        sender.setHost(host);
        sender.setPort(port);
        sender.setDefaultEncoding("UTF-8");

        Properties props = sender.getJavaMailProperties();
        props.put("mail.smtp.connectiontimeout", String.valueOf(CONNECT_TIMEOUT_MS));
        props.put("mail.smtp.timeout", String.valueOf(CONNECT_TIMEOUT_MS));
        props.put("mail.smtp.writetimeout", String.valueOf(CONNECT_TIMEOUT_MS));
        if (!username.isBlank()) {
            sender.setUsername(username);
            sender.setPassword(password);
            props.put("mail.smtp.auth", "true");
        }
        if (port == 465) {
            props.put("mail.smtp.ssl.enable", "true");
        } else if (port == 587) {
            props.put("mail.smtp.starttls.enable", "true");
        }
        return sender;
    }
}
