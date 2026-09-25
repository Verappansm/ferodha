#!/usr/bin/env bash
set -euo pipefail

# Runs on the LINUX Docker host. Starts Kafka + Kafka UI for the "windows"
# setup (every other service runs natively on Windows) and creates the
# topics. See windows/README.md.
#
#   ./windows/kafka-linux.sh            # up + topics
#   ./windows/kafka-linux.sh down       # stop and remove
#   KAFKA_ADVERTISED_HOST=192.168.1.20 ./windows/kafka-linux.sh
#
# KAFKA_ADVERTISED_HOST is the address the WINDOWS machine uses to reach this
# host. It defaults to this host's first IP (hostname -I). Set it explicitly
# if that's the wrong interface, or to localhost when Docker runs inside WSL2
# on the Windows PC itself.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.kafka.yml"

KAFKA_EXTERNAL_PORT="${KAFKA_EXTERNAL_PORT:-9092}"
export KAFKA_EXTERNAL_PORT

if ! docker info >/dev/null 2>&1; then
    echo "FAIL: can't talk to Docker. Is the daemon running, and can this user run 'docker ps'?" >&2
    exit 1
fi

# Compose v2 ships as the "docker compose" plugin; many hosts only have the
# standalone "docker-compose" binary instead. Either works for this file.
if docker compose version >/dev/null 2>&1; then
    COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
    COMPOSE=(docker-compose)
else
    echo "FAIL: neither 'docker compose' nor 'docker-compose' is available on this host." >&2
    exit 1
fi
compose() {
    "${COMPOSE[@]}" -p trade-kafka-windows -f "$COMPOSE_FILE" "$@"
}

if [[ "${1:-up}" == "down" ]]; then
    KAFKA_ADVERTISED_HOST="${KAFKA_ADVERTISED_HOST:-unused}" compose down
    exit 0
fi

if [[ -z "${KAFKA_ADVERTISED_HOST:-}" ]]; then
    KAFKA_ADVERTISED_HOST="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
fi
if [[ -z "$KAFKA_ADVERTISED_HOST" ]]; then
    # Not every distro's hostname supports -I; ask the routing table instead.
    KAFKA_ADVERTISED_HOST="$(ip route get 1.1.1.1 2>/dev/null | awk '{for (i = 1; i < NF; i++) if ($i == "src") print $(i + 1)}' || true)"
fi
if [[ -z "$KAFKA_ADVERTISED_HOST" ]]; then
    echo "FAIL: could not detect this host's IP. Set KAFKA_ADVERTISED_HOST explicitly." >&2
    exit 1
fi
export KAFKA_ADVERTISED_HOST

# The root docker-compose.yml's full stack uses the same container names. If
# its containers still exist, compose can't create these - say so plainly
# instead of failing with a name conflict halfway through.
for name in trade-kafka kafka-ui; do
    project="$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.project" }}' "$name" 2>/dev/null || true)"
    if [[ -n "$(docker ps -aq -f "name=^${name}$")" && "$project" != "trade-kafka-windows" ]]; then
        echo "FAIL: a container named '$name' already exists (from another setup, e.g. the full Docker stack)." >&2
        echo "      Remove it first, then re-run this script:" >&2
        echo "          docker rm -f trade-kafka kafka-ui" >&2
        exit 1
    fi
done

echo "== Starting Kafka (advertised to Windows as $KAFKA_ADVERTISED_HOST:$KAFKA_EXTERNAL_PORT) =="
compose up -d

echo "== Waiting for the broker to be healthy =="
for _ in $(seq 1 30); do
    status="$(docker inspect -f '{{.State.Health.Status}}' trade-kafka 2>/dev/null || echo missing)"
    [[ "$status" == "healthy" ]] && break
    sleep 3
done
if [[ "$status" != "healthy" ]]; then
    echo "FAIL: trade-kafka is '$status' after 90s - see: docker logs trade-kafka" >&2
    exit 1
fi
echo "PASS: broker healthy"

echo "== Creating topics (idempotent) =="
# From inside the container, use the internal listener: the external one
# advertises the LAN IP, which isn't guaranteed to route back into Docker.
export KAFKA_TOPICS_BOOTSTRAP="kafka:29092"
bash "$REPO_DIR/kafka_pipeline/create_topics.sh"
bash "$REPO_DIR/kafka_pipeline/create_dlt_topics.sh"

cat <<EOF

== Kafka is ready for the Windows services ==
  Put this in windows/.env.windows on the Windows machine:
      KAFKA_BOOTSTRAP_SERVERS=$KAFKA_ADVERTISED_HOST:$KAFKA_EXTERNAL_PORT
  Kafka UI:  http://$KAFKA_ADVERTISED_HOST:8091

  If Windows can't connect, open the ports on this host, e.g.:
      sudo ufw allow $KAFKA_EXTERNAL_PORT/tcp && sudo ufw allow 8091/tcp
EOF
