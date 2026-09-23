#!/bin/bash

# Complete Trade System Setup + Demo
#
# Brings the whole platform up from a fresh clone (Postgres, Kafka, the two
# topic-creation scripts, trade-api, trade-executor) and then walks every one
# of trade-api's six contract endpoints, both happy and rejected paths, with
# real curl commands, real JWT auth, and real Kafka verification.
#
# Requires on the host: docker, docker compose, curl, python3, jq (jq is
# optional - responses still print as raw JSON without it).

set +e  # Don't exit on errors - we want to show bad cases

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR" || exit 1

API_BASE="http://localhost:8094"
EXECUTOR_BASE="http://localhost:8093"
KAFKA_UI="http://localhost:8091"
ACCOUNT_ID=1

# ------------------------------------------------------------
# Load .env (same convention as database/apply.sh)
# ------------------------------------------------------------
if [[ -f "$SCRIPT_DIR/.env" ]]; then
    set -a
    # shellcheck disable=SC1091 # path is only known at runtime, by design
    source "$SCRIPT_DIR/.env"
    set +a
fi

# Must match docker-compose.yml's own default exactly, since that's what
# trade-api is actually signing/verifying against if .env doesn't override it.
JWT_SECRET="${JWT_SECRET:-dev-only-jwt-signing-secret-please-change-later}"
POSTGRES_USER="${POSTGRES_USER:-trade}"
POSTGRES_DB="${POSTGRES_DB:-tradedb}"
# Whatever the running containers were actually started with - this script
# never restarts the stack with a different profile itself (see SECTION 6),
# it only reports which behaviour to expect based on what's already up.
SPRING_PROFILES_ACTIVE="${SPRING_PROFILES_ACTIVE:-}"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

