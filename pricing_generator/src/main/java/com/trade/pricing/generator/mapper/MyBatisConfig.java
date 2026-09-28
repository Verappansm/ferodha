package com.trade.pricing.generator.mapper;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.context.annotation.Configuration;

@Configuration
@MapperScan("com.trade.pricing.generator.mapper")
public class MyBatisConfig {
}
