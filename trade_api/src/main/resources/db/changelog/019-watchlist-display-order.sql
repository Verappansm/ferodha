--liquibase formatted sql

-- The watchlist screens order lists and items by display_order. That column was
-- added to the base schema (database/migrations/001) after some databases had
-- already been created from it, and the Windows script and Docker only apply
-- the base schema to a database that does not exist yet. A database created
-- before then has no display_order, and every watchlist query on it fails with
-- a 500. This brings any database up to date, and does nothing on one that
-- already has the columns.

--changeset trade-api:001-watchlist-display-order
ALTER TABLE Watchlist ADD COLUMN IF NOT EXISTS display_order INT NOT NULL DEFAULT 0;
ALTER TABLE Watchlist_Items ADD COLUMN IF NOT EXISTS display_order INT NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_watchlist_user_display ON Watchlist (user_id, display_order);
CREATE INDEX IF NOT EXISTS idx_watchlist_items_display ON Watchlist_Items (watchlist_id, display_order);
--rollback DROP INDEX IF EXISTS idx_watchlist_items_display;
--rollback DROP INDEX IF EXISTS idx_watchlist_user_display;
--rollback ALTER TABLE Watchlist_Items DROP COLUMN IF EXISTS display_order;
--rollback ALTER TABLE Watchlist DROP COLUMN IF EXISTS display_order;
