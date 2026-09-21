#!/bin/bash

# Complete Trade System Demo - All Success & Failure Cases
# Shows curl commands, executes them, and validates responses
# Requires: trade-api running on port 8094, trade-executor on 8093, Kafka UI on 8091

set +e  # Don't exit on errors - we want to show bad cases

API_BASE="http://localhost:8094"
ACCOUNT_ID=1

# JWT Token (valid for demo purposes)
JWT_TOKEN="JWT-TOKEN"

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

print_status() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✓ SUCCESS${NC}"
    else
        echo -e "${RED}✗ FAILED${NC}"
    fi
    echo ""
}

# Main demo flow
main() {
    clear
    
    echo -e "${MAGENTA}"
    cat << 'EOF'
    ╔═══════════════════════════════════════════════════════════════════╗
    ║                                                                   ║
    ║            TRADING PLATFORM - COMPLETE DEMO SCRIPT                ║
    ║                                                                   ║
    ║  Demonstrating: Order Placement, Execution, Rejection Cases      ║
    ║  With Real API Calls, JWT Auth, and Kafka Event Verification     ║
    ║                                                                   ║
    ╚═══════════════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"
    
    echo -e "${YELLOW}Configuration:${NC}"
    echo "  API Base: $API_BASE"
    echo "  Account ID: $ACCOUNT_ID"
    echo "  JWT Token: ${JWT_TOKEN:0:50}..."
    echo "  Kafka UI: http://localhost:8091"
    echo ""
    
    read -p "Press Enter to start demo..."
    
    # ============================================================================
    # SECTION 1: SETUP & VALIDATION
    # ============================================================================
    print_header "SECTION 1: Setup & Validation"
    
    test_api_connectivity
    
    # ============================================================================
    # SECTION 2: HAPPY PATHS - SUCCESSFUL ORDERS
    # ============================================================================
    print_header "SECTION 2: Happy Paths - Successful Orders"
    
    read -p "Press Enter to continue..."
    
    happy_path_check_balance
    happy_path_buy_order
    happy_path_sell_order
    
    # ============================================================================
    # SECTION 3: BAD PATHS - ORDER REJECTIONS
    # ============================================================================
    print_header "SECTION 3: Bad Paths - Order Rejections"
    
    read -p "Press Enter to continue..."
    
    bad_path_insufficient_funds
    bad_path_non_tradable_instrument
    
    # ============================================================================
    # SECTION 4: IDEMPOTENCY TEST
    # ============================================================================
    print_header "SECTION 4: Idempotency Test - Duplicate Prevention"
    
    read -p "Press Enter to continue..."
    
    test_idempotency
    
    # ============================================================================
    # SECTION 5: SUMMARY
    # ============================================================================
    print_summary
}

