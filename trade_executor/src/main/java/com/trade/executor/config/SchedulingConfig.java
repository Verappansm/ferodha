package com.trade.executor.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;

// MarketDataPoller and OrderExpiryScheduler both schedule themselves
// manually (not via @Scheduled) rather than relying on Boot's
// @Scheduled-triggered autoconfiguration - MarketDataPoller needs to
// recompute its own interval each cycle, and OrderExpiryScheduler follows
// the same shape for consistency. The two are mutually exclusive by
// profile (!market-sim vs market-sim), so one pool-size-1 scheduler is
// never actually shared between two running components at once.
@Configuration
public class SchedulingConfig {

    @Bean
    public TaskScheduler taskScheduler() {
        ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(1);
        scheduler.setThreadNamePrefix("trade-executor-scheduler-");
        scheduler.initialize();
        return scheduler;
    }
}
