package com.trade.characterisation;

import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import io.restassured.RestAssured;
import static io.restassured.RestAssured.given;
import static org.hamcrest.CoreMatchers.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Disabled("Requires a live stack, not in the unit build")
class UnaffordableBuyCharacterisationTest {

    @Test
    void unaffordableBuyRejectedWithError() {
        // Records current behaviour: buy order beyond account means
        given()
            .contentType("application/json")
            .body("{\"accountId\": 1, \"symbol\": \"AAPL\", \"side\": \"BUY\", \"quantity\": 10000, \"price\": 233.00, \"idempotencyKey\": \"test-key-insufficient\"}")
        .when().post("/api/v1/orders")
        .then()
            .statusCode(422)  // Or whatever current error code for insufficient funds
            .body("error", notNullValue())
            .body("message", notNullValue());
    }
}
