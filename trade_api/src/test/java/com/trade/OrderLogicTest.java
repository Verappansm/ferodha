package com.trade;

import com.trade.domain.Account;
import com.trade.domain.IdempotencyKeyStore;
import com.trade.domain.Instrument;
import com.trade.domain.InstrumentRepository;
import com.trade.domain.Order;
import com.trade.domain.OrderLogic;
import com.trade.domain.Position;
import com.trade.enums.AccountStatus;
import com.trade.enums.InstrumentType;
import com.trade.enums.OrderSide;
import com.trade.exception.AccountNotActiveException;
import com.trade.exception.AccountNotFoundException;
import com.trade.exception.DomainException;
import com.trade.exception.DuplicateOrderException;
import com.trade.exception.InstrumentNotFoundException;
import com.trade.exception.InsufficientFundsException;
import com.trade.exception.InsufficientHoldingsException;
import com.trade.exception.InvalidOrderException;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

class OrderLogicTest {

    private static final Long ACCOUNT_ID = 1L;
    private static final String SYMBOL = "AAPL";

    // Plain HashMap/Set fakes standing in for a database - this is the seam
    // OrderLogic depends on. It only ever talks to the 4 small interfaces,
    // never to these fakes, so Sprint 6 can swap in a real database without
    // OrderLogic changing at all.
    private final Map<Long, Account> accountsById = new HashMap<>();
    private final Map<String, Instrument> instrumentsBySymbol = new HashMap<>();
    private final Map<String, Position> positionsByKey = new HashMap<>();
    private final Set<String> usedIdempotencyKeys = new HashSet<>();

    private OrderLogic orderLogic;

    @BeforeEach
    void setUp() {
        orderLogic = orderLogicCharging(BigDecimal.ZERO);

        // A tradable instrument, present for every test unless one of them
        // deliberately removes or delists it.
        instrumentsBySymbol.put(SYMBOL,
                new Instrument(UUID.randomUUID(), SYMBOL, "Apple Inc.", InstrumentType.EQUITY, "USD", "NASDAQ", "Technology"));
    }

    // ---------------- Rule 1: account must exist ----------------

    @Test
    @DisplayName("Rule 1: should reject order when account does not exist")
    void accountNotFound() {
        Order order = validBuyOrder();
        // deliberately: no account added to accountsById

        AccountNotFoundException exception = assertThrows(
                AccountNotFoundException.class,
                () -> orderLogic.evaluate(order)
        );

        assertEquals("ACC-404", exception.getCode());
    }

    @Test
    @DisplayName("Rule 1: should not fire when the account exists")
    void accountExists() {
        givenActiveAccount(new BigDecimal("5000.00"));

        assertDoesNotThrow(() -> orderLogic.evaluate(validBuyOrder()));
    }

    // ---------------- Rule 2: account must be ACTIVE ----------------

    @Test
    @DisplayName("Rule 2: should reject order when account is not ACTIVE")
    void accountNotActive() {
        givenSuspendedAccount();

        AccountNotActiveException exception = assertThrows(
                AccountNotActiveException.class,
                () -> orderLogic.evaluate(validBuyOrder())
        );

        assertEquals("ACC-403", exception.getCode());
    }

    @Test
    @DisplayName("Rule 2: should not fire when the account is ACTIVE")
    void accountActive() {
        givenActiveAccount(new BigDecimal("5000.00"));

        assertDoesNotThrow(() -> orderLogic.evaluate(validBuyOrder()));
    }

    // ---------------- Rule 3: instrument must exist and be tradable ----------------

    @Test
    @DisplayName("Rule 3: should reject order when instrument does not exist")
    void instrumentNotFound() {
        givenActiveAccount(new BigDecimal("5000.00"));
        Order order = validBuyOrder();
        order.setSymbol("UNKNOWN");

        InstrumentNotFoundException exception = assertThrows(
                InstrumentNotFoundException.class,
                () -> orderLogic.evaluate(order)
        );

        assertEquals("INS-404", exception.getCode());
    }

    @Test
    @DisplayName("Rule 3: should reject order when instrument is delisted (not tradable)")
    void instrumentNotTradable() {
        givenActiveAccount(new BigDecimal("5000.00"));
        instrumentsBySymbol.get(SYMBOL).delist();

        InstrumentNotFoundException exception = assertThrows(
                InstrumentNotFoundException.class,
                () -> orderLogic.evaluate(validBuyOrder())
        );

        assertEquals("INS-404", exception.getCode());
    }

