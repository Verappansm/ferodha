package com.trade.web;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.CorsFilter;

import java.util.Arrays;
import java.util.List;

// Lets the Angular UI (4200) and the operations console (4300), each served
// from its own origin, call /api/v1/**. Runs
// ahead of JwtAuthFilter so a preflight (which carries no token) is answered
// here instead of getting AUTH-401, and so a real 401 still carries the CORS
// headers the browser needs to show the error body rather than status 0.
// Origins are an explicit allow list from CORS_ALLOWED_ORIGINS; never "*".
@Configuration
public class CorsConfig {

    @Bean
    public FilterRegistrationBean<CorsFilter> corsFilter(
            @Value("${CORS_ALLOWED_ORIGINS:http://localhost:4200,http://localhost:4300}") String allowedOrigins) {
        FilterRegistrationBean<CorsFilter> registration =
                new FilterRegistrationBean<>(new CorsFilter(corsConfigurationSource(allowedOrigins)));
        registration.setOrder(Ordered.HIGHEST_PRECEDENCE);
        return registration;
    }

    static UrlBasedCorsConfigurationSource corsConfigurationSource(String allowedOrigins) {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(parseOrigins(allowedOrigins));
        config.setAllowedMethods(List.of("GET", "POST", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("Authorization", "Content-Type"));
        // The token travels in the Authorization header, never a cookie.
        config.setAllowCredentials(false);
        config.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/v1/**", config);
        return source;
    }

    private static List<String> parseOrigins(String allowedOrigins) {
        return Arrays.stream(allowedOrigins.split(","))
                .map(String::trim)
                .filter(origin -> !origin.isEmpty())
                .toList();
    }
}
