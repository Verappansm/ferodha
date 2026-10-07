# Customer Notifications - Comprehensive Scenarios Document

## Overview

This document catalogs all situations where the platform sends customer notifications, including conditions, examples, and relevant implementation files.

---

## 1. ORDER NOTIFICATIONS (Implemented - Phase 1)

### 1.1 Order Filled

**Trigger**: Trade Executor publishes `ORDER_FILLED` event to `trade-events` Kafka topic

**Conditions**:
- Order status transitions to `FILLED`
- Fill price and quantity captured
- Customer has an active account
- Notification preferences exist (default: IN_APP)

**Example**:
```
Event: ORDER_FILLED
Account: 1 (Priya Menon)
Order: ORD-6f2b1c2a-6a1e-4a4f-9c0d-2f7a1b3c4d5e
Symbol: ACME
Message: "Your order ORD-6f2b1c2a-6a1e-4a4f-9c0d-2f7a1b3c4d5e for ACME has been filled."
Channel: IN_APP (resolved from preferences)
Status: QUEUED → SENT
```

**Implementation Files**:
- `trade_api/src/main/java/com/trade/notification/event/TradeEventNotificationListener.java` - Kafka consumer
- `trade_api/src/main/java/com/trade/notification/service/NotificationService.java` - `recordNotification()` method
- `trade_api/src/main/java/com/trade/notification/controller/NotificationController.java` - `POST /api/v1/notifications/internal/record`
- `trade_api/src/main/resources/db/changelog/016-notifications.sql` - Database schema

**API Endpoint (Internal)**:
```http
POST /api/v1/notifications/internal/record
Content-Type: application/json

{
  "accountId": 1,
  "eventId": "6f2b1c2a-6a1e-4a4f-9c0d-2f7a1b3c4d5e",
  "eventType": "ORDER_FILLED",
  "orderId": "ORD-6f2b1c2a-6a1e-4a4f-9c0d-2f7a1b3c4d5e",
  "symbol": "ACME"
}

Response:
{
  "notificationId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "accountId": 1,
  "eventId": "6f2b1c2a-6a1e-4a4f-9c0d-2f7a1b3c4d5e",
  "eventType": "ORDER_FILLED",
  "orderId": "ORD-6f2b1c2a-6a1e-4a4f-9c0d-2f7a1b3c4d5e",
  "symbol": "ACME",
  "resolvedChannel": "IN_APP",
  "message": "Your order ORD-6f2b1c2a-6a1e-4a4f-9c0d-2f7a1b3c4d5e for ACME has been filled.",
  "status": "QUEUED",
  "createdAt": "2026-10-07T14:30:00Z",
  "updatedAt": "2026-10-07T14:30:00Z"
}
```

**Idempotency**:
- Duplicate `eventId` returns 409 Conflict
- Kafka offset committed on success or 409
- No second notification for replayed events

---

### 1.2 Order Rejected

**Trigger**: Trade Executor publishes `ORDER_REJECTED` event to `trade-events` Kafka topic

**Conditions**:
- Order fails business rule validation (insufficient funds, position, etc.)
- Rejection reason included in event payload
- Status transitions to `REJECTED`
- Customer must be notified immediately (not a silent failure)

**Example**:
```
Event: ORDER_REJECTED
Account: 2 (Rajesh Kumar)
Order: ORD-7a8b9c0d-e1f2-3456-7890-abcd1234ef56
Symbol: TECH
Message: "Your order ORD-7a8b9c0d-e1f2-3456-7890-abcd1234ef56 for TECH has been rejected."
Reason: "Insufficient funds for purchase"
Channel: EMAIL (if customer preference = EMAIL)
Status: QUEUED → SENT
```

**Implementation Files**:
- `trade_api/src/main/java/com/trade/notification/event/TradeEventNotificationListener.java` - handles `ORDER_REJECTED`
- `trade_api/src/main/java/com/trade/notification/service/NotificationService.java` - `generateMessage()` switch case
- `trade_api/src/main/resources/db/changelog/016-notifications.sql` - database persistence

**Design Rationale**: A rejection is as newsworthy as a fill. A customer who only hears about successes has no idea their order failed. This is why rejections trigger the same notification flow as fills.

---

### 1.3 Order Cancelled

**Trigger**: Trade Executor publishes `ORDER_CANCELLED` event to `trade-events` Kafka topic

**Conditions**:
- Customer cancels order via `DELETE /api/v1/orders/{orderId}`
- Order status transitions to `CANCELLED`
- Cancellation is permitted (status = `NEW` or `PARTIALLY_FILLED`)
- Customer initiated (not system-forced)