    @Test
    @DisplayName("Rule 3: should not fire when instrument exists and is tradable")
    void instrumentTradable() {
        givenActiveAccount(new BigDecimal("5000.00"));

        assertDoesNotThrow(() -> orderLogic.evaluate(validBuyOrder()));
    }

    // ---------------- Rule 4: quantity must be > 0 ----------------

    @Test
    @DisplayName("Rule 4: should reject order when quantity is zero or negative")
    void quantityInvalid() {
        givenActiveAccount(new BigDecimal("5000.00"));
        Order order = validBuyOrder();
        order.setQuantity(0);

        InvalidOrderException exception = assertThrows(
                InvalidOrderException.class,
                () -> orderLogic.evaluate(order)
        );

        assertEquals("VAL-422", exception.getCode());
        assertEquals("quantity", exception.getField());
    }

    @Test
    @DisplayName("Rule 4: should not fire when quantity is positive")
    void quantityValid() {
        givenActiveAccount(new BigDecimal("5000.00"));

        assertDoesNotThrow(() -> orderLogic.evaluate(validBuyOrder()));
    }

    // ---------------- Rule 5: price must be > 0 ----------------

    @Test
    @DisplayName("Rule 5: should reject order when price is zero or negative")
    void priceInvalid() {
        givenActiveAccount(new BigDecimal("5000.00"));
        Order order = validBuyOrder();
        order.setPrice(BigDecimal.ZERO);

        InvalidOrderException exception = assertThrows(
                InvalidOrderException.class,
                () -> orderLogic.evaluate(order)
        );

        assertEquals("VAL-422", exception.getCode());
        assertEquals("price", exception.getField());
    }

    @Test
    @DisplayName("Rule 5: should not fire when price is positive")
    void priceValid() {
        givenActiveAccount(new BigDecimal("5000.00"));

        assertDoesNotThrow(() -> orderLogic.evaluate(validBuyOrder()));
    }

    // ---------------- Rule 6: BUY must be affordable ----------------

    @Test
    @DisplayName("Rule 6: should reject BUY when funds are insufficient")
    void buyInsufficientFunds() {
        // Order costs 10 * 100.00 = 1000.00, account only has 50.00.
        givenActiveAccount(new BigDecimal("50.00"));

        InsufficientFundsException exception = assertThrows(
                InsufficientFundsException.class,
                () -> orderLogic.evaluate(validBuyOrder())
        );

        assertEquals("ORD-400", exception.getCode());
    }

    @Test
    @DisplayName("Rule 6: should not fire when funds are sufficient")
    void buySufficientFunds() {
        givenActiveAccount(new BigDecimal("5000.00"));

        assertDoesNotThrow(() -> orderLogic.evaluate(validBuyOrder()));
    }

    @Test
    @DisplayName("Rule 6: the fee counts towards what a BUY must afford")
    void buyMustAffordTheFeeToo() {
        // 10 * 100.00 = 1000.00, plus 0.1% = 1.00 fee: 1001.00 needed.
        orderLogic = orderLogicCharging(new BigDecimal("0.001"));
        givenActiveAccount(new BigDecimal("1000.50"));
        assertThrows(InsufficientFundsException.class, () -> orderLogic.evaluate(validBuyOrder()));

        givenActiveAccount(new BigDecimal("1001.00"));
        assertDoesNotThrow(() -> orderLogic.evaluate(validBuyOrder()));
    }

    // ---------------- Rule 7: SELL must not exceed holdings ----------------

    @Test
    @DisplayName("Rule 7: should reject SELL when holdings are insufficient")
    void sellInsufficientHoldings() {
        givenActiveAccount(new BigDecimal("5000.00"));
        givenPosition(5); // holding 5 units, order below sells 10

        InsufficientHoldingsException exception = assertThrows(
                InsufficientHoldingsException.class,
                () -> orderLogic.evaluate(validSellOrder())
        );

        assertEquals("ORD-409", exception.getCode());
    }

    @Test
    @DisplayName("Rule 7: should not fire when holdings are sufficient")
    void sellSufficientHoldings() {
        givenActiveAccount(new BigDecimal("5000.00"));
        givenPosition(20);

        assertDoesNotThrow(() -> orderLogic.evaluate(validSellOrder()));
    }

