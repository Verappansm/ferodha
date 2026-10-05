package com.trade.generator;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

// @MapperScan deliberately lives on its own MyBatisConfig class, not here -
// trade_api's own history is the reason: @WebMvcTest (and any future web
// slice test here) processes every annotation on the nearest
// @SpringBootConfiguration directly, so a @MapperScan on this class would
// make such a slice try to build real MyBatis mapper proxies against a
// context with no SqlSessionFactory.
@SpringBootApplication
@EnableScheduling
public class TradesGeneratorApplication {

    public static void main(String[] args) {
        SpringApplication.run(TradesGeneratorApplication.class, args);
    }
}
