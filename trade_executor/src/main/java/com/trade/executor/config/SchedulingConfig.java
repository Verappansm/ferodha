package com.trade.executor.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;

// MarketDataPoller schedules itself manually (not via @Scheduled) so it can
// recompute its own interval each cycle - explicit bean rather than relying
// on Boot's conditional @Scheduled-triggered autoconfiguration for this.
@Configuration
public class SchedulingConfig {

    @Bean
    public TaskScheduler taskScheduler() {
        ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(1);
        scheduler.setThreadNamePrefix("market-data-poller-");
        scheduler.initialize();
        return scheduler;
    }
}
