package com.trade.generator.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;

@Configuration
public class FauxnanceClientConfig {

    @Bean
    public RestClient fauxnanceRestClient(@Value("${fauxnance.base-url}") String baseUrl,
                                           @Value("${fauxnance.api-key}") String apiKey) {
        return RestClient.builder()
                .baseUrl(baseUrl)
                .defaultHeader("X-Api-Key", apiKey)
                .build();
    }
}