# Helper functions
print_header() {
    echo ""
    echo -e "${MAGENTA}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${MAGENTA}║ $1${NC}"
    echo -e "${MAGENTA}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

print_subheader() {
    echo -e "${CYAN}→ $1${NC}"
}

print_curl() {
    echo -e "${YELLOW}CURL COMMAND:${NC}"
    echo -e "${BLUE}$1${NC}"
    echo ""
}

print_response() {
    echo -e "${GREEN}RESPONSE:${NC}"
    echo "$1" | jq . 2>/dev/null || echo "$1"
    echo ""
}

pause() {
    [[ "${NONINTERACTIVE:-0}" == "1" ]] || read -r -p "Press Enter to continue..."
}

# ------------------------------------------------------------
# JWT minting - trade-api has no auth service this sprint, per
# contracts/auth-api.yaml; tokens are minted directly the same way
# trade_api's own JwtTestFixture does (sub, accountId, roles, iss, iat, exp),
# signed HS256 with whatever JWT_SECRET the running stack actually uses.
# Pure-stdlib python3, so no extra dependency beyond what RUN.md already
# requires for fact_trades_etl.
# ------------------------------------------------------------
mint_jwt() {
    local account_id="$1"
    python3 - "$JWT_SECRET" "$account_id" <<'PY'
import sys, json, time, hmac, hashlib, base64

secret, account_id = sys.argv[1], int(sys.argv[2])

def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode()

now = int(time.time())
header = {"alg": "HS256", "typ": "JWT"}
payload = {
    "sub": "11111111-1111-1111-1111-111111111111",
    "accountId": account_id,
    "roles": ["CUSTOMER"],
    "iss": "auth-service",
    "iat": now,
    "exp": now + 900,
}
segments = [
    b64url(json.dumps(header, separators=(",", ":")).encode()),
    b64url(json.dumps(payload, separators=(",", ":")).encode()),
]
signing_input = ".".join(segments).encode()
signature = hmac.new(secret.encode(), signing_input, hashlib.sha256).digest()
segments.append(b64url(signature))
print(".".join(segments))
PY
}

# Runs a read-only-in-spirit but occasionally state-flipping SQL statement
# directly against the running postgres container - used only to stand up
# the "delisted instrument" scenario, since no seed instrument ships
# non-tradable.
run_sql() {
    docker exec -e PGPASSWORD="${POSTGRES_PASSWORD:-trade}" trade-postgres \
        psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -A -c "$1" 2>&1
}

wait_for_health() {
    local name="$1" url="$2" attempts=0
    print_subheader "Waiting for $name to report healthy ($url)"
    until curl -s -o /dev/null -w '' "$url" 2>/dev/null && curl -s "$url" | grep -q '"status":"UP"'; do
        attempts=$((attempts + 1))
        if [[ $attempts -gt 60 ]]; then
            echo -e "${RED}✗ $name did not become healthy after 5 minutes${NC}"
            return 1
        fi
        sleep 5
    done
    echo -e "${GREEN}✓ $name is UP${NC}"
}

# ============================================================================
# SETUP: bring the whole stack up from nothing
# ============================================================================
setup_stack() {
    print_header "SETUP: Bringing up Postgres, Kafka, trade-api, trade-executor"

    if [[ ! -f "$SCRIPT_DIR/.env" ]]; then
        echo -e "${YELLOW}No .env found - copying .env.example. Fill in FAUXNANCE_API_URL/FAUXNANCE_API_KEY${NC}"
        echo -e "${YELLOW}for real quotes, or fills will resolve to REJECTED/PRICE_UNAVAILABLE.${NC}"
        cp "$SCRIPT_DIR/.env.example" "$SCRIPT_DIR/.env"
    fi

    print_subheader "docker compose up -d --build"
    if ! docker compose up -d --build; then
        echo -e "${RED}✗ docker compose up failed - see output above${NC}"
        exit 1
    fi

    wait_for_health "trade-api" "$API_BASE/actuator/health" || exit 1
    wait_for_health "trade-executor" "$EXECUTOR_BASE/actuator/health" || exit 1

    print_subheader "Creating Kafka topics (idempotent - safe to re-run)"
    (cd "$SCRIPT_DIR/kafka_pipeline" && ./create_topics.sh && ./create_dlt_topics.sh)

    echo -e "${GREEN}✓ Stack is up${NC}"
    echo ""
}

# ============================================================================
# Main demo flow
# ============================================================================
main() {
    [[ "${NONINTERACTIVE:-0}" == "1" ]] || clear

    echo -e "${MAGENTA}"
    cat << 'EOF'
    ╔═══════════════════════════════════════════════════════════════════╗
    ║                                                                   ║
    ║            TRADING PLATFORM - SETUP + COMPLETE DEMO               ║
    ║                                                                   ║
    ║  All six contract endpoints, happy and rejected paths,           ║
    ║  real JWT auth, and Kafka event verification                     ║
    ║                                                                   ║
    ╚═══════════════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"

    setup_stack

    JWT_TOKEN="$(mint_jwt "$ACCOUNT_ID")"
    if [[ -z "$JWT_TOKEN" ]]; then
        echo -e "${RED}✗ Failed to mint a JWT (is python3 on PATH?)${NC}"
        exit 1
    fi

    echo -e "${YELLOW}Configuration:${NC}"
    echo "  API Base: $API_BASE"
    echo "  Account ID: $ACCOUNT_ID"
    echo "  JWT Token: ${JWT_TOKEN:0:50}..."
    echo "  Kafka UI: $KAFKA_UI"
    echo ""

    pause

    print_header "SECTION 1: Setup & Validation"
    test_api_connectivity

    print_header "SECTION 2: Happy Paths - All Six Contract Endpoints"
    pause
    happy_path_check_balance
    happy_path_buy_order
    happy_path_sell_order
    happy_path_view_account
    happy_path_view_positions
    happy_path_view_order_history
    happy_path_cancel_order

    print_header "SECTION 3: Bad Paths - Synchronous Rejections (trade-api, no Kafka)"
    pause
    bad_path_insufficient_funds
    bad_path_unknown_symbol
    bad_path_delisted_instrument

    print_header "SECTION 4: Bad Path - Asynchronous Rejection (trade-executor, via Kafka)"
    pause
    bad_path_execution_time_reject

    print_header "SECTION 5: Idempotency Test - Duplicate Prevention"
    pause
    test_idempotency

    print_header "SECTION 6: market-sim Profile - Partial Fills & Synthetic Liquidity"
    pause
    market_sim_demo

    print_summary
}

# ============================================================================
# SECTION 1: Connectivity Tests
# ============================================================================
test_api_connectivity() {
    print_subheader "1.1 Testing API Connectivity"

    CURL_CMD="curl -s http://localhost:8094/actuator/health"
    print_curl "$CURL_CMD"

    RESPONSE=$(curl -s http://localhost:8094/actuator/health)
    print_response "$RESPONSE"

    if echo "$RESPONSE" | grep -q "UP"; then
        echo -e "${GREEN}✓ Trade API is UP and running${NC}"
    else
        echo -e "${RED}✗ Trade API is not responding correctly${NC}"
        return 1
    fi

    echo ""
    pause
}

# ============================================================================
# SECTION 2: Happy Paths
# ============================================================================
happy_path_check_balance() {
    print_subheader "2.1 GET /api/v1/accounts/{id}/balance - Check Account Balance (Before Orders)"

    CURL_CMD="curl -s -X GET \
  -H \"Authorization: Bearer \$JWT_TOKEN\" \
  http://localhost:8094/api/v1/accounts/$ACCOUNT_ID/balance"
    print_curl "$CURL_CMD"

    RESPONSE=$(curl -s -X GET \
        -H "Authorization: Bearer $JWT_TOKEN" \
        http://localhost:8094/api/v1/accounts/$ACCOUNT_ID/balance)
    print_response "$RESPONSE"

    echo "📌 Note the current balance - it will change after successful orders"
    echo ""
    pause
}

happy_path_buy_order() {
    print_subheader "2.2 POST /api/v1/orders - Place BUY Order - AAPL 10 shares @ \$150 (Should SUCCEED)"

    IDEMPOTENCY_KEY="happy-buy-$(date +%s)-$$"

    CURL_CMD="curl -s -X POST \
  -H \"Authorization: Bearer \$JWT_TOKEN\" \
  -H \"Content-Type: application/json\" \
  -d '{\"accountId\":$ACCOUNT_ID,\"symbol\":\"AAPL\",\"side\":\"BUY\",\"quantity\":10,\"price\":150.00,\"idempotencyKey\":\"$IDEMPOTENCY_KEY\"}' \
  http://localhost:8094/api/v1/orders"
    print_curl "$CURL_CMD"

    RESPONSE=$(curl -s -X POST \
        -H "Authorization: Bearer $JWT_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"accountId\":$ACCOUNT_ID,\"symbol\":\"AAPL\",\"side\":\"BUY\",\"quantity\":10,\"price\":150.00,\"idempotencyKey\":\"$IDEMPOTENCY_KEY\"}" \
        http://localhost:8094/api/v1/orders)
    print_response "$RESPONSE"

    ORDER_ID=$(echo "$RESPONSE" | jq -r '.orderId' 2>/dev/null)
    if [[ -n "$ORDER_ID" && "$ORDER_ID" != "null" ]]; then
        echo -e "${GREEN}✓ Order placed, answered NEW: $ORDER_ID${NC}"
    else
        echo -e "${RED}✗ Order placement failed${NC}"
    fi

    echo ""
    echo -e "${YELLOW}📌 Kafka events published for this order:${NC}"
    echo "   1. 'orders' topic → ORDER_PLACED (from trade-api, immediately)"
    echo "   2. 'trade-events' topic → ORDER_FILLED (from trade-executor, once it settles)"
    echo "   Watch both at $KAFKA_UI"
    echo ""
    pause
}

happy_path_sell_order() {
    print_subheader "2.3 POST /api/v1/orders - Place SELL Order - AAPL 5 shares @ \$160 (Should SUCCEED)"

    IDEMPOTENCY_KEY="happy-sell-$(date +%s)-$$"

    CURL_CMD="curl -s -X POST \
  -H \"Authorization: Bearer \$JWT_TOKEN\" \
  -H \"Content-Type: application/json\" \
  -d '{\"accountId\":$ACCOUNT_ID,\"symbol\":\"AAPL\",\"side\":\"SELL\",\"quantity\":5,\"price\":160.00,\"idempotencyKey\":\"$IDEMPOTENCY_KEY\"}' \
  http://localhost:8094/api/v1/orders"
    print_curl "$CURL_CMD"

    RESPONSE=$(curl -s -X POST \
        -H "Authorization: Bearer $JWT_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"accountId\":$ACCOUNT_ID,\"symbol\":\"AAPL\",\"side\":\"SELL\",\"quantity\":5,\"price\":160.00,\"idempotencyKey\":\"$IDEMPOTENCY_KEY\"}" \
        http://localhost:8094/api/v1/orders)
    print_response "$RESPONSE"

    ORDER_ID=$(echo "$RESPONSE" | jq -r '.orderId' 2>/dev/null)
    if [[ -n "$ORDER_ID" && "$ORDER_ID" != "null" ]]; then
        echo -e "${GREEN}✓ Order placed, answered NEW: $ORDER_ID${NC}"
    else
        echo -e "${RED}✗ Order placement failed${NC}"
    fi

    echo ""
    pause
}

happy_path_view_account() {
    print_subheader "2.4 GET /api/v1/accounts/{id} - Account Details"

    CURL_CMD="curl -s -X GET \
  -H \"Authorization: Bearer \$JWT_TOKEN\" \
  http://localhost:8094/api/v1/accounts/$ACCOUNT_ID"
    print_curl "$CURL_CMD"

    RESPONSE=$(curl -s -X GET \
        -H "Authorization: Bearer $JWT_TOKEN" \
        http://localhost:8094/api/v1/accounts/$ACCOUNT_ID)
    print_response "$RESPONSE"
    pause
}

happy_path_view_positions() {
    print_subheader "2.5 GET /api/v1/accounts/{id}/positions - Positions (should show AAPL after the two orders above settle)"

    CURL_CMD="curl -s -X GET \
  -H \"Authorization: Bearer \$JWT_TOKEN\" \
  http://localhost:8094/api/v1/accounts/$ACCOUNT_ID/positions"
    print_curl "$CURL_CMD"

    RESPONSE=$(curl -s -X GET \
        -H "Authorization: Bearer $JWT_TOKEN" \
        http://localhost:8094/api/v1/accounts/$ACCOUNT_ID/positions)
    print_response "$RESPONSE"
    echo "📌 If empty, the executor may not have settled the orders above yet - it's async."
    echo ""
    pause
}

happy_path_view_order_history() {
    print_subheader "2.6 GET /api/v1/accounts/{id}/orders - Order History"

    CURL_CMD="curl -s -X GET \
  -H \"Authorization: Bearer \$JWT_TOKEN\" \
  http://localhost:8094/api/v1/accounts/$ACCOUNT_ID/orders"
    print_curl "$CURL_CMD"

    RESPONSE=$(curl -s -X GET \
        -H "Authorization: Bearer $JWT_TOKEN" \
        http://localhost:8094/api/v1/accounts/$ACCOUNT_ID/orders)
    print_response "$RESPONSE"
    pause
}

happy_path_cancel_order() {
    print_subheader "2.7 DELETE /api/v1/orders/{id} - Cancel a Freshly Placed Order"
    echo "This races the executor: cancel only succeeds while the order is still NEW."
    echo "Either outcome below is correct - it's the guard (UPDATE ... WHERE status='NEW') working either way."
    echo ""

    IDEMPOTENCY_KEY="happy-cancel-$(date +%s)-$$"
    PLACE_RESPONSE=$(curl -s -X POST \
        -H "Authorization: Bearer $JWT_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"accountId\":$ACCOUNT_ID,\"symbol\":\"AAPL\",\"side\":\"BUY\",\"quantity\":1,\"price\":150.00,\"idempotencyKey\":\"$IDEMPOTENCY_KEY\"}" \
        http://localhost:8094/api/v1/orders)
    CANCEL_ORDER_ID=$(echo "$PLACE_RESPONSE" | jq -r '.orderId' 2>/dev/null)
    echo "Placed order to cancel: $CANCEL_ORDER_ID"

    CURL_CMD="curl -s -X DELETE \
  -H \"Authorization: Bearer \$JWT_TOKEN\" \
  http://localhost:8094/api/v1/orders/$CANCEL_ORDER_ID"
    print_curl "$CURL_CMD"

    RESPONSE=$(curl -s -w '\nHTTP_STATUS:%{http_code}' -X DELETE \
        -H "Authorization: Bearer $JWT_TOKEN" \
        "http://localhost:8094/api/v1/orders/$CANCEL_ORDER_ID")
    print_response "$RESPONSE"

    if echo "$RESPONSE" | grep -q "CANCELLED"; then
        echo -e "${GREEN}✓ Cancelled before the executor got to it${NC}"
    else
        echo -e "${YELLOW}→ The executor won the race (ORD-409 OrderNotCancellable) - also correct${NC}"
    fi
    echo ""
    pause
}

# ============================================================================
# SECTION 3: Bad Paths - Synchronous Rejections (trade-api, no Kafka at all)
# ============================================================================
# These three all fail inside OrderLogic.evaluate() at placement time - the
# order is never written and ORDER_PLACED never publishes, so there is
# nothing to see on Kafka for any of them. That's a deliberate, important
# distinction from Section 4 below.
bad_path_insufficient_funds() {
    print_subheader "3.1 Insufficient Funds (Should REJECT synchronously with ORD-400)"

    IDEMPOTENCY_KEY="bad-insufficient-$(date +%s)-$$"

    CURL_CMD="curl -s -X POST \
  -H \"Authorization: Bearer \$JWT_TOKEN\" \
  -H \"Content-Type: application/json\" \
  -d '{\"accountId\":$ACCOUNT_ID,\"symbol\":\"AAPL\",\"side\":\"BUY\",\"quantity\":100000,\"price\":100.00,\"idempotencyKey\":\"$IDEMPOTENCY_KEY\"}' \
  http://localhost:8094/api/v1/orders"
    print_curl "$CURL_CMD"

    RESPONSE=$(curl -s -X POST \
        -H "Authorization: Bearer $JWT_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"accountId\":$ACCOUNT_ID,\"symbol\":\"AAPL\",\"side\":\"BUY\",\"quantity\":100000,\"price\":100.00,\"idempotencyKey\":\"$IDEMPOTENCY_KEY\"}" \
        http://localhost:8094/api/v1/orders)
    print_response "$RESPONSE"

    echo -e "${YELLOW}📌 This is checked by OrderLogic (Sprint 5 rule 6) BEFORE the order is ever written.${NC}"
    echo "   errorCode ORD-400, HTTP 400 - no Orders row, no ORDER_PLACED event, nothing on Kafka."
    echo ""
    pause
}

bad_path_unknown_symbol() {
    print_subheader "3.2 Unknown Symbol (Should REJECT synchronously with INS-404)"

    IDEMPOTENCY_KEY="bad-unknown-symbol-$(date +%s)-$$"

    CURL_CMD="curl -s -X POST \
  -H \"Authorization: Bearer \$JWT_TOKEN\" \
  -H \"Content-Type: application/json\" \
  -d '{\"accountId\":$ACCOUNT_ID,\"symbol\":\"NOSUCHTICKER\",\"side\":\"BUY\",\"quantity\":5,\"price\":100.00,\"idempotencyKey\":\"$IDEMPOTENCY_KEY\"}' \
  http://localhost:8094/api/v1/orders"
    print_curl "$CURL_CMD"

    RESPONSE=$(curl -s -X POST \
        -H "Authorization: Bearer $JWT_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"accountId\":$ACCOUNT_ID,\"symbol\":\"NOSUCHTICKER\",\"side\":\"BUY\",\"quantity\":5,\"price\":100.00,\"idempotencyKey\":\"$IDEMPOTENCY_KEY\"}" \
        http://localhost:8094/api/v1/orders)
    print_response "$RESPONSE"

    echo -e "${YELLOW}📌 errorCode INS-404 - the instrument doesn't exist at all.${NC}"
    echo ""
    pause
}

bad_path_delisted_instrument() {
    print_subheader "3.3 Delisted (Non-Tradable) Instrument (Should REJECT synchronously with INS-404)"
    echo "No seed instrument ships non-tradable, so this flips TSLA's tradable flag off for the"
    echo "duration of this one call, then restores it - matching Instrument.delist() (Sprint 5)."
    echo ""

    run_sql "UPDATE Instruments SET tradable = false WHERE ticker = 'TSLA';" > /dev/null

    IDEMPOTENCY_KEY="bad-delisted-$(date +%s)-$$"
    CURL_CMD="curl -s -X POST \
  -H \"Authorization: Bearer \$JWT_TOKEN\" \
  -H \"Content-Type: application/json\" \
  -d '{\"accountId\":$ACCOUNT_ID,\"symbol\":\"TSLA\",\"side\":\"BUY\",\"quantity\":5,\"price\":100.00,\"idempotencyKey\":\"$IDEMPOTENCY_KEY\"}' \
  http://localhost:8094/api/v1/orders"
    print_curl "$CURL_CMD"

    RESPONSE=$(curl -s -X POST \
        -H "Authorization: Bearer $JWT_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"accountId\":$ACCOUNT_ID,\"symbol\":\"TSLA\",\"side\":\"BUY\",\"quantity\":5,\"price\":100.00,\"idempotencyKey\":\"$IDEMPOTENCY_KEY\"}" \
        http://localhost:8094/api/v1/orders)
    print_response "$RESPONSE"

    run_sql "UPDATE Instruments SET tradable = true WHERE ticker = 'TSLA';" > /dev/null
    echo -e "${YELLOW}📌 errorCode INS-404 - \"the instrument is unknown or no longer tradable\" per the contract.${NC}"
    echo "   TSLA's tradable flag has been restored."
    echo ""
    pause
}

# ============================================================================
# SECTION 4: Bad Path - Asynchronous Rejection (the actual Kafka round trip)
# ============================================================================
bad_path_execution_time_reject() {
    print_subheader "4.1 Unmarketable Limit Price (Should be ACCEPTED, then REJECTED by trade-executor)"
    echo "A limit this far from any real quote passes every Sprint-5 rule at placement time"
    echo "(it's cheap, so affordable) but trade-executor's FillRule rejects it as NOT_MARKETABLE"
    echo "once it prices against a live Fauxnance quote - this is the one scenario that actually"
    echo "exercises ORDER_PLACED → trade-executor → ORDER_REJECTED on trade-events."
    echo ""

    IDEMPOTENCY_KEY="bad-unmarketable-$(date +%s)-$$"
    CURL_CMD="curl -s -X POST \
  -H \"Authorization: Bearer \$JWT_TOKEN\" \
  -H \"Content-Type: application/json\" \
  -d '{\"accountId\":$ACCOUNT_ID,\"symbol\":\"AAPL\",\"side\":\"BUY\",\"quantity\":1,\"price\":0.01,\"idempotencyKey\":\"$IDEMPOTENCY_KEY\"}' \
  http://localhost:8094/api/v1/orders"
    print_curl "$CURL_CMD"

    RESPONSE=$(curl -s -X POST \
        -H "Authorization: Bearer $JWT_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"accountId\":$ACCOUNT_ID,\"symbol\":\"AAPL\",\"side\":\"BUY\",\"quantity\":1,\"price\":0.01,\"idempotencyKey\":\"$IDEMPOTENCY_KEY\"}" \
        http://localhost:8094/api/v1/orders)
    print_response "$RESPONSE"

    ORDER_ID=$(echo "$RESPONSE" | jq -r '.orderId' 2>/dev/null)
    if [[ -z "$ORDER_ID" || "$ORDER_ID" == "null" ]]; then
        echo -e "${RED}✗ Order was rejected synchronously instead - check the response above${NC}"
        pause
        return
    fi
    echo -e "${GREEN}✓ Accepted at NEW: $ORDER_ID - now watching trade-executor settle it${NC}"

    echo -n "Polling order history for a terminal status"
    STATUS="NEW"
    for _ in $(seq 1 20); do
        HIST=$(curl -s -H "Authorization: Bearer $JWT_TOKEN" "http://localhost:8094/api/v1/accounts/$ACCOUNT_ID/orders")
        STATUS=$(echo "$HIST" | jq -r --arg id "$ORDER_ID" '.[] | select(.orderId == $id) | .status' 2>/dev/null)
        [[ "$STATUS" != "NEW" && -n "$STATUS" ]] && break
        echo -n "."
        sleep 2
    done
    echo ""

    if [[ "$STATUS" == "REJECTED" ]]; then
        echo -e "${GREEN}✓ trade-executor rejected it (NOT_MARKETABLE) - confirmed via GET .../orders${NC}"
    else
        echo -e "${YELLOW}→ Still $STATUS after ~40s - check 'docker logs trade-executor' and Kafka UI${NC}"
    fi
    echo "   See it live on $KAFKA_UI: 'orders' → ORDER_PLACED, then 'trade-events' → ORDER_REJECTED"
    echo ""
    pause
}

# ============================================================================
# SECTION 5: Idempotency Test
# ============================================================================
test_idempotency() {
    print_subheader "5.1 Place Order with a Fresh Idempotency Key"

    IDEMPOTENCY_KEY="idem-test-$(date +%s)-$$"
    CURL_CMD="curl -s -X POST \
  -H \"Authorization: Bearer \$JWT_TOKEN\" \
  -H \"Content-Type: application/json\" \
  -d '{\"accountId\":$ACCOUNT_ID,\"symbol\":\"AAPL\",\"side\":\"BUY\",\"quantity\":3,\"price\":150.00,\"idempotencyKey\":\"$IDEMPOTENCY_KEY\"}' \
  http://localhost:8094/api/v1/orders"
    print_curl "$CURL_CMD"

    RESPONSE1=$(curl -s -X POST \
        -H "Authorization: Bearer $JWT_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"accountId\":$ACCOUNT_ID,\"symbol\":\"AAPL\",\"side\":\"BUY\",\"quantity\":3,\"price\":150.00,\"idempotencyKey\":\"$IDEMPOTENCY_KEY\"}" \
        http://localhost:8094/api/v1/orders)
    print_response "$RESPONSE1"

    ORDER_ID_1=$(echo "$RESPONSE1" | jq -r '.orderId' 2>/dev/null)
    echo -e "${GREEN}Order ID: $ORDER_ID_1${NC}"
    echo ""

    print_subheader "5.2 Retry the EXACT SAME Request (same idempotencyKey field, same body)"
    print_curl "$CURL_CMD"

    RESPONSE2=$(curl -s -X POST \
        -H "Authorization: Bearer $JWT_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"accountId\":$ACCOUNT_ID,\"symbol\":\"AAPL\",\"side\":\"BUY\",\"quantity\":3,\"price\":150.00,\"idempotencyKey\":\"$IDEMPOTENCY_KEY\"}" \
        http://localhost:8094/api/v1/orders)
    print_response "$RESPONSE2"

    if echo "$RESPONSE2" | jq -e '.errorCode == "ORD-409"' > /dev/null 2>&1; then
        echo -e "${GREEN}✓ IDEMPOTENCY WORKS! Reused key rejected with ORD-409 - only ONE order exists${NC}"
    else
        echo -e "${RED}✗ Expected ORD-409 on the retry - check the response above${NC}"
    fi

    echo ""
    pause
}

# ============================================================================
# SECTION 6: market-sim Profile - Order-Book Matching & Synthetic Liquidity
# ============================================================================
# Everything above ran whatever profile the stack was actually started with
# (SPRING_PROFILES_ACTIVE, read from .env by both trade-executor and
# trades-generator - see docker-compose.yml). This section only demonstrates
# something different if that was market-sim: restart the stack first with
#   SPRING_PROFILES_ACTIVE=market-sim docker compose up -d --build
# (or set it in .env and re-run this script) to see it. Under the default
# profile this section still runs, honestly, against fill-or-reject instead -
# see logic.md (gitignored) for the full explanation of both profiles.
market_sim_demo() {
    if [[ "$SPRING_PROFILES_ACTIVE" != "market-sim" ]]; then
        echo -e "${YELLOW}SPRING_PROFILES_ACTIVE is '${SPRING_PROFILES_ACTIVE:-<empty>}', not market-sim -${NC}"
        echo "the order below will go through the default fill-or-reject path instead, same as"
        echo "Section 2 - nothing to see here that isn't already shown above."
        echo ""
        echo "To actually see order-book matching, partial fills and the synthetic RANDOMIZER"
        echo "counterparty, restart the stack with:"
        echo -e "  ${BLUE}SPRING_PROFILES_ACTIVE=market-sim docker compose up -d --build${NC}"
        echo "then re-run this script."
        echo ""
        pause
        return
    fi

    print_subheader "6.1 Placing a SELL priced to cross any synthetic BUY (source=RANDOMIZER)"
    echo "trades_generator's OrderGenerator places synthetic counter-orders through a seeded"
    echo "market-maker account every ~10s (30% chance per watched symbol by default), priced at"
    echo "the live tick's own bid/ask - see logic.md's 'Where the crossing counterparty usually"
    echo "comes from'. Pricing this SELL far below any plausible AAPL quote guarantees it crosses"
    echo "the first synthetic BUY that shows up; the only uncertainty is the wait."
    echo ""

    IDEMPOTENCY_KEY="market-sim-sell-$(date +%s)-$$"
    CURL_CMD="curl -s -X POST \
  -H \"Authorization: Bearer \$JWT_TOKEN\" \
  -H \"Content-Type: application/json\" \
  -d '{\"accountId\":$ACCOUNT_ID,\"symbol\":\"AAPL\",\"side\":\"SELL\",\"quantity\":2,\"price\":1.00,\"idempotencyKey\":\"$IDEMPOTENCY_KEY\"}' \
  http://localhost:8094/api/v1/orders"
    print_curl "$CURL_CMD"

    RESPONSE=$(curl -s -X POST \
        -H "Authorization: Bearer $JWT_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"accountId\":$ACCOUNT_ID,\"symbol\":\"AAPL\",\"side\":\"SELL\",\"quantity\":2,\"price\":1.00,\"idempotencyKey\":\"$IDEMPOTENCY_KEY\"}" \
        http://localhost:8094/api/v1/orders)
    print_response "$RESPONSE"

    ORDER_ID=$(echo "$RESPONSE" | jq -r '.orderId' 2>/dev/null)
    if [[ -z "$ORDER_ID" || "$ORDER_ID" == "null" ]]; then
        echo -e "${RED}✗ Order was rejected synchronously instead - check the response above${NC}"
        pause
        return
    fi
    echo -e "${GREEN}✓ Accepted at NEW: $ORDER_ID - resting, waiting for a synthetic BUY to cross it${NC}"

    print_subheader "6.2 Polling order history for PARTIALLY_FILLED or FILLED (up to ~90s)"
    echo -n "Waiting for OrderGenerator's next synthetic order"
    STATUS="NEW"
    for _ in $(seq 1 18); do
        HIST=$(curl -s -H "Authorization: Bearer $JWT_TOKEN" "http://localhost:8094/api/v1/accounts/$ACCOUNT_ID/orders")
        STATUS=$(echo "$HIST" | jq -r --arg id "$ORDER_ID" '.[] | select(.orderId == $id) | .status' 2>/dev/null)
        [[ "$STATUS" != "NEW" && -n "$STATUS" ]] && break
        echo -n "."
        sleep 5
    done
    echo ""

    if [[ "$STATUS" == "FILLED" || "$STATUS" == "PARTIALLY_FILLED" ]]; then
        echo -e "${GREEN}✓ Matched against a synthetic counter-order - status: $STATUS${NC}"
        echo "   A default-profile order can only ever end at FILLED or REJECTED - this status"
        echo "   only exists at all when executor.matching.enabled is true (market-sim)."
    else
        echo -e "${YELLOW}→ Still NEW after ~90s - no synthetic BUY landed for AAPL in this window.${NC}"
        echo "   This is probabilistic by design (see generator.orders.probability) - the order"
        echo "   is still resting and will match the next time one does. Not a failure."
    fi
    echo ""
    echo -e "${YELLOW}📌 On $KAFKA_UI, 'trade-events' now shows TWO messages for a full match: one for${NC}"
    echo "   this SELL, one for the synthetic BUY it matched against - both sides publish"
    echo "   independently (Phase 3 fix - see extension_stories.md, LEAP-004)."
    echo ""
    pause
}

# ============================================================================
# Summary
# ============================================================================
print_summary() {
    print_header "DEMO COMPLETE - Summary & Next Steps"

    cat << 'EOF'
✅ ALL SIX CONTRACT ENDPOINTS EXERCISED:
   POST   /api/v1/orders                    - place (Section 2.2, 2.3)
   DELETE /api/v1/orders/{id}                - cancel (Section 2.7)
   GET    /api/v1/accounts/{id}              - account details (Section 2.4)
   GET    /api/v1/accounts/{id}/balance      - balance (Section 2.1)
   GET    /api/v1/accounts/{id}/positions    - positions (Section 2.5)
   GET    /api/v1/accounts/{id}/orders       - order history (Section 2.6)

❌ REJECTIONS, BOTH CLASSES:
   Synchronous (trade-api, no Kafka):  ORD-400 insufficient funds, INS-404
   unknown symbol, INS-404 delisted instrument - none of these ever reach
   the orders topic.

   Asynchronous (trade-executor, via Kafka): an unmarketable limit price is
   accepted at NEW, then rejected by trade-executor after a real Fauxnance
   quote - this is the one path that actually exercises ORDER_PLACED →
   trade-executor → ORDER_REJECTED on trade-events.

🔄 IDEMPOTENCY:
   A reused idempotencyKey is refused with ORD-409, not silently re-run.

🧪 market-sim PROFILE (Section 6, only if the stack was started with
   SPRING_PROFILES_ACTIVE=market-sim):
   Order-book matching, real partial fills (PARTIALLY_FILLED), synthetic
   RANDOMIZER counter-orders from trades_generator, and both sides of a
   match publishing their own trade-events - none of which exist under the
   default profile. See logic.md (gitignored) for the full walkthrough.

📊 VERIFICATION IN KAFKA UI:
EOF
    echo "   $KAFKA_UI"
    cat << 'EOF'

   Topics to monitor:
   - "orders" → ORDER_PLACED events (initial submission)
   - "trade-events" → ORDER_FILLED or ORDER_REJECTED (final outcome)

🎯 KEY COMPONENTS DEMONSTRATED:

   Trade API:
   - REST endpoint for order placement, cancellation and account reads
   - JWT authentication (minted directly this sprint, no auth service yet)
   - Idempotency key handling
   - Request validation

   Trade Executor:
   - Consumes ORDER_PLACED events from Kafka
   - Re-checks business rules that can have changed since placement
   - Fetches live quotes from Fauxnance
   - Settles transactions (status, cash, position) in one guarded transaction
   - Publishes ORDER_FILLED/REJECTED events

💡 TALKING POINTS FOR DEMO:

   1. "APIs are stateless - database is source of truth"
   2. "Events are immutable audit trail - always know what happened"
   3. "Async processing - API returns immediately, executor works in background"
   4. "Two rejection classes: synchronous placement-time rules never touch
       Kafka; execution-time rules go through the whole event pipeline"
   5. "Idempotency prevents duplicates - safe to retry network failures"

EOF

    echo ""
    echo -e "${MAGENTA}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${MAGENTA}║         Ready for your presentation! Good luck! 🚀           ${NC}"
    echo -e "${MAGENTA}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

# Run the demo
main
