--liquibase formatted sql

-- Customer preferences (LEAP-010). One row per account, and only once the
-- customer has changed something: a customer on defaults has no row at all.
-- Every setting column is nullable on purpose - NULL means "not set", and
-- the service merges it with PreferenceDefaults on read, so a saved value
-- overrides only that one setting and a later change to a default reaches
-- everyone who never chose otherwise.
--
-- The email behind the EMAIL channel is not stored here. It already lives
-- on Users, which stays its one owner; this module reads it when needed.

--changeset trade-api:001-customer-preferences
CREATE TABLE pref_customer_preference (
    account_id            BIGINT      PRIMARY KEY REFERENCES Accounts (id) ON DELETE CASCADE,
    -- the account applied at sign-in; always one the same user owns
    default_account_id    BIGINT      NOT NULL REFERENCES Accounts (id),
    notification_channel  VARCHAR(10) CHECK (notification_channel IN ('IN_APP', 'EMAIL')),
    notify_order_filled   BOOLEAN,
    notify_order_rejected BOOLEAN,
    notify_order_cancelled BOOLEAN,
    notify_price_alerts   BOOLEAN,
    theme                 VARCHAR(5)  CHECK (theme IN ('LIGHT', 'DARK')),
    number_format         VARCHAR(13) CHECK (number_format IN ('INDIAN', 'INTERNATIONAL')),
    compact_tables        BOOLEAN,
    hide_balances         BOOLEAN,
    start_page            VARCHAR(9)  CHECK (start_page IN ('DASHBOARD', 'PORTFOLIO', 'WATCHLIST', 'ORDERS')),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
--rollback DROP TABLE pref_customer_preference;
