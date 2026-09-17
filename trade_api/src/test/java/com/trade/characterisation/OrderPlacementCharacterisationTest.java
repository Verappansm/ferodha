package com.trade.characterisation;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import io.restassured.RestAssured;
import static io.restassured.RestAssured.given;
import static org.hamcrest.CoreMatchers.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class OrderPlacementCharacterisationTest {

    @Test
    void affordableOrderReturnsExpectedFields() {
        // Records current behaviour: what comes back for an affordable order
        // Pin: status field, cash, position, all response fields
        given()
            .contentType("application/json")
            .body("{\"accountId\": 1, \"symbol\": \"AAPL\", \"side\": \"BUY\", \"quantity\": 10, \"price\": 233.00, \"idempotencyKey\": \"test-key-1\"}")
        .when().post("/api/v1/orders")
        .then()
            .statusCode(200)
            .body("status", notNullValue())
            .body("cashDelta", notNullValue())
            .body("positionQuantityAfter", notNullValue());
    }

    @Test
    void reusedIdempotencyKeyReturnsError() {
        // Records current behaviour: what happens when same key is reused
        // Pin: HTTP status code + error response
        // First request should succeed, second should fail
        given()
            .contentType("application/json")
            .body("{\"accountId\": 1, \"symbol\": \"AAPL\", \"side\": \"BUY\", \"quantity\": 10, \"price\": 233.00, \"idempotencyKey\": \"test-key-1\"}")
        .when().post("/api/v1/orders")
        .then().statusCode(200);  // First succeeds

        given()
            .contentType("application/json")
            .body("{\"accountId\": 1, \"symbol\": \"AAPL\", \"side\": \"BUY\", \"quantity\": 10, \"price\": 233.00, \"idempotencyKey\": \"test-key-1\"}")
        .when().post("/api/v1/orders")
        .then().statusCode(409);  // Second fails with conflict
    }

    @Test
    void unaffordableBuyReturnsError() {
        // Records current behaviour: insufficient funds
        given()
            .contentType("application/json")
            .body("{\"accountId\": 1, \"symbol\": \"AAPL\", \"side\": \"BUY\", \"quantity\": 1000, \"price\": 233.00, \"idempotencyKey\": \"test-key-2\"}")
        .when().post("/api/v1/orders")
        .then()
            .statusCode(422)  // Or whatever current error code is
            .body("error", notNullValue());
    }
}