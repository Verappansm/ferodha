#!/usr/bin/env bash
set -euo pipefail

# ── End-to-end demo / check for the "windows" profile ─────────────────────────
# Run from Git Bash on the Windows machine, after windows/start-windows.ps1.
# Walks through the split setup one stage at a time:
#
#   auth-service    (Windows)  issues a real token
#   trade-api       (Windows)  accepts it, stores the order, publishes
#                              ORDER_PLACED  ──►  Kafka (Linux Docker)
#   trade-executor  (Windows)  consumes it from Kafka, settles, publishes
#                              ORDER_FILLED / ORDER_REJECTED  ──►  Kafka
#   postgres        (Windows)  holds the settled result
#
# Main (default) profile only: the market maker (market-sim) is not exercised here.
#
#   bash windows/test-windows.sh            # presenter mode: Enter between stages
#   bash windows/test-windows.sh --auto     # timed pauses (DEMO_DELAY seconds, default 4)
#   bash windows/test-windows.sh --fast     # no pauses - plain pass/fail check
#
# Needs only curl, sed, grep and psql - no jq, no docker. Uses python for
# pretty-printing JSON when it's installed.

MODE="interactive"
case "${1:-}" in
  --auto) MODE="auto" ;;
  --fast) MODE="fast" ;;
  "") ;;
  *) echo "usage: $0 [--auto|--fast]"; exit 2 ;;
esac
# Nobody to press Enter (piped / CI): don't wait for one.
[[ "$MODE" == "interactive" && ! -t 0 ]] && MODE="fast"
DEMO_DELAY="${DEMO_DELAY:-4}"

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
SYMBOL="${SYMBOL:-AAPL}"
POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_DB="${POSTGRES_DB:-tradedb}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
EXECUTOR_LOG="$LOG_DIR/trade-executor.log"

# ── Presentation helpers ─────────────────────────────────────────────────────
if [[ -t 1 && -z "${NO_COLOR:-}" ]]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'; GREEN=$'\033[32m'
  YELLOW=$'\033[33m'; BLUE=$'\033[34m'; MAGENTA=$'\033[35m'; CYAN=$'\033[36m'; RESET=$'\033[0m'
else
  BOLD=""; DIM=""; RED=""; GREEN=""; YELLOW=""; BLUE=""; MAGENTA=""; CYAN=""; RESET=""
fi

STAGE_NO=0
STAGE_TOTAL=8

# Banner plus one line of narration: what this stage is about to prove.
stage() {
  STAGE_NO=$((STAGE_NO + 1))
  echo ""
  echo "${MAGENTA}${BOLD}══════════════════════════════════════════════════════════════════════${RESET}"
  echo "${MAGENTA}${BOLD}  STAGE $STAGE_NO/$STAGE_TOTAL  $1${RESET}"
  echo "${MAGENTA}${BOLD}══════════════════════════════════════════════════════════════════════${RESET}"
  [[ -n "${2:-}" ]] && echo "${CYAN}  $2${RESET}"
  echo ""
}

pass() { echo "${GREEN}${BOLD}  ✔ $*${RESET}"; }
info() { echo "${YELLOW}  ➜ $*${RESET}"; }
fail() {
  echo "${RED}${BOLD}  ✘ FAIL: $*${RESET}"
  exit 1
}

# Shown before each request, so the audience sees exactly what's sent. The
# bearer token is shortened - the full one is shown decoded in stage 3.
show_cmd() {
  local text="$*"
  [[ -n "${TOKEN:-}" ]] && text="${text//$TOKEN/${TOKEN:0:20}…}"
  echo "${BLUE}  \$ $text${RESET}"
}

# Pretty JSON when python is available; the raw body otherwise.
PYTHON=""
for candidate in python3 python py; do
  if command -v "$candidate" >/dev/null 2>&1 && "$candidate" -c "import json" >/dev/null 2>&1; then
    PYTHON="$candidate"; break
  fi
done
show_json() {
  local body="$1"
  if [[ -n "$PYTHON" ]] && printf '%s' "$body" | "$PYTHON" -m json.tool >/dev/null 2>&1; then
    printf '%s' "$body" | "$PYTHON" -m json.tool | sed 's/^/      /'
  else
    echo "      $body"
  fi
}

pause() {
  case "$MODE" in
    interactive) echo ""; read -r -p "${DIM}  [ press Enter to continue ]${RESET}" _ ;;
    auto) sleep "$DEMO_DELAY" ;;
    fast) ;;
  esac
}

