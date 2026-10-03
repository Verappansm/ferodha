#!/bin/bash

# The platform demo, against the Docker stack.
#
# Brings the whole platform up (Postgres, Kafka, the topics, trade-api,
# trade-executor, auth-service and the market-sim generators), then walks the
# auth service and every one of trade-api's six contract endpoints, happy and
# rejected paths, with real tokens from the auth service and real Kafka
# verification.
#
# It also starts the trading UI (Angular, `ng serve`) on the host and finishes
# with a guided tour of it in the browser.
#
#   ./scripts/demo.sh                    # start (or reuse) the stack and the UI, run the demo
#   ./scripts/demo.sh --fresh            # wipe the database volume first
#   ./scripts/demo.sh --no-ui            # backend only, do not start the UI
#   ./scripts/demo.sh --stop-ui          # stop a UI this script started, then exit
#   NONINTERACTIVE=1 ./scripts/demo.sh   # no pauses
#
# Requires on the host: docker with either `docker compose` or
# `docker-compose`, curl and jq; for the UI, Node 20.19+, 22.12+ or 24+ and npm.

set +e  # Don't exit on errors - we want to show bad cases

# Lives in scripts/; everything below works from the repository root.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT" || exit 1

API_BASE="http://localhost:8080"
EXECUTOR_BASE="http://localhost:8082"
AUTH_BASE="http://localhost:3000"
KAFKA_UI="http://localhost:8091"
UI_BASE="http://localhost:4200"

# The UI's process id and log, so a later run (or --stop-ui) can find it.
RUN_DIR="$REPO_ROOT/.run"
UI_PID_FILE="$RUN_DIR/trading-ui.pid"
UI_LOG="$RUN_DIR/trading-ui.log"

# The seeded holder of account 1 (database/seeds/001_seed_data.sql). A user
# registered through the auth service has no trading account yet, so the
# trading sections run as this one.
SEED_EMAIL="${SEED_EMAIL:-john.carter@example.com}"
SEED_PASSWORD="${SEED_PASSWORD:-seed-password-change-me}"
ACCOUNT_ID=1

FRESH=0
START_UI=1
STOP_UI_ONLY=0
for arg in "$@"; do
    case "$arg" in
        --fresh) FRESH=1 ;;
        --no-ui) START_UI=0 ;;
        --stop-ui) STOP_UI_ONLY=1 ;;
        *) echo "Unknown option: $arg (use --fresh, --no-ui or --stop-ui)"; exit 1 ;;
    esac
done

# ------------------------------------------------------------
# Load .env (same convention as database/apply.sh)
# ------------------------------------------------------------
if [[ -f "$REPO_ROOT/.env" ]]; then
    set -a
    # shellcheck disable=SC1091 # path is only known at runtime, by design
    source "$REPO_ROOT/.env"
    set +a
fi

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

# Some hosts have the Compose plugin (`docker compose`), others only the older
# standalone `docker-compose`; use whichever exists.
if docker compose version >/dev/null 2>&1; then
    COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
    COMPOSE=(docker-compose)
else
    echo -e "${RED}✗ Neither 'docker compose' nor 'docker-compose' is available${NC}"
    exit 1
fi

# Logs the seeded account holder in through the auth service and sets
# JWT_TOKEN. Called before every section: an access token lives 15 minutes,
# and a demo with pauses can outlast one.
login_seed_user() {
    local response
    response=$(curl -s -X POST "$AUTH_BASE/auth/login" \
        -H "Content-Type: application/json" \
        -d "{\"username\":\"$SEED_EMAIL\",\"password\":\"$SEED_PASSWORD\"}")
    JWT_TOKEN=$(echo "$response" | jq -r '.accessToken // empty' 2>/dev/null)
    if [[ -z "$JWT_TOKEN" ]]; then
        echo -e "${RED}✗ Could not log in as $SEED_EMAIL: $response${NC}"
        echo "  A database seeded before the seed password existed needs a reset:"
        echo "  run ./scripts/demo.sh --fresh"
        exit 1
    fi
}

