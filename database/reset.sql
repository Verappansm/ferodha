-- Resets the operational database (tradedb) to empty.
--
-- Drops every object in the public schema: the Sprint 3 tables and types, every
-- Liquibase change (and Liquibase's own DATABASECHANGELOG tables, so the
-- changesets apply again), the auth service's auth_* tables, and the pg_trgm
-- extension. Then recreates an empty public schema.
--
-- Stop trade-api, trade-executor and auth-service first: they hold connections
-- and would recreate tables mid-reset. Afterwards, rebuild in this order:
--   1. migrations/001_initial_schema.sql, then seeds/001_seed_data.sql (or ./apply.sh)
--   2. start trade-api: Liquibase applies changesets 001 to 025
--   3. start auth-service: it creates auth_refresh_tokens and auth_email_otps
--
--   psql -h localhost -U <user> -d tradedb -v ON_ERROR_STOP=1 -f database/reset.sql
--
-- Docker alternative, which also clears Kafka: docker compose down -v

DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO CURRENT_USER;
GRANT USAGE ON SCHEMA public TO PUBLIC;