**Example**:
```
Event: ORDER_CANCELLED
Account: 1 (Priya Menon)
Order: ORD-5e6f7a8b-9cde-f012-3456-789abcdef012
Symbol: ACME
Message: "Your order ORD-5e6f7a8b-9cde-f012-3456-789abcdef012 for ACME has been cancelled."
Channel: IN_APP
Status: QUEUED → SENT
```

**Implementation Files**:
- `trade_api/src/main/java/com/trade/notification/event/TradeEventNotificationListener.java` - handles `ORDER_CANCELLED`
- `trade_api/src/main/java/com/trade/notification/service/NotificationService.java` - `generateMessage()` method

---

## 2. WATCHLIST NOTIFICATIONS (Implemented - Phase 1)

### 2.1 Price Threshold Alert

**Trigger**: Customer sets a watchlist price target; market data crosses threshold

**Conditions**:
- Watchlist feature detects price cross (e.g., target $50, price now $49.99)
- Threshold is breached during market hours
- Customer is active
- Watchlist feature calls notification API

**Example**:
```
Symbol: TECH
Target Price: $50.00
Current Price: $49.99 (crossed down)
Message: "Price has crossed your target of $50. Current: $49.99"
Channel: IN_APP (or EMAIL if preferred)
Status: QUEUED → SENT
```

**API Endpoint (Customer-Facing)**:
```http
POST /api/v1/notifications/watchlist/alert
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "symbol": "TECH",
  "message": "Price has crossed your target of $50. Current: $49.99"
}

Response:
{
  "notificationId": "b2c3d4e5-f6a7-b8c9-d0e1-f2a3b4c5d6e7",
  "accountId": 1,
  "eventId": "e2f3a4b5-c6d7-e8f9-a0b1-c2d3e4f5a6b7",
  "eventType": "ORDER_FILLED",  // Generic type for watchlist alerts
  "symbol": "TECH",
  "resolvedChannel": "IN_APP",
  "message": "Price has crossed your target of $50. Current: $49.99",
  "status": "QUEUED",
  "createdAt": "2026-10-07T15:00:00Z",
  "updatedAt": "2026-10-07T15:00:00Z"
}
```

**Implementation Files**:
- `trade_api/src/main/java/com/trade/notification/controller/NotificationController.java` - `POST /api/v1/notifications/watchlist/alert`
- `trade_api/src/main/java/com/trade/notification/service/NotificationService.java` - `sendWatchlistAlert()` method

**Authorization**:
- Customer can only send alerts for their own account (checked via JWT `accountId` claim)
- Admins may have additional permissions (to be defined)

---

## 3. ACCOUNT REQUEST NOTIFICATIONS (Planned - Phase 2)

### 3.1 Account Request Received

**Trigger**: Customer submits new account opening request via admin console

**Conditions**:
- Request submitted and recorded in `account_requests` table
- Status = `PENDING`
- Email confirmation sent to customer email
- In-app notification created

**Example**:
```
Event: ACCOUNT_REQUEST_RECEIVED
Type: New Trading Account
Status: PENDING_VERIFICATION
Message: "Your account opening request has been received. Please verify your email."
Channel: EMAIL + IN_APP
```

**Affected Files**:
- `trade_api/src/main/java/com/trade/admin/` (account request submission)
- Future: notification service extension for account events
- Database: `account_requests` table (already exists in 008-account-requests.sql)

---

### 3.2 Account Request Approved

**Trigger**: Admin approves account opening request

**Conditions**:
- Admin calls approval endpoint (future: `PATCH /api/v1/admin/account-requests/{requestId}`)
- Status transitions to `ACTIVE`
- Customer account is created or activated
- Confirmation sent immediately

**Example**:
```
Event: ACCOUNT_REQUEST_APPROVED
Message: "Your trading account has been approved and is now active."
Action: "Log in to start trading"
Channel: EMAIL + IN_APP
```

**Affected Files**:
- `trade_api/src/main/java/com/trade/admin/` (approval logic)
- Future: `AccountRequestApprovalNotifier` listener

---

### 3.3 Account Request Rejected

**Trigger**: Admin rejects account opening request with reason

**Conditions**:
- Admin calls rejection endpoint with reason
- Status transitions to `REJECTED`
- Reason recorded on request
- Customer notified with reason

**Example**:
```
Event: ACCOUNT_REQUEST_REJECTED
Reason: "Age requirement not met (must be 18+)"
Message: "Your account opening request has been rejected. Reason: Age requirement not met (must be 18+)"
Action: "Contact support if you have questions"
Channel: EMAIL (primary) + IN_APP
```

