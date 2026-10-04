package com.trade.mapper;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PortfolioMapperIT extends MapperIntegrationTestSupport {

    @Autowired
    private AccountMapper accountMapper;

    @Autowired
    private OrderMapper orderMapper;

    @Autowired
    private PortfolioMapper portfolioMapper;

    @Test
    @DisplayName("fills are found by the numeric account id, oldest first, with symbol, currency and side")
    void fillsAreReadByTheNumericAccountId() {
        AccountRow account = givenAccount("portfolio-fills@example.com", "BANK-PF-1");
        UUID instrumentId = insertTradableInstrument("PF1");
        insertFilledOrderAndTrade(account, instrumentId, "BUY", 10, new BigDecimal("100.00"), "IT-PF-1");
        insertFilledOrderAndTrade(account, instrumentId, "SELL", 4, new BigDecimal("120.00"), "IT-PF-2");

        List<FillRow> fills = portfolioMapper.findFills(account.id());

        assertEquals(2, fills.size());
        assertEquals("PF1", fills.get(0).symbol());
        assertEquals("USD", fills.get(0).currency());
        assertEquals("BUY", fills.get(0).side());
        assertEquals(0, new BigDecimal("10").compareTo(fills.get(0).quantity()));
        assertEquals("SELL", fills.get(1).side());
        assertEquals(0, new BigDecimal("120.00").compareTo(fills.get(1).price()));
    }

    @Test
    @DisplayName("another account's fills are not returned")
    void fillsAreScopedToTheAccount() {
        AccountRow mine = givenAccount("portfolio-mine@example.com", "BANK-PF-2");
        AccountRow theirs = givenAccount("portfolio-theirs@example.com", "BANK-PF-3");
        UUID instrumentId = insertTradableInstrument("PF2");
        insertFilledOrderAndTrade(theirs, instrumentId, "BUY", 5, new BigDecimal("50.00"), "IT-PF-3");

        assertTrue(portfolioMapper.findFills(mine.id()).isEmpty());
    }

    @Test
    @DisplayName("the newest stored price per symbol is returned")
    void latestStoredPricePerSymbol() {
        UUID instrumentId = insertTradableInstrument("PF3");
        insertMarketData(instrumentId, "2026-10-01T10:00:00Z", "10.00");
        insertMarketData(instrumentId, "2026-10-02T10:00:00Z", "12.50");

        List<StoredPriceRow> prices = portfolioMapper.findLatestStoredPrices(List.of("PF3", "NOPRICE"));

        assertEquals(1, prices.size());
        assertEquals("PF3", prices.getFirst().symbol());
        assertEquals(0, new BigDecimal("12.50").compareTo(prices.getFirst().price()));
    }

    private AccountRow givenAccount(String email, String bankAccountNumber) {
        long accountId = insertAccount(email, bankAccountNumber, new BigDecimal("100000.00"));
        return accountMapper.findById(accountId).orElseThrow();
    }

    private void insertFilledOrderAndTrade(AccountRow account, UUID instrumentId, String side, int quantity,
                                            BigDecimal price, String idempotencyKey) {
        UUID orderId = UUID.randomUUID();
        orderMapper.insertOrder(orderId, account.userId(), account.accountUuid(), instrumentId,
                side, quantity, price, price, "FILLED", idempotencyKey);
        orderMapper.insertTrade(orderId, price, quantity);
    }

    private void insertMarketData(UUID instrumentId, String timestamp, String close) {
        jdbcTemplate.update("""
                INSERT INTO Market_Data (instrument_id, timestamp, open_price, close_price, high_price, low_price)
                VALUES (?::uuid, ?::timestamptz, ?, ?, ?, ?)
                """, instrumentId.toString(), timestamp, new BigDecimal(close), new BigDecimal(close),
                new BigDecimal(close), new BigDecimal(close));
    }
}
