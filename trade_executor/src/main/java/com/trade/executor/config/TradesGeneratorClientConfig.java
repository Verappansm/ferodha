package com.trade.executor.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.web.client.RestClient;

// The client behind the live-ticker quote source (TradesGeneratorQuoteSource),
// stood up under every profile except the retired fauxnance-direct one.
@Configuration
@Profile("!fauxnance-direct")
public class TradesGeneratorClientConfig {

    @Bean
    public RestClient tradesGeneratorRestClient(@Value("${trades-generator.base-url:http://trades-generator:8083}") String baseUrl) {
        return RestClient.builder()
                .baseUrl(baseUrl)
                .build();
    }
}
