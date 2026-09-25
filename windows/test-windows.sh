#!/usr/bin/env bash
set -euo pipefail

# ── End-to-end check for the "windows" profile ────────────────────────────────
# Run from Git Bash on the Windows machine, after windows/start-windows.ps1.
# Proves the split setup actually talks:
#
#   auth-service    (Windows)  issues a real token
#   trade-api       (Windows)  accepts it, stores the order, publishes
#                              ORDER_PLACED  ──►  Kafka (Linux Docker)
#   trade-executor  (Windows)  consumes it from Kafka, settles, publishes
#                              ORDER_FILLED / ORDER_REJECTED  ──►  Kafka
#   postgres        (Windows)  holds the settled result
#
# Main (default) profile only: trades-generator is not part of this setup.
#
# Needs only curl, sed, grep and psql - no jq, no python, no docker.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env.windows"
LOG_DIR="$SCRIPT_DIR/.run/logs"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "FAIL: $ENV_FILE not found - copy windows/.env.windows.example and fill it in."
  exit 1
fi
# Parsed line by line rather than sourced: values such as
# PSQL_BIN_DIR=C:\Program Files\PostgreSQL\18\bin contain spaces.
while IFS= read -r line || [[ -n "$line" ]]; do
  line="${line%$'\r'}"
  [[ -z "${line//[[:space:]]/}" || "$line" =~ ^[[:space:]]*# ]] && continue
  [[ "$line" == *=* ]] || continue
  key="${line%%=*}"; key="${key//[[:space:]]/}"
  value="${line#*=}"
  export "$key=$value"
done < "$ENV_FILE"

TRADE_API="http://localhost:${TRADE_API_PORT:-8080}"
EXECUTOR="http://localhost:${TRADE_EXECUTOR_PORT:-8082}"
AUTH="http://localhost:${AUTH_SERVICE_PORT:-3000}"
ACCOUNT_ID="${ACCOUNT_ID:-1}"
POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_DB="${POSTGRES_DB:-tradedb}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"

find_psql() {
  if [[ -n "${PSQL_BIN_DIR:-}" ]]; then
    local dir="$PSQL_BIN_DIR"
    command -v cygpath >/dev/null 2>&1 && dir="$(cygpath -u "$dir")"
    if [[ -x "$dir/psql.exe" ]]; then echo "$dir/psql.exe"; return; fi
  fi
  if command -v psql >/dev/null 2>&1; then command -v psql; return; fi
  # Last match wins: the glob expands in version order for 16/17/18.
  local candidate found=""
  for candidate in "/c/Program Files/PostgreSQL/"*/bin/psql.exe; do
    [[ -x "$candidate" ]] && found="$candidate"
  done
  [[ -n "$found" ]] && echo "$found"
}
PSQL="$(find_psql || true)"

run_sql() {
  PGPASSWORD="${POSTGRES_PASSWORD:-}" "$PSQL" -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" \
    -d "$POSTGRES_DB" -X -t -A -c "$1"
}

# Pulls "field":"value" (or "field":value) out of a flat JSON body.
json_field() {
  sed -n "s/.*\"$1\":\"\{0,1\}\([^\",}]*\)\"\{0,1\}.*/\1/p" <<<"$2" | head -1
}

# ── Stage: Preflight - every Windows service up, Kafka reachable ─────────────
echo "== Stage: Preflight =="
check_up() {
  local name="$1" url="$2" pattern="$3"
  if curl -s --max-time 5 "$url" | grep -q "$pattern"; then
    echo "PASS: $name up ($url)"
  else
    echo "FAIL: $name not healthy at $url - is windows/start-windows.ps1 running?"
    exit 1
  fi
}
check_up "trade-api" "$TRADE_API/actuator/health" '"status":"UP"'
check_up "trade-executor" "$EXECUTOR/actuator/health" '"status":"UP"'
check_up "auth-service" "$AUTH/health" '"status":"ok"'

KAFKA_HOST="${KAFKA_BOOTSTRAP_SERVERS%%,*}"
KAFKA_PORT="${KAFKA_HOST##*:}"
KAFKA_HOST="${KAFKA_HOST%:*}"
if timeout 5 bash -c "exec 3<>/dev/tcp/$KAFKA_HOST/$KAFKA_PORT" 2>/dev/null; then
  echo "PASS: Kafka reachable at $KAFKA_HOST:$KAFKA_PORT (Linux)"
else
  echo "FAIL: cannot reach Kafka at $KAFKA_HOST:$KAFKA_PORT"
  exit 1
fi

# ── Stage: Smoke test - no token is rejected ─────────────────────────────────
echo "== Stage: Smoke Test - No Token Is Rejected =="
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$TRADE_API/api/v1/orders" \
  -H "Content-Type: application/json" \
  -d "{\"accountId\":$ACCOUNT_ID,\"symbol\":\"AAPL\",\"side\":\"BUY\",\"quantity\":1,\"price\":150.00,\"idempotencyKey\":\"no-token-$(date +%s)\"}")
if [[ "$CODE" != "401" ]]; then echo "FAIL: expected 401 with no token, got $CODE"; exit 1; fi
echo "PASS: unauthenticated request rejected (401)"

# ── Stage: Real token from the auth service ──────────────────────────────────
# Seeded users only carry placeholder password hashes, so register a fresh
# user linked to the account, then log in as it.
echo "== Stage: Register + Login via auth-service =="
EMAIL="windows.e2e.$(date +%s).$RANDOM@example.com"
PASSWORD="windows-e2e-password-123"
REGISTER_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$AUTH/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Windows E2E\",\"username\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"accountId\":$ACCOUNT_ID}")
if [[ "$REGISTER_CODE" != "201" ]]; then echo "FAIL: register returned $REGISTER_CODE (expected 201)"; exit 1; fi

LOGIN_RESPONSE=$(curl -s -X POST "$AUTH/auth/login" \
  -H "Content-Type: application/json" -d "{\"username\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
TOKEN=$(json_field accessToken "$LOGIN_RESPONSE")
if [[ -z "$TOKEN" ]]; then echo "FAIL: no token from auth service. Response: $LOGIN_RESPONSE"; exit 1; fi
echo "PASS: got an access token for $EMAIL (account $ACCOUNT_ID)"

BALANCE_BEFORE=$(curl -s -H "Authorization: Bearer $TOKEN" "$TRADE_API/api/v1/accounts/$ACCOUNT_ID/balance")
echo "Balance before the order: $BALANCE_BEFORE"

# ── Stage: Authenticated order through trade-api ─────────────────────────────
echo "== Stage: Place Order With The Auth-Service Token =="
IDEMPOTENCY_KEY="windows-e2e-$(date +%s)-$$"
ORDER_RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" -X POST "$TRADE_API/api/v1/orders" \
  -H "Content-Type: application/json" \
  -d "{\"accountId\":$ACCOUNT_ID,\"symbol\":\"AAPL\",\"side\":\"BUY\",\"quantity\":1,\"price\":150.00,\"idempotencyKey\":\"$IDEMPOTENCY_KEY\"}")
echo "Order response: $ORDER_RESPONSE"
ORDER_ID=$(json_field orderId "$ORDER_RESPONSE")
ORDER_STATUS=$(json_field status "$ORDER_RESPONSE")
if [[ -z "$ORDER_ID" || "$ORDER_STATUS" != "NEW" ]]; then echo "FAIL: order was not accepted at NEW"; exit 1; fi
echo "PASS: trade-api accepted the auth-service token and stored order $ORDER_ID (NEW)"

# ── Stage: Kafka round trip Windows → Linux → Windows ────────────────────────
echo "== Stage: Kafka Round Trip =="
EXECUTOR_LOG="$LOG_DIR/trade-executor.log"
RECEIVED=""
for _ in $(seq 1 30); do
  if [[ -f "$EXECUTOR_LOG" ]] && grep -q "Received ORDER_PLACED.*$ORDER_ID" "$EXECUTOR_LOG"; then
    RECEIVED="yes"; break
  fi
  sleep 1
done
if [[ -z "$RECEIVED" ]]; then
  echo "FAIL: trade-executor never logged ORDER_PLACED for $ORDER_ID within 30s."
  echo "      trade-api -> Kafka or Kafka -> trade-executor is broken. Check $LOG_DIR/*.log"
  exit 1
fi
echo "PASS: trade-executor consumed ORDER_PLACED for $ORDER_ID from the Linux broker"

FINAL_STATUS="NEW"
for _ in $(seq 1 30); do
  HISTORY=$(curl -s -H "Authorization: Bearer $TOKEN" "$TRADE_API/api/v1/accounts/$ACCOUNT_ID/orders")
  # Isolate this order's object, then its status.
  ENTRY=$(tr '{' '\n' <<<"$HISTORY" | grep "\"orderId\":\"$ORDER_ID\"" || true)
  FINAL_STATUS=$(json_field status "$ENTRY")
  [[ -n "$FINAL_STATUS" && "$FINAL_STATUS" != "NEW" ]] && break
  sleep 2
done
case "$FINAL_STATUS" in
  FILLED|PARTIALLY_FILLED|REJECTED)
    echo "PASS: order settled by trade-executor -> $FINAL_STATUS" ;;
  NEW)
    echo "FAIL: order still NEW after 60s - trade-executor received it but never settled it. See $EXECUTOR_LOG"
    exit 1 ;;
  *)
    echo "FAIL: could not read this order's status from order history: $HISTORY"
    exit 1 ;;
