package com.trade.controller;

import com.trade.dto.OrderResponseDto;
import com.trade.dto.PlaceOrderRequestDto;
import com.trade.exception.DomainException;
import com.trade.exception.InvalidOrderException;
import com.trade.security.AuthenticatedPrincipal;
import com.trade.security.JwtAuthFilter;
import com.trade.enums.OrderStatus;
import com.trade.service.OrderService;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.beans.factory.annotation.Value;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

//business decision + write is delegated to logic and service
//two orders operations done (and validatied)
@RestController
@RequestMapping("/api/v1/orders")
public class OrderController {

    private final OrderService orderService;
    private final KafkaTemplate<String, String> kafkaTemplate;
    private final String orderTopic;

    public OrderController(OrderService orderService,
                           KafkaTemplate<String, String> kafkaTemplate,
                           @Value("${kafka.topics.orders:orders}") String orderTopic) {
        this.orderService = orderService;
        this.kafkaTemplate = kafkaTemplate;
        this.orderTopic = orderTopic;
    }

    @PostMapping
    public ResponseEntity<OrderResponseDto> placeOrder(@Valid @RequestBody PlaceOrderRequestDto request,
                                         @RequestAttribute(JwtAuthFilter.PRINCIPAL_ATTRIBUTE) AuthenticatedPrincipal principal)
            throws DomainException {
        Long accountId = principal.accountId();
        orderService.placeOrder(request, accountId);

        //when transaction is up publish ORDER_PLAED
        //an unpublished (but placed/like committed) order can be recovered by replaying order table
        //any event for rolled back order cant be replayed/undone
        String payload = String.format(
                "{\"eventId\":\"%s\",\"eventType\":\"ORDER_PLACED\",\"eventTime\":\"%s\",\"source\":\"trade-api\",\"schemaVersion\":1,\"payload\":{\"orderId\":\"ORD-%s\",\"accountId\":%d,\"symbol\":\"%s\",\"side\":\"%s\",\"quantity\":%d,\"price\":%d,\"idempotencyKey\":\"%s\",\"createdOn\":\"%s\"}}",
                UUID.randomUUID(),
                java.time.Instant.now().toString(),
                UUID.randomUUID(),
                accountId,
                request.symbol(),
                request.side(),
                request.quantity(),
                request.price(),
                request.idempotencyKey(),
                java.time.Instant.now().toString());

        kafkaTemplate.send(orderTopic, String.valueOf(accountId), payload);

        // returns order with "NEW" here as per story 3
        return ResponseEntity.ok(new OrderResponseDto(
                "ORD-" + UUID.randomUUID(),
                OrderStatus.NEW,
                "Order placed",
                request.symbol(),
                request.side(),
                request.quantity(),
                request.price()));
    }

    @DeleteMapping("/{id}")
    public OrderResponseDto cancelOrder(@PathVariable String id,
                                         @RequestAttribute(JwtAuthFilter.PRINCIPAL_ATTRIBUTE) AuthenticatedPrincipal principal)
            throws DomainException {
        return orderService.cancelOrder(parseOrderId(id), principal.accountId());
    }

    private UUID parseOrderId(String id) throws InvalidOrderException {
        try {
            return UUID.fromString(id);
        } catch (IllegalArgumentException e) {
            throw new InvalidOrderException("id");
        }
    }
}