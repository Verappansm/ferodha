package com.trade.executor;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

// @EnableScheduling drives the price feed (com.trade.executor.ticker) and, under market-sim,
// the market maker (com.trade.executor.marketmaker), both moved in from their own services.
@SpringBootApplication
@EnableScheduling
public class TradeExecutorApplication {

    public static void main(String[] args) {
        SpringApplication.run(TradeExecutorApplication.class, args);
    }
}
