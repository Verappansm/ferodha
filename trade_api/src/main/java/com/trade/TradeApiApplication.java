package com.trade;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

// @MapperScan lives on com.trade.mapper.MyBatisConfig, not here - see that
// class's own comment for why: @WebMvcTest slices process every annotation
// on the nearest @SpringBootConfiguration directly, so a @MapperScan here
// would make them try to construct real MyBatis mapper proxies against a
// context that has no SqlSessionFactory.
@SpringBootApplication
public class TradeApiApplication {

    public static void main(String[] args) {
        SpringApplication.run(TradeApiApplication.class, args);
    }
}
