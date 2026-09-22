package com.trade.generator.mapper;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.context.annotation.Configuration;

@Configuration
@MapperScan("com.trade.generator.mapper")
public class MyBatisConfig {
}