**Implementation Note**: The rejection reason must be included in the notification message. This is critical for customer experience—they need to know why they were rejected.

**Affected Files**:
- `trade_api/src/main/java/com/trade/admin/` (rejection logic)
- Future: `AccountRequestRejectionNotifier`

---

## 4. ACCOUNT STATUS NOTIFICATIONS (Planned - Phase 2)

### 4.1 Account Suspended

**Trigger**: Admin suspends account due to risk, compliance, or customer request

**Conditions**:
- Account status transitions from `ACTIVE` to `SUSPENDED`
- Reason recorded (e.g., "Compliance review")
- Customer cannot trade during suspension
- Family/beneficiaries may be notified (future)

**Example**:
```
Event: ACCOUNT_SUSPENDED
Reason: "Account review due to unusual trading activity"
Message: "Your trading account has been temporarily suspended pending review."
Action: "Contact support for more information"
Channel: EMAIL (primary) + IN_APP
Severity: HIGH
```

**Affected Files**:
- `trade_api/src/main/java/com/trade/domain/Account.java` - status enum
- `trade_api/src/main/resources/db/changelog/001-account-status-and-locking.sql` - schema
- Future: Account status change listener

---

### 4.2 Account Reactivated

**Trigger**: Admin or automated process reactivates suspended account

**Conditions**:
- Status transitions from `SUSPENDED` to `ACTIVE`
- Review completed or reason resolved
- Trading resumes immediately

**Example**:
```
Event: ACCOUNT_REACTIVATED
Message: "Your trading account has been reactivated. You can now resume trading."
Channel: EMAIL + IN_APP
```

---

### 4.3 Account Closed

**Trigger**: Admin closes account (customer request or enforcement)

**Conditions**:
- Status transitions to `CLOSED`
- Account cannot be reactivated
- Final balance settlement processed
- Reason recorded

**Example**:
```
Event: ACCOUNT_CLOSED
Reason: "Customer closure request"
Message: "Your trading account has been closed. Your final balance of $2,500 has been transferred to your registered bank account."
Channel: EMAIL (critical) + IN_APP
Action: "View settlement details in your account"
```

---

## 5. PORTFOLIO & DASHBOARD NOTIFICATIONS (Planned - Phase 3)

### 5.1 Significant Portfolio Value Change

**Trigger**: End-of-day portfolio calculation shows >5% change

**Conditions**:
- Portfolio P&L calculated daily at market close
- Change threshold exceeded (configurable: 5%, 10%, etc.)
- Customer has opted into alerts (preference)
- Excludes deposits/withdrawals

**Example**:
```
Event: PORTFOLIO_CHANGE_ALERT
Portfolio Value: $50,000 → $52,500 (+5.0%)
Unrealized P&L: +$2,500
Message: "Your portfolio gained $2,500 (+5.0%) today. Current value: $52,500"
Channel: EMAIL + IN_APP (if subscribed)
```

**Affected Files** (Future):
- `portfolio/PortfolioCalculationService.java` (new listener trigger)
- `notification/service/PortfolioChangeNotifier.java` (new)

---

### 5.2 Significant Position Loss

**Trigger**: Single position loses >20% of value in one day

**Conditions**:
- Intraday P&L tracking enabled
- Loss threshold breached
- Not from customer-initiated sale
- Critical alert (email mandatory)

**Example**:
```
Event: POSITION_LOSS_ALERT
Symbol: RISKY
Previous Value: $10,000
Current Value: $7,800
Loss: -$2,200 (-22.0%)
Message: "ALERT: Your position in RISKY has declined 22% today. Current value: $7,800"
Channel: EMAIL (critical) + IN_APP
Urgency: HIGH
```

---

## 6. PROFILE NOTIFICATIONS (Planned - Phase 2)

### 6.1 Profile Updated

**Trigger**: Customer changes profile information

**Conditions**:
- Name, phone, or other details changed via `PATCH /profile`
- Email address (username) is not editable
- Confirmation sent to verify changes

**Example**:
```
Event: PROFILE_UPDATED
Change: "Name changed from 'Priya M.' to 'Priya Menon'"
Message: "Your profile has been updated."
Channel: IN_APP + optional email confirmation
```

---

### 6.2 Security Event: Password Changed

**Trigger**: Customer changes password via auth service

**Conditions**:
- Password reset initiated and completed
- Sent to customer email for verification
- IP address and timestamp logged

