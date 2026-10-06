package com.trade.mapper;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.context.annotation.Configuration;

// Separated from TradeApiApplication so that @WebMvcTest slices - which
// process every annotation on the nearest @SpringBootConfiguration directly,
// bypassing the slice's usual @Component/@Service exclusion filtering - don't
// also try to construct real MyBatis mapper proxies against a context that
// has no SqlSessionFactory.
@Configuration
@MapperScan({"com.trade.mapper", "com.trade.admin.mapper", "com.trade.strategy.mapper"})
public class MyBatisConfig {
}
