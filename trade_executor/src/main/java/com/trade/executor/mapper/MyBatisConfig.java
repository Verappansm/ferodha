package com.trade.executor.mapper;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.context.annotation.Configuration;

@Configuration
@MapperScan("com.trade.executor.mapper")
public class MyBatisConfig {
}