# Animated wait, so a poll loop visibly does something on screen.
spinner_tick() { printf '%s' "${DIM}.${RESET}"; }

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
    -d "$POSTGRES_DB" -X -P pager=off -c "$1" | sed 's/^/      /'
}

# Pulls "field":"value" (or "field":value) out of a flat JSON body.
json_field() {
  sed -n "s/.*\"$1\":\"\{0,1\}\([^\",}]*\)\"\{0,1\}.*/\1/p" <<<"$2" | head -1
}

# Base64url-decodes a JWT segment (adds the padding base64 -d wants).
jwt_part() {
  local seg="${1//-/+}"; seg="${seg//_//}"
  while (( ${#seg} % 4 )); do seg="$seg="; done
  base64 -d <<<"$seg" 2>/dev/null || true
}

# ── Intro ────────────────────────────────────────────────────────────────────
echo ""
echo "${BOLD}  Trading platform - Windows services + Kafka on Linux${RESET}"
echo ""
echo "    ${BOLD}Windows${RESET}                                     ${BOLD}Linux (Docker)${RESET}"
echo "    auth-service  ${DIM}:${AUTH_SERVICE_PORT:-3000}${RESET}  ── token ──►  trade-api ${DIM}:${TRADE_API_PORT:-8080}${RESET}"
echo "    trade-api     ── ORDER_PLACED ─────────────────►  Kafka ${DIM}${KAFKA_BOOTSTRAP_SERVERS:-?}${RESET}"
echo "    trade-executor ${DIM}:${TRADE_EXECUTOR_PORT:-8082}${RESET} ◄── orders ──────────────  Kafka"
echo "    trade-executor ── ORDER_FILLED/REJECTED ───────►  Kafka (trade-events)"
echo "    PostgreSQL    ${DIM}${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}${RESET}"
[[ -n "${KAFKA_UI_URL:-}" ]] && echo "" && echo "    Kafka UI: ${BOLD}${KAFKA_UI_URL}${RESET}  (Topics → orders / trade-events → Messages)"
pause

# ── Stage 1: everything up ───────────────────────────────────────────────────
stage "Preflight" "Every Windows service is healthy, and the Linux broker is reachable from this machine."
check_up() {
  local name="$1" url="$2" pattern="$3" body
  show_cmd "curl -s $url"
  body="$(curl -s --max-time 5 "$url" || true)"
  if grep -q "$pattern" <<<"$body"; then
    pass "$name is up   ${DIM}$body${RESET}"
  else
    fail "$name not healthy at $url - is windows/start-windows.ps1 running?"
  fi
}
check_up "trade-api     " "$TRADE_API/actuator/health" '"status":"UP"'
check_up "trade-executor" "$EXECUTOR/actuator/health" '"status":"UP"'
check_up "auth-service  " "$AUTH/health" '"status":"ok"'

KAFKA_HOST="${KAFKA_BOOTSTRAP_SERVERS%%,*}"
KAFKA_PORT="${KAFKA_HOST##*:}"
KAFKA_HOST="${KAFKA_HOST%:*}"
show_cmd "open TCP connection to $KAFKA_HOST:$KAFKA_PORT"
if timeout 5 bash -c "exec 3<>/dev/tcp/$KAFKA_HOST/$KAFKA_PORT" 2>/dev/null; then
  pass "Kafka broker reachable at $KAFKA_HOST:$KAFKA_PORT (Linux Docker)"
else
  fail "cannot reach Kafka at $KAFKA_HOST:$KAFKA_PORT"
fi
pause

# ── Stage 2: no token ────────────────────────────────────────────────────────
stage "Security - no token, no order" "trade-api refuses an order that carries no token."
NO_TOKEN_BODY="{\"accountId\":$ACCOUNT_ID,\"symbol\":\"$SYMBOL\",\"side\":\"BUY\",\"quantity\":1,\"price\":150.00,\"idempotencyKey\":\"no-token-$(date +%s)\"}"
show_cmd "curl -X POST $TRADE_API/api/v1/orders -d '$NO_TOKEN_BODY'"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$TRADE_API/api/v1/orders" \
  -H "Content-Type: application/json" -d "$NO_TOKEN_BODY")
[[ "$CODE" == "401" ]] || fail "expected 401 with no token, got $CODE"
pass "rejected with HTTP 401 Unauthorized"
pause

# ── Stage 3: real token ──────────────────────────────────────────────────────
# A user is registered first and an account is opened for them afterwards, so
# a brand-new user is refused at login until they own one. The order below is
# placed as the seeded holder of account $ACCOUNT_ID instead.
stage "Login - a real token from auth-service" "Register a new user (no account yet, so no login), then log in as the holder of account $ACCOUNT_ID."
EMAIL="demo.$(date +%s).$RANDOM@example.com"
# B23: the trading UI and the admin console send this digest in place of the
# password, and the auth service bcrypts whatever arrives, so a script has to
# send the same: sha256("ferodha-v1:" + lower-case email + ":" + password).
password_digest() {
    local input
    input="ferodha-v1:$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]'):$2"
    if command -v sha256sum >/dev/null 2>&1; then
        printf '%s' "$input" | sha256sum | cut -d' ' -f1
    elif command -v shasum >/dev/null 2>&1; then
        printf '%s' "$input" | shasum -a 256 | cut -d' ' -f1
    else
        printf '%s' "$input" | openssl dgst -sha256 -r | cut -d' ' -f1
    fi
}

PASSWORD="windows-demo-password-123"
REGISTER_BODY="{\"name\":\"Windows Demo\",\"username\":\"$EMAIL\",\"password\":\"$(password_digest "$EMAIL" "$PASSWORD")\"}"
show_cmd "curl -X POST $AUTH/auth/register -d '$REGISTER_BODY'"
REGISTER_RESPONSE=$(curl -s -w $'\n%{http_code}' -X POST "$AUTH/auth/register" \
  -H "Content-Type: application/json" -d "$REGISTER_BODY")
REGISTER_CODE="${REGISTER_RESPONSE##*$'\n'}"
[[ "$REGISTER_CODE" == "201" ]] || fail "register returned $REGISTER_CODE (expected 201): ${REGISTER_RESPONSE%$'\n'*}"
pass "registered $EMAIL (HTTP 201)"
show_json "${REGISTER_RESPONSE%$'\n'*}"

NEW_USER_CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$AUTH/auth/login" \
  -H "Content-Type: application/json" -d "{\"username\":\"$EMAIL\",\"password\":\"$(password_digest "$EMAIL" "$PASSWORD")\"}")
[[ "$NEW_USER_CODE" == "401" ]] || fail "new user without an account got $NEW_USER_CODE at login (expected 401)"
pass "the new user has no trading account yet, so login answers 401"
echo ""

# The seeded holder of account 1 (database/seeds/001_seed_data.sql).
SEED_EMAIL="${SEED_EMAIL:-john.carter@example.com}"
SEED_PASSWORD="${SEED_PASSWORD:-seed-password-change-me}"
LOGIN_BODY="{\"username\":\"$SEED_EMAIL\",\"password\":\"$(password_digest "$SEED_EMAIL" "$SEED_PASSWORD")\"}"
show_cmd "curl -X POST $AUTH/auth/login -d '$LOGIN_BODY'"
LOGIN_RESPONSE=$(curl -s -X POST "$AUTH/auth/login" -H "Content-Type: application/json" -d "$LOGIN_BODY")
TOKEN=$(json_field accessToken "$LOGIN_RESPONSE")
[[ -n "$TOKEN" ]] || fail "no token for $SEED_EMAIL. A database from before the seed password, or before trade-api's Liquibase 012 re-hashed it for browser-side digests, needs a reset: see windows/windows-setup.md (Troubleshooting). Response: $LOGIN_RESPONSE"
pass "logged in - got an access token (${#TOKEN} chars)"
info "decoded token header:  $(jwt_part "${TOKEN%%.*}")"
PAYLOAD_SEG="${TOKEN#*.}"; PAYLOAD_SEG="${PAYLOAD_SEG%%.*}"
info "decoded token claims:"
show_json "$(jwt_part "$PAYLOAD_SEG")"
info "iss=auth-service and accountId are what trade-api checks before accepting an order."
pause

# ── Stage 4: place the order ─────────────────────────────────────────────────
stage "Place an order with that token" "trade-api verifies the token, stores the order as NEW, and publishes ORDER_PLACED to Kafka."
show_cmd "curl -H 'Authorization: Bearer $TOKEN' $TRADE_API/api/v1/accounts/$ACCOUNT_ID/balance"
BALANCE_BEFORE=$(curl -s -H "Authorization: Bearer $TOKEN" "$TRADE_API/api/v1/accounts/$ACCOUNT_ID/balance")
info "cash before the order:"
show_json "$BALANCE_BEFORE"
echo ""

IDEMPOTENCY_KEY="windows-demo-$(date +%s)-$$"
ORDER_BODY="{\"accountId\":$ACCOUNT_ID,\"symbol\":\"$SYMBOL\",\"side\":\"BUY\",\"quantity\":1,\"price\":150.00,\"idempotencyKey\":\"$IDEMPOTENCY_KEY\"}"
show_cmd "curl -X POST -H 'Authorization: Bearer $TOKEN' $TRADE_API/api/v1/orders -d '$ORDER_BODY'"
ORDER_RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" -X POST "$TRADE_API/api/v1/orders" \
  -H "Content-Type: application/json" -d "$ORDER_BODY")
show_json "$ORDER_RESPONSE"
ORDER_ID=$(json_field orderId "$ORDER_RESPONSE")
ORDER_STATUS=$(json_field status "$ORDER_RESPONSE")
[[ -n "$ORDER_ID" && "$ORDER_STATUS" == "NEW" ]] || fail "order was not accepted at NEW"
pass "order $ORDER_ID accepted - status NEW"
info "trade-api has answered already; execution happens asynchronously, via Kafka."
pause

# ── Stage 5: Kafka round trip ────────────────────────────────────────────────
stage "Kafka round trip - Windows → Linux → Windows" "trade-executor, on Windows, reads ORDER_PLACED back off the Linux broker."
printf '%s' "${YELLOW}  ➜ watching $EXECUTOR_LOG for $ORDER_ID ${RESET}"
RECEIVED=""
for _ in $(seq 1 30); do
  if [[ -f "$EXECUTOR_LOG" ]] && grep -q "Received ORDER_PLACED.*$ORDER_ID" "$EXECUTOR_LOG"; then
    RECEIVED="yes"; break
  fi
  spinner_tick; sleep 1
done
echo ""
if [[ -z "$RECEIVED" ]]; then
  fail "trade-executor never logged ORDER_PLACED for $ORDER_ID within 30s. trade-api -> Kafka or Kafka -> trade-executor is broken. Check $LOG_DIR/*.log"
fi
pass "trade-executor consumed ORDER_PLACED from the Linux broker"
info "the ORDER_PLACED event exactly as trade-executor received it from Kafka:"
PAYLOAD_JSON=$(grep "Received ORDER_PLACED.*$ORDER_ID" "$EXECUTOR_LOG" | tail -1 | sed 's/^.*Received ORDER_PLACED: //')
show_json "$PAYLOAD_JSON"
[[ -n "${KAFKA_UI_URL:-}" ]] && info "also visible in Kafka UI: ${KAFKA_UI_URL} → Topics → orders → Messages"
pause

# ── Stage 6: settlement ──────────────────────────────────────────────────────
stage "Execution - trade-executor settles the order" "It prices the order, updates Postgres and publishes the outcome to 'trade-events'."
printf '%s' "${YELLOW}  ➜ polling order history until the status leaves NEW ${RESET}"
FINAL_STATUS="NEW"
ENTRY=""
for _ in $(seq 1 30); do
  HISTORY=$(curl -s -H "Authorization: Bearer $TOKEN" "$TRADE_API/api/v1/accounts/$ACCOUNT_ID/orders")
  # Isolate this order's object, then its status.
  ENTRY=$(tr '{' '\n' <<<"$HISTORY" | grep "\"orderId\":\"$ORDER_ID\"" || true)
  FINAL_STATUS=$(json_field status "$ENTRY")
  [[ -n "$FINAL_STATUS" && "$FINAL_STATUS" != "NEW" ]] && break
  spinner_tick; sleep 2
done
echo ""
case "$FINAL_STATUS" in
  FILLED|PARTIALLY_FILLED)
    pass "order settled -> ${BOLD}$FINAL_STATUS${RESET}" ;;
  REJECTED)
    pass "order settled -> ${BOLD}REJECTED${RESET}"
    info "Expected without FAUXNANCE_API_URL/KEY: no live price, so PRICE_UNAVAILABLE."
    info "The Kafka round trip is the point here; add a Fauxnance key to see FILLED." ;;
  NEW)
    fail "order still NEW after 60s - trade-executor received it but never settled it. See $EXECUTOR_LOG" ;;
  *)
    fail "could not read this order's status from order history: $HISTORY" ;;