# The payload segment of a JWT, decoded (base64url, padding restored).
jwt_claims() {
    local seg="${1#*.}"
    seg="${seg%%.*}"
    seg=$(echo "$seg" | tr '_-' '/+')
    while (( ${#seg} % 4 )); do seg="$seg="; done
    echo "$seg" | base64 -d 2>/dev/null
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
    local name="$1" url="$2" healthy="${3:-\"status\":\"UP\"}" attempts=0
    print_subheader "Waiting for $name to report healthy ($url)"
    until curl -s "$url" 2>/dev/null | grep -q "$healthy"; do
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
    print_header "SETUP: Bringing up the Docker stack"

    if [[ ! -f "$REPO_ROOT/.env" ]]; then
        echo -e "${YELLOW}No .env found - copying .env.example. Fill in FAUXNANCE_API_URL/FAUXNANCE_API_KEY${NC}"
        echo -e "${YELLOW}for real quotes, or fills will resolve to REJECTED/PRICE_UNAVAILABLE.${NC}"
        cp "$REPO_ROOT/.env.example" "$REPO_ROOT/.env"
    fi

    if [[ "$FRESH" == "1" ]]; then
        print_subheader "${COMPOSE[*]} down -v (--fresh: wiping the database volume)"
        "${COMPOSE[@]}" down -v
    fi

    print_subheader "${COMPOSE[*]} up -d --build"
    if ! "${COMPOSE[@]}" up -d --build; then
        echo -e "${RED}✗ ${COMPOSE[*]} up failed - see output above${NC}"
        exit 1
    fi

    wait_for_health "trade-api" "$API_BASE/actuator/health" || exit 1
    wait_for_health "trade-executor" "$EXECUTOR_BASE/actuator/health" || exit 1
    wait_for_health "auth-service" "$AUTH_BASE/health" '"status":"ok"' || exit 1

    print_subheader "Creating Kafka topics (idempotent - safe to re-run)"
    (cd "$REPO_ROOT/kafka_pipeline" && ./create_topics.sh && ./create_dlt_topics.sh)

    echo -e "${GREEN}✓ Stack is up${NC}"
    echo ""
}


# ============================================================================
# UI: the Angular trading UI, served by `ng serve` on the host
# ============================================================================

# True when something already answers on the UI port.
ui_is_up() {
    curl -s -o /dev/null "$UI_BASE"
}

# Node major.minor must satisfy Angular 21: 20.19+, 22.12+ or 24+.
node_version_ok() {
    command -v node >/dev/null 2>&1 || return 1
    local major minor
    IFS=. read -r major minor _ <<< "$(node -v | tr -d v)"
    (( major >= 24 )) && return 0
    (( major == 22 && minor >= 12 )) && return 0
    (( major == 20 && minor >= 19 )) && return 0
    return 1
}

start_ui() {
    print_header "SETUP: Starting the trading UI"

    if ui_is_up; then
        echo -e "${GREEN}✓ Something already serves $UI_BASE - reusing it${NC}"
        return 0
    fi
    if ! node_version_ok; then
        echo -e "${YELLOW}⚠ Node 20.19+, 22.12+ or 24+ is needed for the UI (found: $(node -v 2>/dev/null || echo none)).${NC}"
        echo -e "${YELLOW}  Skipping the UI; the backend demo still runs. Install Node and re-run.${NC}"
        START_UI=0
        return 0
    fi

    mkdir -p "$RUN_DIR"
    if [[ ! -d "$REPO_ROOT/trading-ui/node_modules" ]]; then
        print_subheader "npm ci (first run only)"
        (cd "$REPO_ROOT/trading-ui" && npm ci) || { echo -e "${RED}✗ npm ci failed${NC}"; START_UI=0; return 0; }
    fi

    print_subheader "ng serve on $UI_BASE (log: $UI_LOG)"
    (cd "$REPO_ROOT/trading-ui" && nohup npx ng serve --port 4200 > "$UI_LOG" 2>&1 & echo $! > "$UI_PID_FILE")

    local _
    for _ in $(seq 1 90); do
        if ui_is_up; then
            echo -e "${GREEN}✓ trading UI is UP at $UI_BASE${NC}"
            return 0
        fi
        sleep 2
    done
    echo -e "${RED}✗ The UI did not come up in 3 minutes - see $UI_LOG${NC}"
    START_UI=0
}

stop_ui() {
    if [[ ! -f "$UI_PID_FILE" ]]; then
        echo "No UI started by this script (no $UI_PID_FILE)."
        return 0
    fi
    local pid
    pid="$(cat "$UI_PID_FILE")"
    # ng serve runs under npx: stop the children first, then the parent.
    pkill -P "$pid" 2>/dev/null
    kill "$pid" 2>/dev/null
    rm -f "$UI_PID_FILE"
    echo -e "${GREEN}✓ trading UI stopped${NC}"
}

ui_tour() {
    if [[ "$START_UI" != "1" ]]; then
        echo "The UI was not started (--no-ui, or Node missing). Start it with:"
        echo "  cd trading-ui && npm ci && npm start"
        return 0
    fi
    echo "Open $UI_BASE in a browser and try:"
    echo ""
    echo "  1. Open $UI_BASE/orders while signed out - you are sent to sign-in,"
    echo "     with ?returnUrl=%2Forders in the address bar (the route guard)."
    echo "  2. Sign in with a wrong password - a readable error, no token stored."
    echo "  3. Sign in as $SEED_EMAIL / $SEED_PASSWORD - you land on /orders,"
    echo "     where you were going. The blotter lists every order the demo placed,"
    echo "     newest first, rejections included."
    echo "  4. Order: the account field is read-only. Try quantity 0 or price 1.234 -"
    echo "     refused before anything is sent. Then place BUY 1 AAPL at 150.00 and"
    echo "     watch it on Orders: NEW (IN PROCESS) until the executor resolves it."
    echo "  5. DevTools > Network: /auth/login carries no Authorization header;"
    echo "     /auth/me and every /api/v1 call do (the interceptor's allow list)."
    echo "  6. Sign out - back to sign-in, and /orders is guarded again."
    echo ""
    echo "Other seeded logins (same password): emily.stone@example.com (account 2),"
    echo "e2e.trader@example.com (account 3, used by the Playwright journeys)."
    echo ""
    echo "Stop the UI later with: ./scripts/demo.sh --stop-ui"
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
    ║  The auth service, all six trade-api endpoints, happy and        ║
    ║  rejected paths, and Kafka event verification                    ║
    ║                                                                   ║
    ╚═══════════════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"

    setup_stack
    [[ "$START_UI" == "1" ]] && start_ui

    echo -e "${YELLOW}Configuration:${NC}"
    echo "  Trading UI:   $UI_BASE$([[ "$START_UI" == "1" ]] || echo '  (not started)')"
    echo "  Trade API:    $API_BASE"
    echo "  Auth service: $AUTH_BASE  (OpenAPI: $AUTH_BASE/docs)"
    echo "  Account ID:   $ACCOUNT_ID ($SEED_EMAIL)"
    echo "  Kafka UI:     $KAFKA_UI"
    echo ""

    pause

    print_header "SECTION 1: The Auth Service"
    auth_demo

    print_header "SECTION 1.5: Trade API Connectivity"
    test_api_connectivity

    print_header "SECTION 2: Happy Paths - All Six Contract Endpoints"
    pause
    login_seed_user
    happy_path_check_balance
    happy_path_buy_order
    happy_path_sell_order
    happy_path_view_account
    happy_path_view_positions
    happy_path_view_order_history
    happy_path_cancel_order

    print_header "SECTION 3: Bad Paths - Synchronous Rejections (trade-api, no Kafka)"
    pause
    login_seed_user
    bad_path_insufficient_funds
    bad_path_unknown_symbol
    bad_path_delisted_instrument

    print_header "SECTION 4: Bad Path - Asynchronous Rejection (trade-executor, via Kafka)"
    pause
    login_seed_user
    bad_path_execution_time_reject

    print_header "SECTION 5: Idempotency Test - Duplicate Prevention"
    pause
    login_seed_user
    test_idempotency

    print_header "SECTION 6: market-sim Profile - Partial Fills & Synthetic Liquidity"
    pause
    login_seed_user
    market_sim_demo

    print_header "SECTION 7: The Trading UI"
    ui_tour
    pause

    print_summary
}

# ============================================================================
# SECTION 1: The Auth Service
# ============================================================================
auth_demo() {
    local email password code response

    print_subheader "1.1 Register a new user (no token, no trading account)"
    email="demo.$(date +%s).$RANDOM@example.com"
    password="demo-password-123"
    CURL_CMD="curl -s -X POST $AUTH_BASE/auth/register -H 'Content-Type: application/json' \
  -d '{\"name\":\"Demo User\",\"username\":\"$email\",\"password\":\"$password\"}'"
    print_curl "$CURL_CMD"
    response=$(curl -s -w $'\n%{http_code}' -X POST "$AUTH_BASE/auth/register" \
        -H "Content-Type: application/json" \
        -d "{\"name\":\"Demo User\",\"username\":\"$email\",\"password\":\"$password\"}")
    code="${response##*$'\n'}"
    print_response "${response%$'\n'*}"
    if [[ "$code" == "201" ]]; then
        echo -e "${GREEN}✓ 201 Created - a user, with no token and no accountId${NC}"
    else
        echo -e "${RED}✗ Expected 201, got $code${NC}"
    fi
    echo ""
    pause

    print_subheader "1.2 That user logs in before an account is opened for them"
    code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$AUTH_BASE/auth/login" \
        -H "Content-Type: application/json" \
        -d "{\"username\":\"$email\",\"password\":\"$password\"}")
    if [[ "$code" == "401" ]]; then
        echo -e "${GREEN}✓ 401 - no trading account yet, so no token to issue${NC}"
    else
        echo -e "${RED}✗ Expected 401, got $code${NC}"
    fi
    echo ""
    pause

    print_subheader "1.3 Log in as the holder of account $ACCOUNT_ID"
    CURL_CMD="curl -s -X POST $AUTH_BASE/auth/login -H 'Content-Type: application/json' \
  -d '{\"username\":\"$SEED_EMAIL\",\"password\":\"<seed password>\"}'"
    print_curl "$CURL_CMD"
    login_seed_user
    echo -e "${GREEN}✓ Got an access token (${#JWT_TOKEN} chars). Its claims:${NC}"
    print_response "$(jwt_claims "$JWT_TOKEN")"
    echo "  sub, accountId, roles, iat, exp and iss - nothing else, and no email."
    echo ""
    pause

    print_subheader "1.4 GET /auth/me with that token"
    response=$(curl -s -H "Authorization: Bearer $JWT_TOKEN" "$AUTH_BASE/auth/me")
    print_response "$response"
    echo ""

    print_subheader "1.5 trade-api refuses a request with no token, and one with a forged signature"
    code=$(curl -s -o /dev/null -w '%{http_code}' "$API_BASE/api/v1/accounts/$ACCOUNT_ID/balance")
    [[ "$code" == "401" ]] \
        && echo -e "${GREEN}✓ no token: 401${NC}" \
        || echo -e "${RED}✗ no token: expected 401, got $code${NC}"
    # Same header and claims, different signature: what a token signed with a
    # key trade-api does not trust looks like to it.
    local forged="${JWT_TOKEN%.*}.c2lnbmVkLXdpdGgtYW4tdW50cnVzdGVkLWtleQ"
    code=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $forged" \
        "$API_BASE/api/v1/accounts/$ACCOUNT_ID/balance")
    [[ "$code" == "401" ]] \
        && echo -e "${GREEN}✓ forged signature: 401${NC}" \
        || echo -e "${RED}✗ forged signature: expected 401, got $code${NC}"
    echo ""
    pause
}

# ============================================================================
# SECTION 1.5: Trade API Connectivity
# ============================================================================
test_api_connectivity() {
    print_subheader "1.6 Testing API Connectivity"

    CURL_CMD="curl -s http://localhost:8080/actuator/health"
    print_curl "$CURL_CMD"

    RESPONSE=$(curl -s http://localhost:8080/actuator/health)
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
  http://localhost:8080/api/v1/accounts/$ACCOUNT_ID/balance"
    print_curl "$CURL_CMD"

    RESPONSE=$(curl -s -X GET \
        -H "Authorization: Bearer $JWT_TOKEN" \
        http://localhost:8080/api/v1/accounts/$ACCOUNT_ID/balance)
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
  http://localhost:8080/api/v1/orders"
    print_curl "$CURL_CMD"

    RESPONSE=$(curl -s -X POST \
        -H "Authorization: Bearer $JWT_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"accountId\":$ACCOUNT_ID,\"symbol\":\"AAPL\",\"side\":\"BUY\",\"quantity\":10,\"price\":150.00,\"idempotencyKey\":\"$IDEMPOTENCY_KEY\"}" \
        http://localhost:8080/api/v1/orders)
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
  http://localhost:8080/api/v1/orders"
    print_curl "$CURL_CMD"

    RESPONSE=$(curl -s -X POST \
        -H "Authorization: Bearer $JWT_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"accountId\":$ACCOUNT_ID,\"symbol\":\"AAPL\",\"side\":\"SELL\",\"quantity\":5,\"price\":160.00,\"idempotencyKey\":\"$IDEMPOTENCY_KEY\"}" \
        http://localhost:8080/api/v1/orders)
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
  http://localhost:8080/api/v1/accounts/$ACCOUNT_ID"
    print_curl "$CURL_CMD"

    RESPONSE=$(curl -s -X GET \
        -H "Authorization: Bearer $JWT_TOKEN" \
        http://localhost:8080/api/v1/accounts/$ACCOUNT_ID)
    print_response "$RESPONSE"
    pause
}

happy_path_view_positions() {
    print_subheader "2.5 GET /api/v1/accounts/{id}/positions - Positions (should show AAPL after the two orders above settle)"

    CURL_CMD="curl -s -X GET \
  -H \"Authorization: Bearer \$JWT_TOKEN\" \
  http://localhost:8080/api/v1/accounts/$ACCOUNT_ID/positions"
    print_curl "$CURL_CMD"

    RESPONSE=$(curl -s -X GET \
        -H "Authorization: Bearer $JWT_TOKEN" \
        http://localhost:8080/api/v1/accounts/$ACCOUNT_ID/positions)
    print_response "$RESPONSE"
    echo "📌 If empty, the executor may not have settled the orders above yet - it's async."
    echo ""
    pause
}

happy_path_view_order_history() {
    print_subheader "2.6 GET /api/v1/accounts/{id}/orders - Order History"

    CURL_CMD="curl -s -X GET \
  -H \"Authorization: Bearer \$JWT_TOKEN\" \
  http://localhost:8080/api/v1/accounts/$ACCOUNT_ID/orders"
    print_curl "$CURL_CMD"

    RESPONSE=$(curl -s -X GET \
        -H "Authorization: Bearer $JWT_TOKEN" \
        http://localhost:8080/api/v1/accounts/$ACCOUNT_ID/orders)
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
        http://localhost:8080/api/v1/orders)
    CANCEL_ORDER_ID=$(echo "$PLACE_RESPONSE" | jq -r '.orderId' 2>/dev/null)
    echo "Placed order to cancel: $CANCEL_ORDER_ID"

    CURL_CMD="curl -s -X DELETE \
  -H \"Authorization: Bearer \$JWT_TOKEN\" \
  http://localhost:8080/api/v1/orders/$CANCEL_ORDER_ID"
    print_curl "$CURL_CMD"

    RESPONSE=$(curl -s -w '\nHTTP_STATUS:%{http_code}' -X DELETE \
        -H "Authorization: Bearer $JWT_TOKEN" \
        "http://localhost:8080/api/v1/orders/$CANCEL_ORDER_ID")
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
  http://localhost:8080/api/v1/orders"
    print_curl "$CURL_CMD"

    RESPONSE=$(curl -s -X POST \
        -H "Authorization: Bearer $JWT_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"accountId\":$ACCOUNT_ID,\"symbol\":\"AAPL\",\"side\":\"BUY\",\"quantity\":100000,\"price\":100.00,\"idempotencyKey\":\"$IDEMPOTENCY_KEY\"}" \
        http://localhost:8080/api/v1/orders)
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
  http://localhost:8080/api/v1/orders"
    print_curl "$CURL_CMD"

    RESPONSE=$(curl -s -X POST \
        -H "Authorization: Bearer $JWT_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"accountId\":$ACCOUNT_ID,\"symbol\":\"NOSUCHTICKER\",\"side\":\"BUY\",\"quantity\":5,\"price\":100.00,\"idempotencyKey\":\"$IDEMPOTENCY_KEY\"}" \
        http://localhost:8080/api/v1/orders)
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
  http://localhost:8080/api/v1/orders"
    print_curl "$CURL_CMD"

    RESPONSE=$(curl -s -X POST \
        -H "Authorization: Bearer $JWT_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"accountId\":$ACCOUNT_ID,\"symbol\":\"TSLA\",\"side\":\"BUY\",\"quantity\":5,\"price\":100.00,\"idempotencyKey\":\"$IDEMPOTENCY_KEY\"}" \
        http://localhost:8080/api/v1/orders)
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
  http://localhost:8080/api/v1/orders"
    print_curl "$CURL_CMD"

    RESPONSE=$(curl -s -X POST \
        -H "Authorization: Bearer $JWT_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"accountId\":$ACCOUNT_ID,\"symbol\":\"AAPL\",\"side\":\"BUY\",\"quantity\":1,\"price\":0.01,\"idempotencyKey\":\"$IDEMPOTENCY_KEY\"}" \
        http://localhost:8080/api/v1/orders)
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
        HIST=$(curl -s -H "Authorization: Bearer $JWT_TOKEN" "http://localhost:8080/api/v1/accounts/$ACCOUNT_ID/orders")
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
  http://localhost:8080/api/v1/orders"
    print_curl "$CURL_CMD"

    RESPONSE1=$(curl -s -X POST \
        -H "Authorization: Bearer $JWT_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"accountId\":$ACCOUNT_ID,\"symbol\":\"AAPL\",\"side\":\"BUY\",\"quantity\":3,\"price\":150.00,\"idempotencyKey\":\"$IDEMPOTENCY_KEY\"}" \
        http://localhost:8080/api/v1/orders)
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
        http://localhost:8080/api/v1/orders)
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
#   SPRING_PROFILES_ACTIVE=market-sim ./scripts/demo.sh
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
        echo -e "  ${BLUE}SPRING_PROFILES_ACTIVE=market-sim ./scripts/demo.sh${NC}"
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
  http://localhost:8080/api/v1/orders"
    print_curl "$CURL_CMD"

    RESPONSE=$(curl -s -X POST \
        -H "Authorization: Bearer $JWT_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"accountId\":$ACCOUNT_ID,\"symbol\":\"AAPL\",\"side\":\"SELL\",\"quantity\":2,\"price\":1.00,\"idempotencyKey\":\"$IDEMPOTENCY_KEY\"}" \
        http://localhost:8080/api/v1/orders)
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
        HIST=$(curl -s -H "Authorization: Bearer $JWT_TOKEN" "http://localhost:8080/api/v1/accounts/$ACCOUNT_ID/orders")
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
    echo "   independently (Phase 3 fix - see story_docs/extension-stories.md, LEAP-004)."
    echo ""
    pause
}

# ============================================================================
# Summary
# ============================================================================
print_summary() {
    print_header "DEMO COMPLETE - Summary & Next Steps"

    cat << 'EOF'
🔐 AUTH SERVICE (Section 1):
   Register (no token, no account), login refused until an account exists,
   login as an account holder, /auth/me, and trade-api refusing a missing or
   forged token. OpenAPI: http://localhost:3000/docs

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
   - JWT verification of tokens issued by the auth service
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
if [[ "$STOP_UI_ONLY" == "1" ]]; then
    stop_ui
    exit 0
fi
main
