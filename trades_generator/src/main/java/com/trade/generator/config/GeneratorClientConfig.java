package com.trade.generator.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;

// HTTP handle to the pricing service's own quote endpoint (see
// pricing-generator's QuoteController). OrderGenerator prices its synthetic
// orders off the live tick the same way it always has - only the lookup
// crossed a process boundary when pricing moved out of this service.
@Configuration
public class GeneratorClientConfig {

    @Bean
    public RestClient generatorRestClient(
            @Value("${pricing-generator.base-url:http://pricing-generator:8084}") String baseUrl) {
        return RestClient.builder()
                .baseUrl(baseUrl)
                .build();
    }
}
