package com.trade.mapper;

import org.junit.jupiter.api.Tag;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.jdbc.core.JdbcTemplate;
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

// Shared fixture for the mapper *IT tests: a real Postgres via
// Testcontainers, carrying the actual Sprint 3 schema plus this service's
// own Liquibase changelog on top of it - the same two layers a real
// deployment has, exercising the genuine mapper XML rather than an
// in-memory substitute that wouldn't understand Postgres enums or
// gen_random_uuid().
//
// The container is started once in a static initializer (Testcontainers'
// "singleton container" pattern) and shared across every subclass in this
// JVM, since each subclass would otherwise pay its own ~5s container
// startup. @ServiceConnection wires the datasource straight from the
// container with no manual property plumbing; Spring Boot's Liquibase
// auto-configuration then runs this module's own changelog automatically
// during context startup, on top of the base schema applied below.
@Testcontainers
@SpringBootTest
@TestPropertySource(properties = {
        "app.jwt.secret=mapper-integration-test-signing-secret",
        // no broker in this test: keep the market-data listener from polling for one
        "portfolio.quotes.listen=false",
        "strategy.listen=false"
})
@Tag("integration")
abstract class MapperIntegrationTestSupport {

    @Container
    @ServiceConnection
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");

    static {
        POSTGRES.start();
        applyBaseSchema();
    }

    @Autowired
    protected JdbcTemplate jdbcTemplate;

    // Inserts the Users / Third_Party_Bank / Accounts row chain a mapper
    // test needs, and returns the numeric id the Sprint 6 Liquibase
    // changelog added - the same fixture shape AccountMapperIT and
    // OrderMapperIT both need. email and bankAccountNumber must be unique
    // per call: the container and its data are shared for the whole JVM
    // run, across every test method in every subclass.
    protected long insertAccount(String email, String bankAccountNumber, BigDecimal cashBalance) {
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
                VALUES (?::uuid, ?::uuid, ?, 'USD', ?)
                """, accountUuid.toString(), userId.toString(), bankAccountNumber, cashBalance);

        return jdbcTemplate.queryForObject(
                "SELECT id FROM Accounts WHERE account_id = ?::uuid", Long.class, accountUuid.toString());
    }

    // Inserts a tradable Instrument and returns its (internal) UUID key.
    protected UUID insertTradableInstrument(String symbol) {
        UUID instrumentId = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO Instruments (instrument_id, ticker, name, exchange, currency, type, sector)
                VALUES (?::uuid, ?, 'Test Instrument', 'TEST', 'USD', 'EQUITY', 'Technology')
                """, instrumentId.toString(), symbol);
        return instrumentId;
    }

    // Applies database/migrations/001_initial_schema.sql - the Sprint 3
    // schema this service's Liquibase changelog assumes already exists.
    // Read from the sibling module rather than copied here, so this can
    // never silently drift from what Sprint 3 actually ships.
    private static void applyBaseSchema() {
        Path schemaFile = Path.of("..", "database", "migrations", "001_initial_schema.sql");
        String sql;
        try {
            sql = Files.readString(schemaFile);
        } catch (IOException e) {
            throw new IllegalStateException(
                    "Could not read " + schemaFile.toAbsolutePath()
                            + " - mapper integration tests must run with the working directory set to trade_api/",
                    e);
        }
        try (Connection connection = DriverManager.getConnection(
                POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
             Statement statement = connection.createStatement()) {
            statement.execute(sql);
        } catch (SQLException e) {
            throw new IllegalStateException("Failed to apply the base schema to the test container", e);
        }
    }
}