**Example**:
```
Event: PASSWORD_CHANGED
Message: "Your password has been changed. If this wasn't you, contact support immediately."
Action: "Review login activity"
Channel: EMAIL (security) + IN_APP
Severity: MEDIUM
```

---

### 6.3 Security Event: New Login from Unknown Device

**Trigger**: Customer logs in from new device/location (optional)

**Conditions**:
- Geolocation differs significantly from last login
- Device fingerprint is new
- Feature can be disabled in preferences
- One-time PIN verification may be required

**Example**:
```
Event: SUSPICIOUS_LOGIN
Location: "New York, USA (Previously: Mumbai, India)"
Device: "Chrome on Windows"
Time: "2026-10-07 14:30 UTC"
Message: "New login detected from New York. Verify it was you: [Link]"
Channel: EMAIL (security) + IN_APP
Action: "Verify login"
```

**Implementation Note**: This is a security-focused notification. Only send if customer has opted in.

---

## 7. ADMIN NOTIFICATIONS (Planned - Phase 3)

### 7.1 New Account Request (Admin Alert)

**Trigger**: Customer submits account opening request

**Conditions**:
- Request enters system and is assigned to admin queue
- Admin receives notification to review
- Not sent to customer (see 3.1)

**Recipient**: Admin/Compliance team
**Channel**: Internal (email to admin email, not customer email)

**Example**:
```
Event: NEW_ACCOUNT_REQUEST
Requester: "Rajesh Kumar (rajesh@example.com)"
Document Status: "Verification Pending"
Action: "Review in Admin Console"
URL: "http://admin:3001/account-requests/{requestId}"
```

**Affected Files**:
- `trade_api/src/main/java/com/trade/admin/AdminNotifier.java` (future)

---

### 7.2 Service Health Issue

**Trigger**: Monitoring detects service degradation or failure

**Conditions**:
- Service availability drops below 99%
- Database connection pool exhausted
- Kafka producer backlog grows
- Memory usage exceeds threshold
- Critical endpoints respond slowly (>5s)

**Recipients**: Operations/DevOps team
**Channel**: Slack, Email, PagerDuty integration (future)

**Example**:
```
Event: SERVICE_ALERT
Severity: CRITICAL
Service: "Trade API"
Issue: "Database connection pool exhausted (50/50 connections)"
Time: "2026-10-07 14:45:00Z"
Action: "Investigate database load"
Dashboard: "http://monitoring:3000/trade-api"
```

**Affected Files**:
- `trade_api/src/main/resources/application.yml` (monitoring config)
- Future: `SystemHealthService.java` enhancements

---

### 7.3 Unusual Order Activity Detected

**Trigger**: Monitoring detects suspicious trading patterns

**Conditions**:
- Customer places >10 orders in 1 minute
- Order cancellation rate >70% in 1 hour
- Coordinated trades across multiple accounts (suspicious)
- Large order spike for normally quiet account
- Pattern matches known market manipulation tactics

**Recipients**: Compliance/Fraud team
**Channel**: Internal alert (email + dashboard)

**Example**:
```
Event: SUSPICIOUS_TRADING_ACTIVITY
Account: 42 (Mike Chen)
Activity: "342 orders placed in 5 minutes, 89% cancelled"
Pattern: "Possible spoofing"
Recent Orders: "[Show last 10 orders]"
Action: "Review account, consider suspension"
Dashboard: "http://admin:3001/accounts/42/orders"
```

**Implementation Note**: This is a compliance alert. Manual review is required before any customer action.

---

## 8. FUTURE EXTENSIONS

### 8.1 Dividend/Corporate Action Notifications

```
Event: DIVIDEND_PAID
Symbol: TECH
Amount: $100.00 (at $1.25/share for 80 shares)
ExDate: "2026-09-01"
PaymentDate: "2026-09-15"
Message: "You received a dividend payment of $100 for TECH."
```

### 8.2 IPO/Unlock Notifications

```
Event: IPO_AVAILABLE
Symbol: NEWCO
OpeningPrice: $25.00
Message: "New IPO available: NEWCO opening at $25. Reserve your shares?"
```

### 8.3 Margin Call Notifications (if margin trading added)

```
Event: MARGIN_CALL
RequiredMargin: $5,000
CurrentMargin: $3,200
Shortfall: $1,800
DueDate: "2026-10-08"
Message: "Your account requires additional margin of $1,800 by tomorrow."
```

---

## Summary Table