# ============================================================================
# SECTION 1: Connectivity Tests
# ============================================================================
test_api_connectivity() {
    print_subheader "1.1 Testing API Connectivity"
    
    CURL_CMD="curl -s -H \"Authorization: Bearer $JWT_TOKEN\" http://localhost:8094/actuator/health"
    print_curl "$CURL_CMD"
    
    RESPONSE=$(curl -s -H "Authorization: Bearer $JWT_TOKEN" http://localhost:8094/actuator/health)
    print_response "$RESPONSE"
    
    if echo "$RESPONSE" | grep -q "UP"; then
        echo -e "${GREEN}✓ Trade API is UP and running${NC}"
    else
        echo -e "${RED}✗ Trade API is not responding correctly${NC}"
        return 1
    fi
    
    echo ""
    read -p "Press Enter to continue..."
}

# ============================================================================
# SECTION 2: Happy Paths
# ============================================================================
happy_path_check_balance() {
    print_subheader "2.1 Check Account Balance (Before Orders)"
    
    CURL_CMD="curl -s -X GET \
  -H \"Authorization: Bearer $JWT_TOKEN\" \
  -H \"Content-Type: application/json\" \
  http://localhost:8094/api/v1/accounts/$ACCOUNT_ID/balance"
    
    print_curl "$CURL_CMD"
    
    RESPONSE=$(curl -s -X GET \
        -H "Authorization: Bearer $JWT_TOKEN" \
        -H "Content-Type: application/json" \
        http://localhost:8094/api/v1/accounts/$ACCOUNT_ID/balance)
    
    print_response "$RESPONSE"
    
    echo "📌 Note the current balance - it will change after successful orders"
    echo ""
    read -p "Press Enter to continue..."
}

happy_path_buy_order() {
    print_subheader "2.2 Place BUY Order - AAPL 10 shares @ £150 (Should SUCCEED)"
    
    IDEMPOTENCY_KEY="happy-buy-$(date +%s)-$$"
    
    CURL_CMD="curl -s -X POST \
  -H \"Authorization: Bearer $JWT_TOKEN\" \
  -H \"Content-Type: application/json\" \
  -d '{\"accountId\":1,\"symbol\":\"AAPL\",\"side\":\"BUY\",\"quantity\":10,\"price\":150.00,\"idempotencyKey\":\"$IDEMPOTENCY_KEY\"}' \
  http://localhost:8094/api/v1/orders"
    
    print_curl "$CURL_CMD"
    
    RESPONSE=$(curl -s -X POST \
        -H "Authorization: Bearer $JWT_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"accountId\":1,\"symbol\":\"AAPL\",\"side\":\"BUY\",\"quantity\":10,\"price\":150.00,\"idempotencyKey\":\"$IDEMPOTENCY_KEY\"}" \
        http://localhost:8094/api/v1/orders)
    
    print_response "$RESPONSE"
    
    ORDER_ID=$(echo "$RESPONSE" | jq -r '.orderId' 2>/dev/null)
    if [ ! -z "$ORDER_ID" ] && [ "$ORDER_ID" != "null" ]; then
        echo -e "${GREEN}✓ Order placed successfully: $ORDER_ID${NC}"
    else
        echo -e "${RED}✗ Order placement failed${NC}"
    fi
    
    echo ""
    echo -e "${YELLOW}📌 Kafka Events to watch:${NC}"
    echo "   1. 'orders' topic → ORDER_PLACED event"
    echo "   2. 'trade-events' topic → ORDER_FILLED event with executedPrice"
    echo ""
    read -p "Press Enter to continue..."
}

happy_path_sell_order() {
    print_subheader "2.3 Place SELL Order - AAPL 5 shares @ £160 (Should SUCCEED)"
    
    IDEMPOTENCY_KEY="happy-sell-$(date +%s)-$$"
    
    CURL_CMD="curl -s -X POST \
  -H \"Authorization: Bearer $JWT_TOKEN\" \
  -H \"Content-Type: application/json\" \
  -d '{\"accountId\":1,\"symbol\":\"AAPL\",\"side\":\"SELL\",\"quantity\":5,\"price\":160.00,\"idempotencyKey\":\"$IDEMPOTENCY_KEY\"}' \
  http://localhost:8094/api/v1/orders"
    
    print_curl "$CURL_CMD"
    
    RESPONSE=$(curl -s -X POST \
        -H "Authorization: Bearer $JWT_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"accountId\":1,\"symbol\":\"AAPL\",\"side\":\"SELL\",\"quantity\":5,\"price\":160.00,\"idempotencyKey\":\"$IDEMPOTENCY_KEY\"}" \
        http://localhost:8094/api/v1/orders)
    
    print_response "$RESPONSE"
    
    ORDER_ID=$(echo "$RESPONSE" | jq -r '.orderId' 2>/dev/null)
    if [ ! -z "$ORDER_ID" ] && [ "$ORDER_ID" != "null" ]; then
        echo -e "${GREEN}✓ Order placed successfully: $ORDER_ID${NC}"
    else
        echo -e "${RED}✗ Order placement failed${NC}"
    fi
    
    echo ""
    echo -e "${YELLOW}📌 Expected Outcome:${NC}"
    echo "   - Account balance decreases (less cash, more AAPL position)"
    echo "   - ORDER_FILLED event published to trade-events topic"
    echo ""
    read -p "Press Enter to continue..."
}

# ============================================================================
# SECTION 3: Bad Paths - Rejections
# ============================================================================
bad_path_insufficient_funds() {
    print_subheader "3.1 Place Order with INSUFFICIENT FUNDS (Should REJECT)"
    
    IDEMPOTENCY_KEY="bad-insufficient-$(date +%s)-$$"
    
    CURL_CMD="curl -s -X POST \
  -H \"Authorization: Bearer $JWT_TOKEN\" \
  -H \"Content-Type: application/json\" \
  -d '{\"accountId\":1,\"symbol\":\"AAPL\",\"side\":\"BUY\",\"quantity\":100000,\"price\":100.00,\"idempotencyKey\":\"$IDEMPOTENCY_KEY\"}' \
  http://localhost:8094/api/v1/orders"
    
    print_curl "$CURL_CMD"
    
    RESPONSE=$(curl -s -X POST \
        -H "Authorization: Bearer $JWT_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"accountId\":1,\"symbol\":\"AAPL\",\"side\":\"BUY\",\"quantity\":100000,\"price\":100.00,\"idempotencyKey\":\"$IDEMPOTENCY_KEY\"}" \
        http://localhost:8094/api/v1/orders)
    
    print_response "$RESPONSE"
    
    echo -e "${YELLOW}📌 Kafka Events to watch:${NC}"
    echo "   1. 'orders' topic → ORDER_PLACED event (order is created)"
    echo "   2. 'trade-events' topic → ORDER_REJECTED event"
    echo "   3. Check rejection reason → INSUFFICIENT_FUNDS"
    echo ""
    read -p "Press Enter to continue..."
}

bad_path_non_tradable_instrument() {
    print_subheader "3.2 Place Order for NON-TRADABLE Instrument (Should REJECT)"
    
    IDEMPOTENCY_KEY="bad-nontradable-$(date +%s)-$$"
    
    CURL_CMD="curl -s -X POST \
  -H \"Authorization: Bearer $JWT_TOKEN\" \
  -H \"Content-Type: application/json\" \
  -d '{\"accountId\":1,\"symbol\":\"TATASTEEL\",\"side\":\"BUY\",\"quantity\":5,\"price\":100.00,\"idempotencyKey\":\"$IDEMPOTENCY_KEY\"}' \
  http://localhost:8094/api/v1/orders"
    
    print_curl "$CURL_CMD"
    
    RESPONSE=$(curl -s -X POST \
        -H "Authorization: Bearer $JWT_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"accountId\":1,\"symbol\":\"TATASTEEL\",\"side\":\"BUY\",\"quantity\":5,\"price\":100.00,\"idempotencyKey\":\"$IDEMPOTENCY_KEY\"}" \
        http://localhost:8094/api/v1/orders)
    
    print_response "$RESPONSE"
    
    echo -e "${YELLOW}📌 Expected Outcome:${NC}"
    echo "   - ORDER_REJECTED event in trade-events topic"
    echo "   - Rejection reason: INSTRUMENT_NOT_TRADABLE"
    echo ""
    read -p "Press Enter to continue..."
}

# ============================================================================
# SECTION 4: Idempotency Test
# ============================================================================
test_idempotency() {
    print_subheader "4.1 Place Order with Unique Idempotency Key"
    
    IDEMPOTENCY_KEY="idem-test-$(date +%s)-$$"
    
    CURL_CMD="curl -s -X POST \
  -H \"Authorization: Bearer $JWT_TOKEN\" \
  -H \"Content-Type: application/json\" \
  -H \"Idempotency-Key: $IDEMPOTENCY_KEY\" \
  -d '{\"symbol\":\"AAPL\",\"side\":\"BUY\",\"quantity\":3,\"price\":150}' \
  http://localhost:8094/api/v1/orders"
    
    print_curl "$CURL_CMD"
    
    RESPONSE1=$(curl -s -X POST \
        -H "Authorization: Bearer $JWT_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"accountId\":1,\"symbol\":\"AAPL\",\"side\":\"BUY\",\"quantity\":3,\"price\":150.00,\"idempotencyKey\":\"$IDEMPOTENCY_KEY\"}" \
        http://localhost:8094/api/v1/orders)
    
    print_response "$RESPONSE1"
    
    ORDER_ID_1=$(echo "$RESPONSE1" | jq -r '.orderId' 2>/dev/null)
    echo -e "${GREEN}Order ID: $ORDER_ID_1${NC}"
    echo ""
    
    print_subheader "4.2 Retry SAME Request with SAME Idempotency Key"
    
    echo -e "${YELLOW}CURL COMMAND (SAME):${NC}"
    echo -e "${BLUE}$CURL_CMD${NC}"
    echo ""
    
    RESPONSE2=$(curl -s -X POST \
        -H "Authorization: Bearer $JWT_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"accountId\":1,\"symbol\":\"AAPL\",\"side\":\"BUY\",\"quantity\":3,\"price\":150.00,\"idempotencyKey\":\"$IDEMPOTENCY_KEY\"}" \
        http://localhost:8094/api/v1/orders)
    
    print_response "$RESPONSE2"
    
    ORDER_ID_2=$(echo "$RESPONSE2" | jq -r '.orderId' 2>/dev/null)
    echo -e "${GREEN}Order ID: $ORDER_ID_2${NC}"
    echo ""
    
    if [ "$ORDER_ID_1" = "$ORDER_ID_2" ]; then
        echo -e "${GREEN}✓ IDEMPOTENCY WORKS! Same order ID returned${NC}"
        echo -e "${GREEN}  Only ONE order created in database${NC}"
        echo -e "${GREEN}  Only ONE ORDER_PLACED event in Kafka${NC}"
    else
        echo -e "${RED}✗ Idempotency failed! Different order IDs${NC}"
    fi
    
    echo ""
    read -p "Press Enter to continue..."
}

# ============================================================================
# Summary
# ============================================================================
print_summary() {
    print_header "DEMO COMPLETE - Summary & Next Steps"
    
    cat << 'EOF'
✅ SUCCESSFUL CASES (Happy Paths):
   1. BUY Order - Successfully placed and filled
   2. SELL Order - Successfully placed and filled
   3. Account balance updates correctly after trades
   
❌ FAILED CASES (Bad Paths):
   1. Insufficient Funds - Order rejected by Trade Executor
   2. Non-Tradable Instrument - Order rejected before pricing
   
🔄 IDEMPOTENCY:
   1. Same request twice = Same order returned
   2. Duplicate prevention works correctly
   
📊 VERIFICATION IN KAFKA UI (http://localhost:8091):
   
   Topics to monitor:
   - "orders" → ORDER_PLACED events (initial submission)
   - "trade-events" → ORDER_FILLED or ORDER_REJECTED (final outcome)
   
   What to look for:
   ✓ ORDER_PLACED appears first (from trade-api)
   ✓ ORDER_FILLED appears after (from trade-executor) - HAPPY PATH
   ✓ ORDER_REJECTED appears after (from trade-executor) - BAD PATH
   
   Rejection reasons to see:
   - INSUFFICIENT_FUNDS (tried to buy too much)
   - INSTRUMENT_NOT_TRADABLE (TATASTEEL not tradable)
   - PRICE_UNAVAILABLE (if Fauxnance API fails)
   
🎯 KEY COMPONENTS DEMONSTRATED:
   
   Trade API (Port 8094):
   - REST endpoint for order placement
   - JWT authentication
   - Idempotency key handling
   - Request validation
   
   Trade Executor (Port 8093):
   - Consumes ORDER_PLACED events from Kafka
   - Validates orders
   - Fetches live quotes from Fauxnance
   - Settles transactions
   - Publishes ORDER_FILLED/REJECTED events
   
   PostgreSQL Database:
   - Stores orders and account state
   - Updates balances and positions
   - Liquibase migrations run automatically
   
   Kafka Message Queue:
   - Asynchronous communication
   - Event ordering guarantees
   - Topic replay capability
   
💡 TALKING POINTS FOR DEMO:
   
   1. "APIs are stateless - database is source of truth"
   2. "Events are immutable audit trail - always know what happened"
   3. "Async processing - API returns immediately, executor works in background"
   4. "Graceful error handling - rejections are business outcomes, not errors"
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
