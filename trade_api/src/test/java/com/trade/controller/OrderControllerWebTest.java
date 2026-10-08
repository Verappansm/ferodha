package com.trade.controller;

import com.trade.mapper.UserAccessMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.trade.dto.OrderResponseDto;
import com.trade.dto.OrderReviewResponseDto;
import com.trade.dto.PlaceOrderRequestDto;
import com.trade.enums.OrderSide;
import com.trade.enums.OrderStatus;
import com.trade.exception.DuplicateOrderException;
import com.trade.exception.InsufficientFundsException;
import com.trade.security.JwtService;
import com.trade.service.OrderService;
import com.trade.testsupport.JwtTestFixture;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import com.trade.event.OrderPlacedPublisher;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// A web-layer slice: @WebMvcTest auto-detects JwtAuthFilter as a Filter
// bean in the slice, and JwtService is imported explicitly since a plain
// @Service is not. A token minted by the same JwtTestFixture the security
// unit tests use is verified through the same production code path, with
// OrderService mocked out so this exercises only routing, validation and
// the error envelope.
@WebMvcTest(controllers = OrderController.class)
@Import(JwtService.class)
@TestPropertySource(properties = "app.jwt.secret=" + JwtTestFixture.SECRET)
class OrderControllerWebTest {

    // JwtAuthFilter asks Users whether the token's user may still act; the
    // slice has no database, and an unstubbed mock answers "not blocked".
    @MockitoBean
    private UserAccessMapper userAccessMapper;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockitoBean
    private OrderService orderService;

    // OrderController publishes ORDER_PLACED through OrderPlacedPublisher,
    // which @WebMvcTest's slice does not load; the send itself (topic, key,
    // acknowledgement) is covered by OrderPlacedPublisherTest.
    @MockitoBean
    private OrderPlacedPublisher orderPlacedPublisher;

    // A cancel is announced through the notifications module once it has committed.
    @MockitoBean
    private com.trade.notification.service.NotificationService notifications;

