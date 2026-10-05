--liquibase formatted sql

-- Sprint 5's Instrument.delist() needs a persisted flag; 001_initial_schema.sql
-- has no way to record it. Delisting is deliberately a flag rather than a
-- deleted row, because Orders.instrument_id and the order history reference
-- it and that history is the audit trail.

--changeset trade-api:001-instruments-tradable
ALTER TABLE Instruments ADD COLUMN tradable BOOLEAN NOT NULL DEFAULT true;
--rollback ALTER TABLE Instruments DROP COLUMN tradable;
