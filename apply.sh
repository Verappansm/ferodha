#!/usr/bin/env bash

set -euo pipefail

# ------------------------------------------------------------
# Project/sprint directory
# ------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ------------------------------------------------------------
# Load repository .env
# ------------------------------------------------------------

ENV_FILE="$SCRIPT_DIR/.env"

if [[ -f "$ENV_FILE" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
fi

# ------------------------------------------------------------
# Determine target database
#
# TARGET_DATABASE takes priority.
# Otherwise use POSTGRES_DB from .env.
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
# Apply migrations in filename order
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
# Load seed files in filename order
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