package com.trade.executor.settlement;

import com.trade.executor.enums.OrderSide;
import com.trade.executor.mapper.AccountMapper;
import com.trade.executor.mapper.AccountRow;
import com.trade.executor.mapper.ExecutorMapperIntegrationTestSupport;
import com.trade.executor.mapper.OrderMapper;
import com.trade.executor.mapper.OrderRow;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;

import java.math.BigDecimal;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

// Real Postgres, real @Transactional semantics - proves atomicity claims a
// mocked test cannot: that a failure partway through leaves nothing
// written, even though Guard 1's status write physically executed first.
class SettlementServiceIT extends ExecutorMapperIntegrationTestSupport {

    @Autowired
    private SettlementService settlementService;

    @Autowired
    private OrderMapper orderMapper;

    @Autowired
    private AccountMapper accountMapper;

    @Test
    @DisplayName("a settled order writes status, cash and trade together")
    void settledOrderWritesStatusCashAndTradeTogether() {
        long accountId = insertAccount("settle-fill@example.com", "BANK-FILL-1", new BigDecimal("5000.00"), "USD");
        UUID instrumentId = insertTradableInstrument("AAPL", "USD");
        UUID orderId = insertNewOrder(accountId, instrumentId, "BUY", 10, new BigDecimal("100.00"));

        OrderRow order = orderMapper.findById(orderId).orElseThrow();
        AccountRow account = accountMapper.findById(accountId).orElseThrow();

        SettlementOutcome outcome = settlementService.settleFill(order, account, new BigDecimal("100.00"), 10,
                new BigDecimal("1.00"), new BigDecimal("1001.00"), OrderSide.BUY);

        assertEquals(SettlementOutcome.Result.FILLED, outcome.result());

        assertEquals("FILLED", jdbcTemplate.queryForObject(
                "SELECT status FROM Orders WHERE order_id = ?::uuid", String.class, orderId.toString()));
        assertNotNull(jdbcTemplate.queryForObject(
                "SELECT executed_on FROM Orders WHERE order_id = ?::uuid", java.sql.Timestamp.class, orderId.toString()));

        BigDecimal newBalance = jdbcTemplate.queryForObject(
                "SELECT cash_balance FROM Accounts WHERE id = ?", BigDecimal.class, accountId);
        assertEquals(0, new BigDecimal("3999.00").compareTo(newBalance));
        Integer version = jdbcTemplate.queryForObject(
                "SELECT version FROM Accounts WHERE id = ?", Integer.class, accountId);
        assertEquals(1, version);

        Integer tradeCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM Trades WHERE order_id = ?::uuid", Integer.class, orderId.toString());
        assertEquals(1, tradeCount);
    }

    @Test
    @DisplayName("a failure in any of the three leaves none of them written")
    void failurePartwayThroughLeavesNothingWritten() {
        long accountId = insertAccount("settle-rollback@example.com", "BANK-ROLLBACK-1", new BigDecimal("5000.00"), "USD");
        UUID instrumentId = insertTradableInstrument("AAPL", "USD");
        UUID orderId = insertNewOrder(accountId, instrumentId, "BUY", 10, new BigDecimal("100.00"));

        OrderRow order = orderMapper.findById(orderId).orElseThrow();
        AccountRow account = accountMapper.findById(accountId).orElseThrow();

        // A zero execution quantity violates Trades.execution_quantity > 0
        // (the third write) - forces a rollback of the whole transaction,
        // including Guard 1's status write and Guard 2's balance write that
        // both already physically ran before this statement.
        assertThrows(DataIntegrityViolationException.class, () -> settlementService.settleFill(
                order, account, new BigDecimal("100.00"), 0,
                new BigDecimal("1.00"), new BigDecimal("1001.00"), OrderSide.BUY));

        assertEquals("NEW", jdbcTemplate.queryForObject(
                "SELECT status FROM Orders WHERE order_id = ?::uuid", String.class, orderId.toString()));

        BigDecimal balance = jdbcTemplate.queryForObject(
                "SELECT cash_balance FROM Accounts WHERE id = ?", BigDecimal.class, accountId);
        assertEquals(0, new BigDecimal("5000.00").compareTo(balance));
        Integer version = jdbcTemplate.queryForObject(
                "SELECT version FROM Accounts WHERE id = ?", Integer.class, accountId);
        assertEquals(0, version);

        Integer tradeCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM Trades WHERE order_id = ?::uuid", Integer.class, orderId.toString());
        assertEquals(0, tradeCount);
    }

    @Test
    @DisplayName("a second delivery affects zero rows and writes nothing further")
    void secondDeliveryIsANoOp() {
        long accountId = insertAccount("settle-redeliver@example.com", "BANK-REDELIVER-1", new BigDecimal("5000.00"), "USD");
        UUID instrumentId = insertTradableInstrument("AAPL", "USD");
        UUID orderId = insertNewOrder(accountId, instrumentId, "BUY", 10, new BigDecimal("100.00"));

        OrderRow order = orderMapper.findById(orderId).orElseThrow();
        AccountRow account = accountMapper.findById(accountId).orElseThrow();

        settlementService.settleFill(order, account, new BigDecimal("100.00"), 10,
                new BigDecimal("1.00"), new BigDecimal("1001.00"), OrderSide.BUY);

        BigDecimal balanceAfterFirst = jdbcTemplate.queryForObject(
                "SELECT cash_balance FROM Accounts WHERE id = ?", BigDecimal.class, accountId);
        Integer versionAfterFirst = jdbcTemplate.queryForObject(
                "SELECT version FROM Accounts WHERE id = ?", Integer.class, accountId);

        // Redeliver with the same order/account snapshot - order.status() in
        // this stale snapshot is still "NEW", but the DB row is already
        // FILLED, so Guard 1's conditional UPDATE affects zero rows.
        SettlementOutcome secondOutcome = settlementService.settleFill(order, account, new BigDecimal("100.00"), 10,
                new BigDecimal("1.00"), new BigDecimal("1001.00"), OrderSide.BUY);

        assertEquals(SettlementOutcome.Result.ALREADY_PROCESSED, secondOutcome.result());

        BigDecimal balanceAfterSecond = jdbcTemplate.queryForObject(
                "SELECT cash_balance FROM Accounts WHERE id = ?", BigDecimal.class, accountId);
        Integer versionAfterSecond = jdbcTemplate.queryForObject(
                "SELECT version FROM Accounts WHERE id = ?", Integer.class, accountId);
        Integer tradeCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM Trades WHERE order_id = ?::uuid", Integer.class, orderId.toString());

        assertEquals(0, balanceAfterFirst.compareTo(balanceAfterSecond));
        assertEquals(versionAfterFirst, versionAfterSecond);
        assertEquals(1, tradeCount);
    }
}
