package com.trade.controller;

import com.trade.dto.OrderResponseDto;
import com.trade.dto.PlaceOrderRequestDto;
import com.trade.exception.DomainException;
import com.trade.exception.InvalidOrderException;
import com.trade.security.AuthenticatedPrincipal;
import com.trade.security.JwtAuthFilter;
import com.trade.service.OrderService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

//business decision and write is delegated to logic and service
//two orders operations done [validation also done]
@RestController
@RequestMapping("/api/v1/orders")
public class OrderController {

    private final OrderService orderService;

    public OrderController(OrderService orderService) {
        this.orderService = orderService;
    }

    @PostMapping
    public OrderResponseDto placeOrder(@Valid @RequestBody PlaceOrderRequestDto request,
                                        @RequestAttribute(JwtAuthFilter.PRINCIPAL_ATTRIBUTE) AuthenticatedPrincipal principal)
            throws DomainException {
        return orderService.placeOrder(request, principal.accountId());
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