esac
[[ -n "${KAFKA_UI_URL:-}" ]] && info "the outcome event is in Kafka UI: ${KAFKA_UI_URL} → Topics → trade-events → Messages"
pause

# ── Stage 7: show the result ─────────────────────────────────────────────────
stage "The result, through trade-api" "Order history, cash before/after, and positions for account $ACCOUNT_ID."
info "order (from GET /api/v1/accounts/$ACCOUNT_ID/orders):"
# ENTRY is this order's fields up to its closing brace (entries are flat).
show_json "{${ENTRY%%\}*}}"
echo ""
BALANCE_AFTER=$(curl -s -H "Authorization: Bearer $TOKEN" "$TRADE_API/api/v1/accounts/$ACCOUNT_ID/balance")
info "cash before:  $(json_field cashBalance "$BALANCE_BEFORE") $(json_field currency "$BALANCE_BEFORE")"
info "cash after:   $(json_field cashBalance "$BALANCE_AFTER") $(json_field currency "$BALANCE_AFTER")"
echo ""
info "positions (GET /api/v1/accounts/$ACCOUNT_ID/positions):"
show_json "$(curl -s -H "Authorization: Bearer $TOKEN" "$TRADE_API/api/v1/accounts/$ACCOUNT_ID/positions")"
pause

