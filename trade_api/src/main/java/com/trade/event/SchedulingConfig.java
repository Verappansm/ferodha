package com.trade.event;

import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

// Turns on @Scheduled for UnpublishedOrderSweeper. Kept off
// TradeApiApplication so @WebMvcTest slices, which read every annotation on
// the application class, do not start schedulers.
@Configuration
@EnableScheduling
public class SchedulingConfig {
}
