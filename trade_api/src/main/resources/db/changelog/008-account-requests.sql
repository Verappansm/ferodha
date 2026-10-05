--liquibase formatted sql

-- Account-opening requests (LEAP-011). A user registers through the auth
-- service, which records a PENDING request here in the same transaction as
-- the Users row. Nothing in Accounts exists until an admin approves the
-- request; approving it opens the Accounts row (trade_api owns that table)
-- and only then can the user log in. The bank account is chosen at approval,
-- because Third_Party_Bank rows reference Users.email and so cannot exist
-- before the user does.

--changeset trade-api:001-account-request-status-enum
CREATE TYPE account_request_status_enum AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
--rollback DROP TYPE account_request_status_enum;

--changeset trade-api:002-account-requests
CREATE TABLE account_requests (
    request_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES Users (user_id) ON DELETE CASCADE,
    currency            VARCHAR(3) NOT NULL DEFAULT 'USD',
    bank_account_number VARCHAR(50) REFERENCES Third_Party_Bank (bank_account_number),
    status              account_request_status_enum NOT NULL DEFAULT 'PENDING',
    reason              VARCHAR(500),
    requested_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    decided_by          UUID REFERENCES Users (user_id),
    decided_at          TIMESTAMPTZ,
    -- A decision carries who made it and when; a pending request has neither.
    CONSTRAINT account_requests_decision_recorded CHECK (
        (status = 'PENDING' AND decided_by IS NULL AND decided_at IS NULL)
        OR (status <> 'PENDING' AND decided_by IS NOT NULL AND decided_at IS NOT NULL)
    )
);
--rollback DROP TABLE account_requests;

-- At most one open request per user, so a double-submitted registration or
-- request form cannot queue two accounts for approval.
--changeset trade-api:003-account-requests-one-pending
CREATE UNIQUE INDEX uq_account_requests_one_pending
    ON account_requests (user_id) WHERE status = 'PENDING';
--rollback DROP INDEX uq_account_requests_one_pending;
