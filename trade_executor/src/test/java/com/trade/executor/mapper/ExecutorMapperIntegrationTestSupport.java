package com.trade.executor.mapper;

import org.junit.jupiter.api.Tag;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.kafka.test.context.EmbeddedKafka;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.io.IOException;
import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.UUID;

// trade_executor has no Liquibase of its own - trade_api's changelog is the
// single schema owner (see docker-compose.yml's depends_on comment) - so
// this test fixture applies the same layers a real deployment gets by
// running trade_api first: the Sprint 3 base schema, then trade_api's own
// changelog files 001-004, in order, straight over JDBC. Same
// "read the raw .sql, execute it as one Statement" trick trade_api's own
// MapperIntegrationTestSupport uses - the --liquibase formatted sql /
// --changeset lines are valid "--" SQL comments, so this works unmodified.
@Testcontainers
@SpringBootTest
@EmbeddedKafka(partitions = 1, topics = {"orders", "trade-events", "orders.DLT"})
@TestPropertySource(properties = {
        "fauxnance.base-url=http://fauxnance.invalid",
        "fauxnance.api-key=test-key",
        // Every integration test loads the full context, including the
        // real @KafkaListener/KafkaTemplate beans - point them at the
        // embedded broker rather than the default localhost:9092 so no
        // subclass needs external Kafka running, whether or not it
        // actually exercises Kafka itself.
        "spring.kafka.bootstrap-servers=${spring.embedded.kafka.brokers}"
})
@Tag("integration")
public abstract class ExecutorMapperIntegrationTestSupport {

    @Container
    @ServiceConnection
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");

    private static final String[] CHANGELOG_FILES = {
            "001-account-status-and-locking.sql",
            "002-order-status-alignment.sql",
            "003-instrument-tradable-flag.sql",
            "004-executor-settlement-columns.sql"
    };

    static {
        POSTGRES.start();
        applySchema();
    }

    @Autowired
    protected JdbcTemplate jdbcTemplate;

    protected long insertAccount(String email, String bankAccountNumber, BigDecimal cashBalance, String currency) {
        UUID userId = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO Users (user_id, name, email, password_hash, status, role_id)
                VALUES (?::uuid, ?, ?, ?, 'ACTIVE', (SELECT role_id FROM Roles WHERE role_name = 'client'))
                """, userId.toString(), "Test Holder", email, "test-password-hash");

        jdbcTemplate.update("""
                INSERT INTO Third_Party_Bank (bank_account_number, email, pin_hash, balance)
                VALUES (?, ?, ?, 0)
                """, bankAccountNumber, email, "test-pin-hash");

        UUID accountUuid = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO Accounts (account_id, user_id, bank_account_number, currency, cash_balance)
                VALUES (?::uuid, ?::uuid, ?, ?, ?)
                """, accountUuid.toString(), userId.toString(), bankAccountNumber, currency, cashBalance);

        return jdbcTemplate.queryForObject(
                "SELECT id FROM Accounts WHERE account_id = ?::uuid", Long.class, accountUuid.toString());
    }

    protected UUID insertTradableInstrument(String symbol, String currency) {
        UUID instrumentId = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO Instruments (instrument_id, ticker, name, exchange, currency, type, sector)
                VALUES (?::uuid, ?, 'Test Instrument', 'TEST', ?, 'EQUITY', 'Technology')
                """, instrumentId.toString(), symbol, currency);
        return instrumentId;
    }

    protected UUID insertNewOrder(long numericAccountId, UUID instrumentId, String side, int quantity,
                                   BigDecimal limitPrice) {
        UUID orderId = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO Orders (order_id, user_id, account_id, instrument_id, side, order_type,
                                     limit_price, quantity, status)
                VALUES (?::uuid,
                        (SELECT user_id FROM Accounts WHERE id = ?),
                        (SELECT account_id FROM Accounts WHERE id = ?),
                        ?::uuid, ?::order_side_enum, 'LIMIT'::order_type_enum, ?, ?, 'NEW'::order_status_enum)
                """, orderId.toString(), numericAccountId, numericAccountId, instrumentId.toString(),
                side, limitPrice, quantity);
        return orderId;
    }

    private static void applySchema() {
        applyFile(Path.of("..", "database", "migrations", "001_initial_schema.sql"));
        for (String file : CHANGELOG_FILES) {
            applyFile(Path.of("..", "trade_api", "src", "main", "resources", "db", "changelog", file));
        }
    }

    private static void applyFile(Path file) {
        String sql;
        try {
            sql = Files.readString(file);
        } catch (IOException e) {
            throw new IllegalStateException(
                    "Could not read " + file.toAbsolutePath()
                            + " - executor integration tests must run with the working directory set to trade_executor/",
                    e);
        }
        try (Connection connection = DriverManager.getConnection(
                POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
             Statement statement = connection.createStatement()) {
            statement.execute(sql);
        } catch (SQLException e) {
            throw new IllegalStateException("Failed to apply " + file + " to the test container", e);
        }
    }
}
