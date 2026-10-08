package com.trade.executor.ticker.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;

@Configuration
public class TickerFauxnanceConfig {

    @Bean
    public RestClient tickerFauxnanceRestClient(@Value("${fauxnance.base-url}") String baseUrl,
                                           @Value("${fauxnance.api-key}") String apiKey) {
        return RestClient.builder()
                .baseUrl(baseUrl)
                .defaultHeader("X-Api-Key", apiKey)
                .build();
    }
}
