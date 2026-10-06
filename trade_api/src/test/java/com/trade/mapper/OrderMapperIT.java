package com.trade.mapper;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class OrderMapperIT extends MapperIntegrationTestSupport {

    private static final BigDecimal FEE_RATE = new BigDecimal("0.001");

    @Autowired
    private AccountMapper accountMapper;

    @Autowired
    private OrderMapper orderMapper;

    @Autowired
    private PositionMapper positionMapper;

    @Test
    @DisplayName("an order row is inserted and retrievable")
    void orderRowInsertedAndRetrievable() {
        AccountRow account = givenAccount("order-insert@example.com", "BANK-ORDER-1", new BigDecimal("10000.00"));
        UUID instrumentId = insertTradableInstrument("ORD1");
        UUID orderId = UUID.randomUUID();

        int affected = orderMapper.insertOrder(orderId, account.userId(), account.accountUuid(), instrumentId,
                "BUY", 10, new BigDecimal("100.00"), new BigDecimal("100.00"), "FILLED", "IT-KEY-1", FEE_RATE);

        assertEquals(1, affected);
        OrderRow row = orderMapper.findByOrderId(orderId).orElseThrow();
        assertEquals(account.id(), row.accountId());
        assertEquals("ORD1", row.symbol());
        assertEquals("BUY", row.side());
        assertEquals(10, row.quantity());
        assertEquals(0, new BigDecimal("100.00").compareTo(row.price()));
        assertEquals(0, new BigDecimal("100.00").compareTo(row.executedPrice()));
        assertEquals("FILLED", row.status());
    }

    @Test
    @DisplayName("an order still NEW has no executed price, and that null round-trips cleanly")
    void newOrderHasNoExecutedPrice() {
        AccountRow account = givenAccount("order-new@example.com", "BANK-ORDER-NEW", new BigDecimal("10000.00"));
        UUID instrumentId = insertTradableInstrument("ORDNEW");
        UUID orderId = UUID.randomUUID();

        orderMapper.insertOrder(orderId, account.userId(), account.accountUuid(), instrumentId,
                "BUY", 5, new BigDecimal("50.00"), null, "NEW", "IT-KEY-NEW-PRICE", FEE_RATE);

        OrderRow row = orderMapper.findByOrderId(orderId).orElseThrow();
        assertEquals("NEW", row.status());
        assertNull(row.executedPrice());
    }

    @Test
    @DisplayName("a reused idempotency key surfaces as a constraint violation rather than being swallowed")
    void duplicateIdempotencyKeySurfacesConstraintViolation() {
        AccountRow account = givenAccount("order-dup@example.com", "BANK-ORDER-2", new BigDecimal("10000.00"));
        UUID instrumentId = insertTradableInstrument("ORD2");
        orderMapper.insertOrder(UUID.randomUUID(), account.userId(), account.accountUuid(), instrumentId,
                "BUY", 5, new BigDecimal("50.00"), new BigDecimal("50.00"), "FILLED", "IT-KEY-DUP", FEE_RATE);

        assertThrows(DataIntegrityViolationException.class, () ->
                orderMapper.insertOrder(UUID.randomUUID(), account.userId(), account.accountUuid(), instrumentId,
                        "BUY", 5, new BigDecimal("50.00"), new BigDecimal("50.00"), "FILLED", "IT-KEY-DUP", FEE_RATE));
    }

    @Test
    @DisplayName("cancelling a NEW order affects one row; cancelling a terminal order affects zero")
    void cancelIfNewReportsAffectedRowCount() {
        AccountRow account = givenAccount("order-cancel@example.com", "BANK-ORDER-3", new BigDecimal("10000.00"));
        UUID instrumentId = insertTradableInstrument("ORD3");
        UUID newOrderId = UUID.randomUUID();
        UUID filledOrderId = UUID.randomUUID();
        orderMapper.insertOrder(newOrderId, account.userId(), account.accountUuid(), instrumentId,
                "BUY", 5, new BigDecimal("50.00"), null, "NEW", "IT-KEY-NEW", FEE_RATE);
        orderMapper.insertOrder(filledOrderId, account.userId(), account.accountUuid(), instrumentId,
                "BUY", 5, new BigDecimal("50.00"), new BigDecimal("50.00"), "FILLED", "IT-KEY-FILLED", FEE_RATE);

        assertEquals(1, orderMapper.cancelIfNew(newOrderId));
        assertEquals(0, orderMapper.cancelIfNew(filledOrderId));
        assertEquals("CANCELLED", orderMapper.findByOrderId(newOrderId).orElseThrow().status());
        assertEquals("FILLED", orderMapper.findByOrderId(filledOrderId).orElseThrow().status());
    }

    @Test
    @DisplayName("positions are derived correctly: net quantity and a buy-weighted average cost unaffected by a sell")
    void positionsReadCorrectly() {
        AccountRow account = givenAccount("order-position@example.com", "BANK-ORDER-4", new BigDecimal("100000.00"));
        UUID instrumentId = insertTradableInstrument("ORD4");

        // Buy 10 @ 100, buy 10 @ 200 -> average cost (10*100 + 10*200) / 20 = 150.
        insertFilledOrderAndTrade(account, instrumentId, "BUY", 10, new BigDecimal("100.00"), "IT-KEY-P1");
        insertFilledOrderAndTrade(account, instrumentId, "BUY", 10, new BigDecimal("200.00"), "IT-KEY-P2");
        // Sell 5 -> quantity drops to 15; average cost is unaffected by a sell (see
        // com.trade.domain.Position#applySell), so it stays 150 even though this
        // sell executed at a different price.
        insertFilledOrderAndTrade(account, instrumentId, "SELL", 5, new BigDecimal("180.00"), "IT-KEY-P3");

        PositionRow position = positionMapper.find(account.id(), "ORD4").orElseThrow();
        assertEquals(15, position.quantity());
        assertEquals(0, new BigDecimal("150.00").compareTo(position.averageCost()));

        List<PositionRow> all = positionMapper.findAllForAccount(account.id());
        assertEquals(1, all.size());
    }

    @Test
    @DisplayName("a position fully closed out (net zero quantity) is not returned")
    void closedPositionIsNotReturned() {
        AccountRow account = givenAccount("order-closed@example.com", "BANK-ORDER-5", new BigDecimal("100000.00"));
        UUID instrumentId = insertTradableInstrument("ORD5");
        insertFilledOrderAndTrade(account, instrumentId, "BUY", 10, new BigDecimal("100.00"), "IT-KEY-C1");
        insertFilledOrderAndTrade(account, instrumentId, "SELL", 10, new BigDecimal("110.00"), "IT-KEY-C2");

        assertTrue(positionMapper.find(account.id(), "ORD5").isEmpty());
        assertTrue(positionMapper.findAllForAccount(account.id()).isEmpty());
    }

    private AccountRow givenAccount(String email, String bankAccountNumber, BigDecimal balance) {
        long accountId = insertAccount(email, bankAccountNumber, balance);
        return accountMapper.findById(accountId).orElseThrow();
    }

    private void insertFilledOrderAndTrade(AccountRow account, UUID instrumentId, String side, int quantity,
                                            BigDecimal price, String idempotencyKey) {
        UUID orderId = UUID.randomUUID();
        orderMapper.insertOrder(orderId, account.userId(), account.accountUuid(), instrumentId,
                side, quantity, price, price, "FILLED", idempotencyKey, FEE_RATE);
        orderMapper.insertTrade(orderId, price, quantity);
    }
}
