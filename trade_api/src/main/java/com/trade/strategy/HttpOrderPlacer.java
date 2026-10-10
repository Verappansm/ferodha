package com.trade.strategy;

import com.trade.dto.OrderResponseDto;
import com.trade.dto.PlaceOrderRequestDto;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

// Calls this service's own order route over the loopback interface, so a
// strategy order takes exactly the path a customer's order does: the JWT
// filter, the bean validation, the domain rules, the idempotency check.
@Component
public class HttpOrderPlacer implements OrderPlacer {

    private final RestClient client;

    public HttpOrderPlacer(@Value("${server.port:8081}") int port) {
        this.client = RestClient.builder().baseUrl("http://localhost:" + port).build();
    }

    @Override
    public String place(String delegatedToken, PlaceOrderRequestDto order) {
        try {
            OrderResponseDto placed = client.post()
                    .uri("/api/v1/orders")
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + delegatedToken)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(order)
                    .retrieve()
                    .body(OrderResponseDto.class);
            if (placed == null || placed.orderId() == null) {
                throw new OrderPlacementException("The order route returned no order id");
            }
            return placed.orderId();
        } catch (RestClientResponseException e) {
            throw new OrderPlacementException("The order route answered " + e.getStatusCode().value()
                    + ": " + abbreviate(e.getResponseBodyAsString()));
        } catch (RestClientException e) {
            throw new OrderPlacementException("The order route could not be reached");
        }
    }

    private static String abbreviate(String body) {
        return body == null ? "" : body.length() <= 120 ? body : body.substring(0, 120);
    }
}
