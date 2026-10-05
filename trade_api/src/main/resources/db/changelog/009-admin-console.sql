--liquibase formatted sql

-- What the operations console needs (LEAP-011, LEAP-021 to LEAP-023;
-- design/admin-trade-api.yaml and design/admin-auth-api.yaml).

-- Every admin decision, written in the same transaction as the change it
-- records. Append-only: the application never updates or deletes a row. The
-- auth service writes its user decisions here too, so one log covers both.
--changeset trade-api:001-admin-audit
CREATE TABLE admin_audit (
    id          BIGSERIAL PRIMARY KEY,
    actor_id    UUID NOT NULL REFERENCES Users (user_id),
    action      VARCHAR(64) NOT NULL,
    target_type VARCHAR(32) NOT NULL
        CHECK (target_type IN ('ACCOUNT_REQUEST', 'ACCOUNT', 'USER', 'INSTRUMENT')),
    target_id   VARCHAR(64) NOT NULL,
    reason      VARCHAR(500),
    at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_admin_audit_at ON admin_audit (at DESC);
--rollback DROP TABLE admin_audit;

-- Who last listed or delisted an instrument, and when.
--changeset trade-api:002-instruments-tradable-changed
ALTER TABLE Instruments
    ADD COLUMN tradable_changed_by UUID REFERENCES Users (user_id),
    ADD COLUMN tradable_changed_at TIMESTAMPTZ;
--rollback ALTER TABLE Instruments DROP COLUMN tradable_changed_by, DROP COLUMN tradable_changed_at;

-- The account an approval opened, so a decided request can point at it.
--changeset trade-api:003-account-requests-opened-account
ALTER TABLE account_requests
    ADD COLUMN opened_account_id BIGINT REFERENCES Accounts (id);
--rollback ALTER TABLE account_requests DROP COLUMN opened_account_id;

-- Set by an administrator's forced reset; the auth service reads it.
--changeset trade-api:004-users-must-change-password
ALTER TABLE Users ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT false;
--rollback ALTER TABLE Users DROP COLUMN must_change_password;
