#!/usr/bin/env bash

set -euo pipefail

# ------------------------------------------------------------
# Project root directory
# ------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# ------------------------------------------------------------
# Load repository .env
# ------------------------------------------------------------

ENV_FILE="$ROOT_DIR/.env"

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
# Run a probe
#
# A probe PASSES when PostgreSQL rejects the invalid operation.
# ------------------------------------------------------------

run_probe() {
    local probe="$1"
    local name

    name="$(basename "$probe")"

    echo "Running probe: $name"

    if psql \
        -v ON_ERROR_STOP=1 \
        --dbname="$TARGET_DATABASE" \
        --file="$probe" >/dev/null 2>&1; then

        echo "FAIL: $name was accepted"
        return 1
    else
        echo "PASS: $name was rejected as expected"
    fi
}

# ------------------------------------------------------------
# Run both probes
# ------------------------------------------------------------

run_probe "$ROOT_DIR/probes/duplicate-idempotency-key.sql"

run_probe "$ROOT_DIR/probes/orphan-foreign-key.sql"

echo "All probes passed."