    @Test
    void placingAnOrderWithAValidTokenReturnsTheContractShapedResponse() throws Exception {
        when(orderService.placeOrder(any(), eq(1L))).thenReturn(new OrderResponseDto(
                "ORD-6f2b1c2a-6a1e-4a4f-9c0d-2f7a1b3c4d5e", OrderStatus.FILLED, "Order executed",
                "ACME", OrderSide.BUY, 100, new BigDecimal("25.50")));

        mockMvc.perform(post("/api/v1/orders")
                        .header("Authorization", "Bearer " + JwtTestFixture.validToken(1L))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(validRequest())))
                .andExpect(status().isOk())
                .andExpect(content().json("""
                        {"status":"FILLED","symbol":"ACME","side":"BUY","quantity":100,"price":25.50}
                        """));
    }

    // Story 3's own three remaining "Unit Test Execution Paths" - "an
    // accepted order is written at NEW and answered NEW" is covered above
    // and by OrderServiceTest; these three were previously untested even
    // though the underlying behaviour was already correct.
    @Test
    void orderPlacedIsPublishedToTheOrdersTopicKeyedByAccountForANewlyAcceptedOrder() throws Exception {
        when(orderService.placeOrder(any(), eq(1L))).thenReturn(new OrderResponseDto(
                "ORD-6f2b1c2a-6a1e-4a4f-9c0d-2f7a1b3c4d5e", OrderStatus.NEW, "Order placed",
                "ACME", OrderSide.BUY, 100, new BigDecimal("25.50")));

        mockMvc.perform(post("/api/v1/orders")
                        .header("Authorization", "Bearer " + JwtTestFixture.validToken(1L))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(validRequest())))
                .andExpect(status().isOk());

        verify(orderPlacedPublisher).publish(argThat(payload ->
                payload.accountId() == 1L
                        && payload.orderId().equals("ORD-6f2b1c2a-6a1e-4a4f-9c0d-2f7a1b3c4d5e")));
    }

    // Full proof that the publish happens only once the transaction inside
    // OrderService.placeOrder has committed needs a real transaction (see
    // trade_executor's SettlementServiceIT for that pattern applied to
    // Story 2's settlement) - orderService is mocked here, so this instead
    // pins the one thing a web-layer slice actually can: the controller
    // calls placeOrder() and only then publishes, never the
    // other way round, matching what OrderController.placeOrder's source
    // does (publish sits after the call that returns once its own
    // @Transactional method has committed).
    @Test
    void thePublishHappensOnlyAfterPlaceOrderHasReturned() throws Exception {
        when(orderService.placeOrder(any(), eq(1L))).thenReturn(new OrderResponseDto(
                "ORD-6f2b1c2a-6a1e-4a4f-9c0d-2f7a1b3c4d5e", OrderStatus.NEW, "Order placed",
                "ACME", OrderSide.BUY, 100, new BigDecimal("25.50")));

        mockMvc.perform(post("/api/v1/orders")
                        .header("Authorization", "Bearer " + JwtTestFixture.validToken(1L))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(validRequest())))
                .andExpect(status().isOk());

        InOrder inOrder = inOrder(orderService, orderPlacedPublisher);
        inOrder.verify(orderService).placeOrder(any(), eq(1L));
        inOrder.verify(orderPlacedPublisher).publish(any());
    }

    @Test
    void anOrderThatFailsValidationPublishesNothing() throws Exception {
        PlaceOrderRequestDto invalid = new PlaceOrderRequestDto(1L, "ACME", OrderSide.BUY, 0,
                new BigDecimal("25.50"), "6f2b1c2a-6a1e-4a4f-9c0d-2f7a1b3c4d5e");

        mockMvc.perform(post("/api/v1/orders")
                        .header("Authorization", "Bearer " + JwtTestFixture.validToken(1L))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(invalid)))
                .andExpect(status().isUnprocessableEntity());

        verify(orderPlacedPublisher, never()).publish(any());
    }

    @Test
    void placingAnOrderWithNoTokenIsUnauthorised() throws Exception {
        mockMvc.perform(post("/api/v1/orders")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(validRequest())))
                .andExpect(status().isUnauthorized())
                .andExpect(content().json("""
                        {"errorCode":"AUTH-401","message":"Unauthorised"}
                        """));
    }

    @Test
    void placingAnOrderThatFailsValidationReturnsValError() throws Exception {
        PlaceOrderRequestDto invalid = new PlaceOrderRequestDto(1L, "ACME", OrderSide.BUY, 0,
                new BigDecimal("25.50"), "6f2b1c2a-6a1e-4a4f-9c0d-2f7a1b3c4d5e");

        mockMvc.perform(post("/api/v1/orders")
                        .header("Authorization", "Bearer " + JwtTestFixture.validToken(1L))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(invalid)))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(content().json("""
                        {"errorCode":"VAL-422","message":"Invalid input"}
                        """));
    }

    @Test
    void placingADuplicateOrderReturnsOrd409() throws Exception {
        when(orderService.placeOrder(any(), eq(1L))).thenThrow(new DuplicateOrderException("6f2b1c2a-6a1e-4a4f-9c0d-2f7a1b3c4d5e"));

        mockMvc.perform(post("/api/v1/orders")
                        .header("Authorization", "Bearer " + JwtTestFixture.validToken(1L))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(validRequest())))
                .andExpect(status().isConflict())
                .andExpect(content().json("""
                        {"errorCode":"ORD-409","message":"Duplicate order"}
                        """));
    }

    @Test
    void insufficientFundsReturnsOrd400() throws Exception {
        when(orderService.placeOrder(any(), eq(1L)))
                .thenThrow(new InsufficientFundsException(new BigDecimal("2550.00"), new BigDecimal("10.00")));

        mockMvc.perform(post("/api/v1/orders")
                        .header("Authorization", "Bearer " + JwtTestFixture.validToken(1L))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(validRequest())))
                .andExpect(status().isBadRequest())
                .andExpect(content().json("""
                        {"errorCode":"ORD-400","message":"Insufficient funds"}
                        """));
    }

    @Test
    void cancellingWithAMalformedIdReturnsVal422() throws Exception {
        mockMvc.perform(delete("/api/v1/orders/not-a-uuid")
                        .header("Authorization", "Bearer " + JwtTestFixture.validToken(1L)))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(content().json("""
                        {"errorCode":"VAL-422","message":"Invalid input"}
                        """));
    }

    private static final java.util.UUID CANCELLED_ID = java.util.UUID.fromString("6f2b1c2a-6a1e-4a4f-9c0d-2f7a1b3c4d5e");

    @Test
    void aCancelledOrderIsAnnouncedToItsOwner() throws Exception {
        when(orderService.cancelOrder(CANCELLED_ID, 1L)).thenReturn(new OrderResponseDto(
                "ORD-" + CANCELLED_ID, OrderStatus.CANCELLED, "Order cancelled",
                "ACME", OrderSide.BUY, 100, new BigDecimal("25.50")));

        mockMvc.perform(delete("/api/v1/orders/" + CANCELLED_ID)
                        .header("Authorization", "Bearer " + JwtTestFixture.validToken(1L)))
                .andExpect(status().isOk());

        verify(notifications).notify(eq(1L), any(), eq(com.trade.notification.enums.NotificationEventType.ORDER_CANCELLED),
                eq("ORD-" + CANCELLED_ID), eq("ACME"), isNull());
    }

    @Test
    void aCancelThatIsRefusedAnnouncesNothing() throws Exception {
        when(orderService.cancelOrder(CANCELLED_ID, 1L))
                .thenThrow(new com.trade.exception.OrderNotCancellableException(CANCELLED_ID.toString(), OrderStatus.FILLED));

        mockMvc.perform(delete("/api/v1/orders/" + CANCELLED_ID)
                        .header("Authorization", "Bearer " + JwtTestFixture.validToken(1L)))
                .andExpect(status().isConflict());

        verify(notifications, never()).notify(anyLong(), any(), any(), any(), any(), any());
    }

    @Test
    void reviewingAnOrderReturnsTheFiguresAndPublishesNothing() throws Exception {
        when(orderService.reviewOrder(any(), eq(1L))).thenReturn(new OrderReviewResponseDto(
                "ACME", OrderSide.BUY, 100, new BigDecimal("25.50"), "USD",
                new BigDecimal("2550.00"), new BigDecimal("0.001"), new BigDecimal("2.55"),
                new BigDecimal("2552.55"), new BigDecimal("2550.00"), new BigDecimal("2.55"),
                new BigDecimal("2552.55"), new BigDecimal("10000.00"), "USD", new BigDecimal("7447.45")));

        mockMvc.perform(post("/api/v1/orders/review")
                        .header("Authorization", "Bearer " + JwtTestFixture.validToken(1L))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"accountId":1,"symbol":"ACME","side":"BUY","quantity":100,"price":25.50}
                                """))
                .andExpect(status().isOk())
                .andExpect(content().json("""
                        {"estimatedCost":2550.00,"feeRate":0.001,"fee":2.55,"total":2552.55,"cashRemaining":7447.45}
                        """));

        verify(orderService, never()).placeOrder(any(), any());
        verify(orderPlacedPublisher, never()).publish(any());
    }

    @Test
    void reviewingAnInvalidOrderReturnsValError() throws Exception {
        mockMvc.perform(post("/api/v1/orders/review")
                        .header("Authorization", "Bearer " + JwtTestFixture.validToken(1L))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"accountId":1,"symbol":"ACME","side":"BUY","quantity":0,"price":25.50}
                                """))
                .andExpect(status().isUnprocessableEntity());
    }

    @Test
    void reviewingWithNoTokenIsUnauthorised() throws Exception {
        mockMvc.perform(post("/api/v1/orders/review")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"accountId":1,"symbol":"ACME","side":"BUY","quantity":1,"price":25.50}
                                """))
                .andExpect(status().isUnauthorized());
    }

    private PlaceOrderRequestDto validRequest() {
        return new PlaceOrderRequestDto(1L, "ACME", OrderSide.BUY, 100,
                new BigDecimal("25.50"), "6f2b1c2a-6a1e-4a4f-9c0d-2f7a1b3c4d5e");
    }
}
