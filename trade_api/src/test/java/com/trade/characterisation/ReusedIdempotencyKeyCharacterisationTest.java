package com.trade.characterisation;

import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import io.restassured.RestAssured;
import static io.restassured.RestAssured.given;
import static org.hamcrest.CoreMatchers.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Disabled("Requires a live stack, not in the unit build")
class ReusedIdempotencyKeyCharacterisationTest {

    @Test
    void secondRequestWithSameKeyReturnsConflict() {
        // Records current behaviour: reusing idempotency key
        given()
            .contentType("application/json")
            .body("{\"accountId\": 1, \"symbol\": \"AAPL\", \"side\": \"BUY\", \"quantity\": 10, \"price\": 233.00, \"idempotencyKey\": \"duplicate-key-1\"}")
        .when().post("/api/v1/orders")
        .then().statusCode(200);  // First request succeeds

        given()
            .contentType("application/json")
            .body("{\"accountId\": 1, \"symbol\": \"AAPL\", \"side\": \"BUY\", \"quantity\": 10, \"price\": 233.00, \"idempotencyKey\": \"duplicate-key-1\"}")
        .when().post("/api/v1/orders")
        .then()
            .statusCode(409)  // Second request fails with conflict
            .body("error", containsString("DUP"));
    }
}