    // ---------------- Rule 8: idempotency key must be new ----------------

    @Test
    @DisplayName("Rule 8: should reject order when idempotency key was already used")
    void duplicateOrder() {
        givenActiveAccount(new BigDecimal("5000.00"));
        usedIdempotencyKeys.add("ORDER-001");

        DuplicateOrderException exception = assertThrows(
                DuplicateOrderException.class,
                () -> orderLogic.evaluate(validBuyOrder())
        );

        assertEquals("ORD-409", exception.getCode());
    }

    @Test
    @DisplayName("Rule 8: should not fire when the idempotency key is new")
    void newIdempotencyKey() {
        givenActiveAccount(new BigDecimal("5000.00"));

        assertDoesNotThrow(() -> orderLogic.evaluate(validBuyOrder()));
    }

    // ---------------- The rules run in order ----------------

    @Test
    @DisplayName("A request breaking two rules gets the code of the first one")
    void evaluationOrder() {
        // A SUSPENDED account with no cash breaks both rule 2 (not active)
        // and rule 6 (cannot afford the buy). It must fail with rule 2's
        // code, ACC-403 - not rule 6's ORD-400 - because the order the rules
        // run in is itself part of what is being tested here.
        givenSuspendedAccount();

        DomainException exception = assertThrows(
                DomainException.class,
                () -> orderLogic.evaluate(validBuyOrder())
        );

        assertEquals("ACC-403", exception.getCode());
    }

    // ---------------- test data helpers ----------------

    // The domain rules over the in-memory fakes, charging feeRate on a fill.
    private OrderLogic orderLogicCharging(BigDecimal feeRate) {
        return new OrderLogic(
                accountId -> Optional.ofNullable(accountsById.get(accountId)),
                new InstrumentRepository() {
                    @Override
                    public Optional<Instrument> findBySymbol(String symbol) {
                        return Optional.ofNullable(instrumentsBySymbol.get(symbol));
                    }

                    @Override
                    public Optional<Instrument> findByInstrumentId(java.util.UUID instrumentId) {
                        // Not used in these tests
                        return Optional.empty();
                    }

                    @Override
                    public List<Instrument> findAllTradable(int limit, long offset) {
                        // Not used in these tests
                        return List.of();
                    }

                    @Override
                    public long countTradable() {
                        // Not used in these tests
                        return 0;
                    }

                    @Override
                    public List<Instrument> findTradableBySearch(String searchPattern, int limit, long offset) {
                        // Not used in these tests
                        return List.of();
                    }

                    @Override
                    public long countTradableBySearch(String searchPattern) {
                        // Not used in these tests
                        return 0;
                    }
                },
                (accountId, symbol) -> Optional.ofNullable(positionsByKey.get(accountId + ":" + symbol)),
                new IdempotencyKeyStore() {
                    @Override
                    public boolean isUsed(String key) {
                        return usedIdempotencyKeys.contains(key);
                    }

                    @Override
                    public void markUsed(String key) {
                        usedIdempotencyKeys.add(key);
                    }
                },
                feeRate
        );
    }

    private Order validBuyOrder() {
        Order order = new Order();
        order.setAccountId(ACCOUNT_ID);
        order.setSymbol(SYMBOL);
        order.setSide(OrderSide.BUY);
        order.setQuantity(10);
        order.setPrice(new BigDecimal("100.00"));
        order.setIdempotencyKey("ORDER-001");
        return order;
    }

    private Order validSellOrder() {
        Order order = validBuyOrder();
        order.setSide(OrderSide.SELL);
        return order;
    }

    private void givenActiveAccount(BigDecimal balance) {
        accountsById.put(ACCOUNT_ID,
                new Account(ACCOUNT_ID, "REF-1", "Test Holder", balance, AccountStatus.ACTIVE, 0L));
    }

    private void givenSuspendedAccount() {
        accountsById.put(ACCOUNT_ID,
                new Account(ACCOUNT_ID, "REF-1", "Test Holder", BigDecimal.ZERO, AccountStatus.SUSPENDED, 0L));
    }

    private void givenPosition(long quantityHeld) {
        positionsByKey.put(ACCOUNT_ID + ":" + SYMBOL,
                new Position(ACCOUNT_ID, SYMBOL, quantityHeld, new BigDecimal("100.00")));
    }
}