| # | Event | Trigger | Channel | Owner | Phase | File Location |
|---|-------|---------|---------|-------|-------|---|
| 1.1 | ORDER_FILLED | Trade Executor | Email/IN_APP | Customer | 1 | `notification/event/TradeEventNotificationListener.java` |
| 1.2 | ORDER_REJECTED | Trade Executor | Email/IN_APP | Customer | 1 | `notification/event/TradeEventNotificationListener.java` |
| 1.3 | ORDER_CANCELLED | Trade Executor | Email/IN_APP | Customer | 1 | `notification/event/TradeEventNotificationListener.java` |
| 2.1 | WATCHLIST_ALERT | Watchlist feature | Email/IN_APP | Customer | 1 | `notification/controller/NotificationController.java` |
| 3.1 | ACCOUNT_REQUEST_RECEIVED | Admin console | Email/IN_APP | Customer | 2 | `admin/` (future) |
| 3.2 | ACCOUNT_REQUEST_APPROVED | Admin approval | Email/IN_APP | Customer | 2 | `admin/` (future) |
| 3.3 | ACCOUNT_REQUEST_REJECTED | Admin rejection | Email/IN_APP | Customer | 2 | `admin/` (future) |
| 4.1 | ACCOUNT_SUSPENDED | Admin action | Email/IN_APP | Customer | 2 | `domain/Account.java` |
| 4.2 | ACCOUNT_REACTIVATED | Admin action | Email/IN_APP | Customer | 2 | `domain/Account.java` |
| 4.3 | ACCOUNT_CLOSED | Admin action | Email | Customer | 2 | `domain/Account.java` |
| 5.1 | PORTFOLIO_CHANGE_ALERT | EOD calculation | Email/IN_APP | Customer | 3 | `portfolio/` (future) |
| 5.2 | POSITION_LOSS_ALERT | Intraday tracking | Email | Customer | 3 | `portfolio/` (future) |
| 6.1 | PROFILE_UPDATED | Customer action | IN_APP | Customer | 2 | `auth/` (future) |
| 6.2 | PASSWORD_CHANGED | Customer action | Email | Customer | 2 | `auth/` (future) |
| 6.3 | SUSPICIOUS_LOGIN | Auth system | Email | Customer | 3 | `auth/` (future) |
| 7.1 | NEW_ACCOUNT_REQUEST | Customer action | Internal | Admin | 3 | `admin/` (future) |
| 7.2 | SERVICE_ALERT | Monitoring | Internal | DevOps | 3 | `monitoring/` (future) |
| 7.3 | UNUSUAL_ORDER_ACTIVITY | Pattern detection | Internal | Compliance | 3 | `admin/` (future) |

---

## Testing

Unit tests for Phase 1 notifications:

```
trade_api/src/test/java/com/trade/notification/
├── service/
│   ├── NotificationServiceTest
│   └── NotificationPreferenceServiceTest
├── controller/
│   ├── NotificationControllerTest
│   └── NotificationPreferenceControllerTest
├── event/
│   └── TradeEventNotificationListenerTest
└── domain/
    └── NotificationRepositoryImplTest
```

**Test Coverage**:
- Notification recording with idempotency
- Channel resolution from preferences
- Authorization (owner-only access)
- Kafka consumer event mapping
- Pagination limits and offsets
- Error handling and retry logic

---

## Configuration

**Application Properties** (`application.yml`):

```yaml
kafka:
  topics:
    trade-events: trade-events
    orders: orders

notification:
  group-id: notification-consumer
  listen: true
  channels:
    email:
      enabled: true
      provider: sendgrid  # or: stub (logs only)
    in-app:
      enabled: true

# Async sender configuration (Phase 2)
notification-sender:
  batch-size: 50
  max-retries: 3
  retry-delay-ms: 5000
```

---

## Delivery Status Lifecycle

```
QUEUED   → Awaiting delivery
  ├→ SENT   → Successfully delivered (terminal state)
  ├→ FAILED → Delivery failed (eligible for retry)
  └→ RETRYING → Retry in progress
     ├→ SENT
     └→ FAILED
```

No retry occurs after reaching `SENT` or permanent `FAILED` (after max retries).

---

## Compliance & GDPR

- Notifications include customer name (resolved from JWT)
- Historical data retained per data retention policy (default: 90 days)
- Customer can request deletion of notification history
- Email opt-out handled via preferences (customer sets to IN_APP only)
- Phone numbers used for SMS (if/when SMS channel added) must be verified

---

## References

- **Spec**: `design/notifications-api.yaml`, `design/notification-preferences-api.yaml`
- **Kafka**: `design/kafka.md`
- **Trade Events**: Trade Executor publishes to `trade-events` topic
- **Module README**: `trade_api/src/main/java/com/trade/notification/README.md`