# ── Stage 8: Postgres ────────────────────────────────────────────────────────
stage "Proof in the database" "The same order and account, read straight from PostgreSQL."
if [[ -z "$PSQL" ]]; then
  info "SKIP: psql not found (set PSQL_BIN_DIR in windows/.env.windows)"
else
  # trade-api shows ids as "ORD-<uuid>"; the orders.order_id column is the bare UUID.
  ORDER_UUID="${ORDER_ID#ORD-}"
  SQL_ORDER="SELECT order_id, status, rejection_reason, executed_price FROM orders WHERE order_id = '$ORDER_UUID';"
  SQL_CASH="SELECT id, cash_balance FROM accounts WHERE id = $ACCOUNT_ID;"
  show_cmd "psql -c \"$SQL_ORDER\""
  run_sql "$SQL_ORDER"
  show_cmd "psql -c \"$SQL_CASH\""
  run_sql "$SQL_CASH"
fi

echo ""
echo "${GREEN}${BOLD}══════════════════════════════════════════════════════════════════════${RESET}"
echo "${GREEN}${BOLD}  ALL STAGES PASSED${RESET}"
echo "${GREEN}${BOLD}══════════════════════════════════════════════════════════════════════${RESET}"
echo "   token      auth-service (Windows) → trade-api (Windows)"
echo "   order      $ORDER_ID  ->  $FINAL_STATUS"
echo "   events     orders + trade-events on Kafka ($KAFKA_HOST:$KAFKA_PORT, Linux)"
echo ""
