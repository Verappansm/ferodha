package com.trade.controller;

import com.trade.dto.OrderResponseDto;
import com.trade.dto.OrderReviewRequestDto;
import com.trade.dto.OrderReviewResponseDto;
import com.trade.dto.PlaceOrderRequestDto;
import com.trade.event.OrderPlacedPayload;
import com.trade.notification.enums.NotificationEventType;
import com.trade.notification.service.NotificationService;
import com.trade.event.OrderPlacedPublisher;
import com.trade.exception.DomainException;
import com.trade.exception.InvalidOrderException;
import com.trade.security.AuthenticatedPrincipal;
import com.trade.security.JwtAuthFilter;
import com.trade.service.OrderService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.UUID;

//business decision + write is delegated to logic and service
//two orders operations done (and validatied)
@RestController
@RequestMapping("/api/v1/orders")
public class OrderController {

    private final OrderService orderService;
    private final OrderPlacedPublisher orderPlacedPublisher;
    private final NotificationService notifications;

    public OrderController(OrderService orderService, OrderPlacedPublisher orderPlacedPublisher,
                           NotificationService notifications) {
        this.orderService = orderService;
        this.orderPlacedPublisher = orderPlacedPublisher;
        this.notifications = notifications;
    }

    @PostMapping
    public ResponseEntity<OrderResponseDto> placeOrder(@Valid @RequestBody PlaceOrderRequestDto request,
                                         @RequestAttribute(JwtAuthFilter.PRINCIPAL_ATTRIBUTE) AuthenticatedPrincipal principal)
            throws DomainException {
        Long accountId = principal.accountId();
        OrderResponseDto placed = orderService.placeOrder(request, accountId);

        // Published only after placeOrder's transaction has committed: an event
        // for a rolled-back order could never be taken back. If this send is
        // not acknowledged, UnpublishedOrderSweeper resends it later.
        OrderPlacedPayload orderPlacedPayload = new OrderPlacedPayload(
                placed.orderId(),
                accountId,
                request.symbol(),
                request.side(),
                request.quantity(),
                request.price(),
                request.idempotencyKey(),
                Instant.now(),
                orderService.instrumentToAccountRates(request.symbol()));
        orderPlacedPublisher.publish(orderPlacedPayload);

        // returns order with "NEW" here as per story 3
        return ResponseEntity.ok(placed);
    }

    // The review step before Confirm (LEAP-017): cost, fee and total for the
    // ticket as typed. Creates no order and publishes nothing.
    @PostMapping("/review")
    public OrderReviewResponseDto reviewOrder(@Valid @RequestBody OrderReviewRequestDto request,
                                              @RequestAttribute(JwtAuthFilter.PRINCIPAL_ATTRIBUTE) AuthenticatedPrincipal principal)
            throws DomainException {
        return orderService.reviewOrder(request, principal.accountId());
    }

    @DeleteMapping("/{id}")
    public OrderResponseDto cancelOrder(@PathVariable String id,
                                         @RequestAttribute(JwtAuthFilter.PRINCIPAL_ATTRIBUTE) AuthenticatedPrincipal principal)
            throws DomainException {
        UUID orderId = parseOrderId(id);
        OrderResponseDto cancelled = orderService.cancelOrder(orderId, principal.accountId());

        // After the cancel has committed, and never able to undo it. The executor never sees a
        // cancel (only trade_api cancels), so this is the only place it can be announced. The
        // event id is derived from the order, so a repeated request cannot notify twice.
        notifications.notify(principal.accountId(),
                UUID.nameUUIDFromBytes(("order-cancelled:" + orderId).getBytes(java.nio.charset.StandardCharsets.UTF_8)),
                NotificationEventType.ORDER_CANCELLED, cancelled.orderId(), cancelled.symbol(), null);
        return cancelled;
    }

    private UUID parseOrderId(String id) throws InvalidOrderException {
        try {
            return UUID.fromString(id);
        } catch (IllegalArgumentException e) {
            throw new InvalidOrderException("id");
        }
    }
}
