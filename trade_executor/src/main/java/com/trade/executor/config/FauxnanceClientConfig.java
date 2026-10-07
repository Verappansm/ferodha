package com.trade.executor.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.web.client.RestClient;

// Only stood up for the retired fauxnance-direct profile; the default wiring
// needs no Fauxnance URL or key in the executor at all.
@Configuration
@Profile("fauxnance-direct")
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
