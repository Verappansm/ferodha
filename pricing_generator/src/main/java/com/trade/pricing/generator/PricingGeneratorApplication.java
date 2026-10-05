package com.trade.pricing.generator;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

// @MapperScan deliberately lives on its own MyBatisConfig class, not here -
// same convention as trades-generator's own history: @WebMvcTest (and any
// future web slice test here) processes every annotation on the nearest
// @SpringBootConfiguration directly, so a @MapperScan on this class would
// make such a slice try to build real MyBatis mapper proxies against a
// context with no SqlSessionFactory.
@SpringBootApplication
@EnableScheduling
public class PricingGeneratorApplication {

    public static void main(String[] args) {
        SpringApplication.run(PricingGeneratorApplication.class, args);
    }
}
