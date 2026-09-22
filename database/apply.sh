#!/usr/bin/env bash

set -euo pipefail

# ------------------------------------------------------------
# Project root directory
# ------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ------------------------------------------------------------
# Load repository .env
# ------------------------------------------------------------

ENV_FILE="$SCRIPT_DIR/.env"

if [[ -f "$ENV_FILE" ]]; then
    set -a
    source "$ENV_FILE"
    set +a
fi

# ------------------------------------------------------------
# Determine target database
# ------------------------------------------------------------

TARGET_DATABASE="${TARGET_DATABASE:-${POSTGRES_DB:-}}"

if [[ -z "$TARGET_DATABASE" ]]; then
    echo "ERROR: TARGET_DATABASE is not set and POSTGRES_DB was not found in .env." >&2
    exit 1
fi

# ------------------------------------------------------------
# PostgreSQL connection settings
# ------------------------------------------------------------

PGUSER="${PGUSER:-${POSTGRES_USER:-}}"
PGPASSWORD="${PGPASSWORD:-${POSTGRES_PASSWORD:-}}"
PGHOST="${PGHOST:-${POSTGRES_HOST:-localhost}}"
PGPORT="${PGPORT:-${POSTGRES_PORT:-5432}}"

if [[ -z "$PGUSER" ]]; then
    echo "ERROR: PostgreSQL user is not configured." >&2
    exit 1
fi

export PGUSER
export PGPASSWORD
export PGHOST
export PGPORT

# ------------------------------------------------------------
# Check that psql exists
# ------------------------------------------------------------

if ! command -v psql >/dev/null 2>&1; then
    echo "ERROR: psql is not installed or not available on PATH." >&2
    exit 1
fi

# ------------------------------------------------------------
# Skip if the base schema is already present
# ------------------------------------------------------------
#
# These migration/seed files are a one-shot bootstrap, not idempotent
# migrations (plain CREATE TYPE/CREATE TABLE, no IF NOT EXISTS; INSERTs
# with no ON CONFLICT) - re-running them against an already-initialized
# database throws "already exists"/duplicate-key errors on the very first
# statement. That happens in practice because the root docker-compose.yml's
# postgres service already mounts these same two files under
# docker-entrypoint-initdb.d and applies them itself on first container
# start - so running this script again against that same container (or
# running it twice against any database) collides with work Postgres, or an
# earlier run of this script, already did. Guard against that here instead
# of relying on every caller to remember not to.

ALREADY_APPLIED=$(psql -v ON_ERROR_STOP=1 --dbname="$TARGET_DATABASE" --tuples-only --no-align \
    --command="SELECT to_regclass('public.orders') IS NOT NULL;")

if [[ "$ALREADY_APPLIED" == "t" ]]; then
    echo "Schema already present in database '$TARGET_DATABASE' (orders table exists) - nothing to do."
    echo "(Expected if Postgres auto-applied migrations/ and seeds/ itself via docker-entrypoint-initdb.d -"
    echo " see root docker-compose.yml's postgres service. Only run this script directly against a"
    echo " native/non-Docker Postgres, or a Docker Postgres whose data volume has never been initialized.)"
    exit 0
fi

# ------------------------------------------------------------
# Apply migrations
# ------------------------------------------------------------

echo "Applying migrations to database: $TARGET_DATABASE"

for file in "$SCRIPT_DIR"/migrations/*.sql; do
    [[ -e "$file" ]] || continue

    echo "Applying migration: $(basename "$file")"

    psql \
        -v ON_ERROR_STOP=1 \
        --dbname="$TARGET_DATABASE" \
        --file="$file"
done

# ------------------------------------------------------------
# Load seed data
# ------------------------------------------------------------

echo "Loading seed data"

for file in "$SCRIPT_DIR"/seeds/*.sql; do
    [[ -e "$file" ]] || continue

    echo "Loading seed: $(basename "$file")"

    psql \
        -v ON_ERROR_STOP=1 \
        --dbname="$TARGET_DATABASE" \
        --file="$file"
done

echo "Database migration and seeding completed successfully."