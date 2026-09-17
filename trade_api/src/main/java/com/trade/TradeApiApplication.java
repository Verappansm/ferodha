package com.trade;

import org.springframework.boot.SpringApplication;
import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
@MapperScan("com.trade.mapper")
public class TradeApiApplication {

    public static void main(String[] args) {
        SpringApplication.run(TradeApiApplication.class, args);
    }
}
