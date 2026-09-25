# `windows` profile — services on Windows, Kafka on Linux

The root `docker-compose.yml` runs everything in Docker. This profile splits it:

| Where | What | Port |
|---|---|---|
| **Linux** (Docker) | Kafka broker | 9092 |
| **Linux** (Docker) | Kafka UI | 8091 |
| **Windows** (native) | Postgres | 5432 |
| **Windows** (native) | trade-api | 8080 |
| **Windows** (native) | trade-executor | 8082 |
| **Windows** (native) | trades-generator | 8083 |
| **Windows** (native) | auth-service | 3000 |

```
Windows                                       Linux (Docker)
┌────────────────────────────────────┐        ┌───────────────────────┐
│ auth-service ──token──► trade-api ─┼─ORDER_PLACED─►               │
│                            │       │        │   Kafka  (9092)       │
│                         Postgres   │        │   Kafka UI (8091)     │
│                            │       │        │                       │
│ trade-executor ◄───────────┼───────┼────────┤ orders                │
│      └───── ORDER_FILLED/REJECTED ─┼───────►│ trade-events          │
│ trades-generator ── ticks ─────────┼───────►│ market-data           │
└────────────────────────────────────┘        └───────────────────────┘
```

**What "windows" means in the code.** It's a Spring profile, `application-windows.yml`, in
`trade_api`, `trade_executor` and `trades_generator`:
- It requires `KAFKA_BOOTSTRAP_SERVERS`, with no `localhost` fallback, so a missing value fails at startup.
- It sets the native ports and points trade-executor at `localhost:8083`.
- It shortens the producer timeout to 10s for cross-machine sends.

`start-windows.ps1` sets `SPRING_PROFILES_ACTIVE=windows`, or `windows,market-sim` when
`MARKET_SIM=true`. auth-service needs no profile; it's configured entirely through environment variables.

## Prerequisites

- **Windows:** JDK 21+, Maven 3.9+, Node 20+, PostgreSQL (service running), Git Bash (for the test script).
- **Linux:** Docker with the compose plugin, and this repo checked out.
- **Network:** the Windows machine must reach the Linux host on **9092** (and 8091 for the UI).

## 1. Linux: start Kafka

```bash
./windows/kafka-linux.sh
# or, if the auto-detected IP is the wrong interface:
KAFKA_ADVERTISED_HOST=192.168.1.20 ./windows/kafka-linux.sh
```

The script starts the broker and UI, waits until the broker is healthy, and creates `orders`,
`trade-events`, `market-data` and their `.DLT` topics. It finishes by printing the exact
`KAFKA_BOOTSTRAP_SERVERS` value to use on Windows.

> **Docker in WSL2 on the same PC?** Use `KAFKA_ADVERTISED_HOST=localhost`. WSL2 forwards
> `localhost` ports to Windows.

## 2. Windows: configure

```powershell
copy windows\.env.windows.example windows\.env.windows
notepad windows\.env.windows
```

At minimum, set `KAFKA_BOOTSTRAP_SERVERS` (from step 1), `POSTGRES_USER` and `POSTGRES_PASSWORD`.
If `psql.exe` isn't on PATH and isn't under `C:\Program Files\PostgreSQL\<ver>\bin`, also set `PSQL_BIN_DIR`.

## 3. Windows: start everything

```powershell
powershell -ExecutionPolicy Bypass -File windows\start-windows.ps1
# later runs, if nothing changed:
powershell -ExecutionPolicy Bypass -File windows\start-windows.ps1 -SkipBuild
```

In order, the script:
1. Checks the tools are installed, **Kafka is reachable from Windows**, and Postgres accepts the login.
2. Creates the database if it's missing. On an empty database it applies `001_initial_schema.sql` and
   `001_seed_data.sql` only, the same two files Docker's postgres applies. It deliberately doesn't run
   `database/apply.sh`: that also runs `003_auth_service.sql`, whose
   `CREATE TYPE account_status_enum` breaks trade-api's Liquibase changeset that creates the same type.
3. Builds the three jars (`mvn package -DskipTests`) and auth-service (`npm ci && npm run build`).
4. Starts trade-api, then waits for it. Its Liquibase owns the schema after Sprint 3.
5. Starts trades-generator, trade-executor and auth-service, and waits for each health check.
6. Waits for trade-executor to be **assigned partitions of `orders`**. This is the check that proves
   Windows ↔ Linux Kafka actually works, because actuator health has no Kafka indicator.

Logs go to `windows\.run\logs\<service>.log`.

## 4. Windows: verify end to end

```bash
bash windows/test-windows.sh      # from Git Bash
```

The stages are:
1. All four services are healthy and Kafka is reachable.
2. A request with no token gets a **401**.
3. A fresh user is **registered and logged in through auth-service**. This is a real token, not a minted one.
4. trade-api accepts that token and stores the order as **NEW**.
5. trade-executor logs `Received ORDER_PLACED` for that order. The event went Windows → Linux Kafka → Windows.
6. The order settles to **FILLED / REJECTED** (or rests at NEW under market-sim).
7. The row is read back from Postgres with `psql`.

If `FAUXNANCE_API_URL`/`KEY` are blank, the order resolves to `REJECTED` / `PRICE_UNAVAILABLE`.
The round trip is still proven.

## 5. Stop

```powershell
powershell -ExecutionPolicy Bypass -File windows\stop-windows.ps1    # Windows services
```
```bash
./windows/kafka-linux.sh down                                         # Kafka, on Linux
```

## Troubleshooting

| Symptom | Cause |
|---|---|
| `Cannot reach Kafka at ...` in preflight | Linux firewall (`sudo ufw allow 9092/tcp`), wrong IP, or Kafka not started. |
| Preflight passes but the executor log shows connection errors to **another** address (often `localhost`) | The broker advertises an address Windows can't use. Re-run `kafka-linux.sh` with `KAFKA_ADVERTISED_HOST` set to the IP Windows connects to. |
| trade-api fails with `type "account_status_enum" already exists` | `database/apply.sh` was run against this database. Drop and recreate the database, then let `start-windows.ps1` bootstrap it. |
| auth-service exits at boot | Check `auth-service.err.log`. Usually `JWT_SECRET` < 32 chars or Postgres credentials. |
| `Port 8080 is already in use` | A previous run is still up. Run `stop-windows.ps1`. |
