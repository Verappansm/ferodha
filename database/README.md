# database

The Sprint 3 operational schema and its seed data.

- `migrations/001_initial_schema.sql`: the base schema.
- `seeds/001_seed_data.sql`: seed data. Every seeded user's password is
  `seed-password-change-me`.
- `apply.sh`: takes an empty database to migrated and seeded, and does
  nothing if the schema is already there.
- `scripts/check.sh` and `probes/`: integrity checks (orphan foreign keys,
  duplicate idempotency keys).

Docker Compose applies the two SQL files itself on a fresh volume. Every
schema change after Sprint 3 is a Liquibase changeset in `trade_api`. The auth
service creates its own refresh-token table at start-up.

## Where the design lives

Sprint 3 asked for an ER diagram, index justifications and normalisation notes
in `design/`.