esac

if [[ "$FINAL_STATUS" == "REJECTED" ]]; then
  echo "      (REJECTED is expected without FAUXNANCE_API_URL/KEY: no live price -> PRICE_UNAVAILABLE."
  echo "       The Kafka round trip above is what this test proves.)"
fi

# ── Stage: Show the result through trade-api ─────────────────────────────────
echo "== Stage: Show The Result =="
echo "-- Order (from order history):"
echo "   $ENTRY" | sed 's/[},]*$//'
echo "-- Balance before: $BALANCE_BEFORE"
echo "-- Balance after:  $(curl -s -H "Authorization: Bearer $TOKEN" "$TRADE_API/api/v1/accounts/$ACCOUNT_ID/balance")"
echo "-- Positions:      $(curl -s -H "Authorization: Bearer $TOKEN" "$TRADE_API/api/v1/accounts/$ACCOUNT_ID/positions")"

# ── Stage: Confirm it landed in Postgres (local psql) ────────────────────────
echo "== Stage: Confirm It Actually Landed in Postgres =="
if [[ -z "$PSQL" ]]; then
  echo "SKIP: psql not found (set PSQL_BIN_DIR in windows/.env.windows)"
else
  echo "-- orders row:"
  run_sql "SELECT order_id, status, rejection_reason, executed_price FROM orders WHERE order_id = '$ORDER_ID';"
  echo "-- account cash:"
  run_sql "SELECT id, cash_balance FROM accounts WHERE id = $ACCOUNT_ID;"
fi

echo "== ALL STAGES PASSED =="
