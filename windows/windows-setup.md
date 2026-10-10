# `windows` profile: services on Windows, Kafka on Linux

The root `docker-compose.yml` runs everything in Docker. This profile splits it across two machines.
trade-executor also runs the live price feed under both profiles (formerly the separate pricing-generator service): it publishes a tick for every tradable instrument to `market-data` every 5 seconds and records the history behind the instrument charts. The profiles differ only in how trade-executor settles an order. By default (the **main profile**) each order fills or is rejected at the live tick. Add `-MarketSim` to `start-windows.ps1` for the simulated market (see [Market-sim](#market-sim)).

| Machine | Runs | Port |
|---|---|---|
| **Linux** (Docker) | Kafka broker | 9092 |
| **Linux** (Docker) | Kafka UI | 8091 |
| **Windows** (native) | PostgreSQL | 5432 |
| **Windows** (native) | trade-api | 8081 |
| **Windows** (native) | trade-executor | 8082 |
| **Windows** (native) | auth-service | 3000 |
| **Windows** (native) | trading-ui (Angular, `ng serve`) | 4200 |
| **Windows** (native) | admin console (Angular, `ng serve admin`), served at `4200/admin` | 4300, on 127.0.0.1 only |

```
Windows                                           Linux (Docker)
auth-service --token--> trade-api --ORDER_PLACED-->  Kafka  orders
                           |                                  |
                       PostgreSQL                             v
trade-executor <------------------------------------ orders
trade-executor ---ORDER_FILLED / ORDER_REJECTED---> trade-events
```

## Which env file?

The repo has two `.env` example files. **This setup uses only `windows\.env.windows.example`.**

| File | Used by |
|---|---|
| `.env.example` (repo root) | The full-Docker setup (`docker compose up`, `scripts/demo.sh`). **Not used here.** |
| `windows\.env.windows.example` | **This setup.** Copy it to `windows\.env.windows` and fill that copy in. |

Never edit the `*.example` files. `windows\.env.windows` is git-ignored, so your password is never committed.

---

## Prerequisites

**Linux machine:**
- Docker, plus either `docker compose` or `docker-compose`. The script uses whichever exists.
- Git.
- Firewall open on **9092** and **8091** to the Windows machine.

**Windows machine:**
- JDK 21 or newer (25 works), Maven 3.9+, Node 20+.
- PostgreSQL, with the service running.
- Git for Windows, which provides Git Bash for the test script.

The examples below use `10.8.76.244` as the Linux machine's IP. Replace it with yours everywhere.

---

## Part A: Linux machine (Kafka)

**A1. Get the code.**
```bash
git clone <repo-url>
cd chennai-capstone-SE4-team2
git checkout feature/nestjs-auth-service
```
If the repo is already cloned there, just update it:
```bash
cd chennai-capstone-SE4-team2
git checkout feature/nestjs-auth-service
git pull
```

**A2. Find this machine's IP.**
```bash
hostname -I        # first address, e.g. 10.8.76.244
```

**A3. Remove old containers from the full-Docker setup.** Do this only if you ran the whole stack in Docker before, because the container names clash. It removes the containers, not the images.
```bash
docker rm -f trade-kafka kafka-ui
```

**A4. Start Kafka.**
```bash
KAFKA_ADVERTISED_HOST=10.8.76.244 bash windows/kafka-linux.sh
```
The script starts Kafka and Kafka UI, waits until the broker is healthy, and creates the topics: `orders`, `trade-events`, `market-data` and their `.DLT` versions. It ends with:
```
KAFKA_BOOTSTRAP_SERVERS=10.8.76.244:9092
Kafka UI:  http://10.8.76.244:8091
```

**A5. Check the topics exist.**
```bash
docker exec trade-kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server kafka:29092 --list
```

**A6. Open the firewall.** Only needed if Windows can't connect in step B3.
```bash
sudo ufw allow 9092/tcp && sudo ufw allow 8091/tcp                                            # Ubuntu/Debian
sudo firewall-cmd --add-port=9092/tcp --add-port=8091/tcp --permanent && sudo firewall-cmd --reload  # RHEL/Fedora
```

Leave the Linux machine running. It needs no env file.

---

## Part B: Windows machine (everything else)

**B1. Check PostgreSQL is running.** Press Win+R, type `services.msc`, and make sure **postgresql-x64-<version>** is *Running*.
Have the password you set for the `postgres` user when installing ready.

**B2. Get the code.** In PowerShell:
```powershell
git clone <repo-url>
cd chennai-capstone-SE4-team2
git checkout feature/nestjs-auth-service
```

**B3. Check Windows can reach Kafka.**
```powershell
Test-NetConnection 10.8.76.244 -Port 9092
```
It must show `TcpTestSucceeded : True`. If it shows False, do step A6.

**B4. Create your env file.**
```powershell
copy windows\.env.windows.example windows\.env.windows
notepad windows\.env.windows
```
Change only these lines, save, and close Notepad:
```
KAFKA_BOOTSTRAP_SERVERS=10.8.76.244:9092
KAFKA_UI_URL=http://10.8.76.244:8091
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<your postgres password>
PSQL_BIN_DIR=C:\Program Files\PostgreSQL\18\bin
```
- `POSTGRES_DB=tradedb` can stay as it is. The start script creates that database.
- `FAUXNANCE_API_URL` and `FAUXNANCE_API_KEY` are optional. Left blank, every order still goes through Kafka but ends as `REJECTED / PRICE_UNAVAILABLE`. Fill them in to get real fills, and real prices on the portfolio page.

**B5. Start all the services.** From the repo folder in PowerShell:
```powershell
powershell -ExecutionPolicy Bypass -File windows\start-windows.ps1
```
The first run takes a few minutes because it builds everything. You should see:
```
== Preflight ==              tools found, Kafka reachable, Postgres login OK
== Database (tradedb) ==     database created + base schema applied (first run only)
== Build ==                  trade-api, trade-executor jars + auth-service
== Start (SPRING_PROFILES_ACTIVE=windows) ==
PASS: trade-api / trade-executor / auth-service are up
PASS: trading-ui is up / admin-ui is up
== Kafka connectivity (trade-executor consumer group) ==
PASS: trade-executor joined its consumer group on the Linux broker
== ALL SERVICES RUNNING ==
```
If Windows Firewall asks whether to allow Java or Node, click **Allow**. The services run hidden in the background, and their logs are in `windows\.run\logs\`.

Then open:
- **Trading UI:** http://localhost:4200, signed in as `john.carter@example.com` / `seed-password-change-me`
- **Admin console:** http://localhost:4200/admin, signed in as `michael.brown@example.com` / `seed-password-change-me`

`-SkipUi` starts neither UI.

**B6. Test the whole flow.** Right-click inside the repo folder, choose **Open Git Bash here**, and run:
```bash
bash windows/test-windows.sh
```
The stages are:
1. trade-api, trade-executor and auth-service are healthy, and Kafka is reachable.
2. A request with no token gets **401**.
3. A new user is **registered and logged in through auth-service**, which returns a real token.
4. trade-api accepts that token and stores the order as **NEW**.
5. trade-executor logs `Received ORDER_PLACED` for that order: Windows to Linux Kafka and back to Windows.
6. The order settles to **FILLED / REJECTED**. Without a Fauxnance key it's `REJECTED / PRICE_UNAVAILABLE`, which is expected.
7. The result is shown: the order entry, the balance before and after, and positions, all through trade-api.
8. The order row and account cash are read back from PostgreSQL.

It ends with `== ALL STAGES PASSED ==`.

**B7. Optional: watch the events.** Open `http://10.8.76.244:8091`, then go to **Topics**, then `orders` or `trade-events`, then **Messages**.

---

## Stopping

```powershell
powershell -ExecutionPolicy Bypass -File windows\stop-windows.ps1       # Windows
```
This stops every service the start script ran (with their child processes), anything java or node still listening on the platform ports (8081, 8082, 3000, 4200, 4300) after a run that failed part-way, and the local PostgreSQL service. Add `-KeepPostgres` to leave PostgreSQL running. Stopping and starting the PostgreSQL service needs a window opened as Administrator; `start-windows.ps1` starts the service again if it is stopped.
```bash
bash windows/kafka-linux.sh down                                         # Linux
```

## Running again another day

1. **Linux:** `KAFKA_ADVERTISED_HOST=10.8.76.244 bash windows/kafka-linux.sh`. Kafka keeps no data between runs, so this recreates the topics every time.
2. **Windows:** skip the rebuild. The env file and database are already there.
   ```powershell
   powershell -ExecutionPolicy Bypass -File windows\start-windows.ps1 -SkipBuild
   ```
3. **Windows (Git Bash), optional:** `bash windows/test-windows.sh`

Drop `-SkipBuild` after a `git pull` so the new code is built.

## Market-sim

```powershell
powershell -ExecutionPolicy Bypass -File windows\start-windows.ps1 -MarketSim
```
This sets `SPRING_PROFILES_ACTIVE=windows,market-sim` for every Spring service, the same switch Docker uses. Only settlement changes:
- **trade-executor** matches orders on a resting order book at its live prices, with partial fills, and expires stale resting orders.
- Its **market maker** (formerly the trades-generator service) places synthetic counter-orders for the market-maker account, so customer orders have something to match against. It does nothing without `-MarketSim`.

The price feed behaves the same either way. trade-executor's own market-data poller stays in the code but is off (`EXECUTOR_MARKET_DATA_POLLER_ENABLED=false`), so only one process publishes prices.

---

## What the pieces are

- **`application-windows.yml`**: the Spring profile in `trade_api` and `trade_executor`. The two generators need no profile of their own: they read the same environment variables.
  - Requires `KAFKA_BOOTSTRAP_SERVERS`, with no localhost fallback.
  - Sets the native ports.
  - Shortens the producer timeout to 10s for cross-machine sends.
  - Gives the Fauxnance settings safe defaults.

  `start-windows.ps1` activates it with `SPRING_PROFILES_ACTIVE=windows`.
- **`start-windows.ps1`**:
  - Checks the tools, Kafka reachability and the PostgreSQL login.
  - Creates the database. On an empty database it applies only `001_initial_schema.sql` and `001_seed_data.sql`, the same two files Docker's postgres applies.
  - Builds everything.
  - Starts trade-api first, because its Liquibase owns the schema after Sprint 3, then trade-executor (with its price feed and market maker) and auth-service, then both UIs.
  - Waits for each health check, and for trade-executor to be assigned partitions of `orders`.
- **`kafka-linux.sh`** plus **`docker-compose.kafka.yml`**: Kafka and Kafka UI only. The broker advertises the Linux IP on 9092 so Windows clients can reconnect to it.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Linux: `unknown shorthand flag: 'f' in -f` | Old copy of the script. `git pull`: it now falls back to `docker-compose`. |
| Linux: `a container named 'trade-kafka' already exists` | `docker rm -f trade-kafka kafka-ui`, then re-run. |
| Windows: `Cannot reach Kafka at ...` | Wrong IP in `.env.windows`, Kafka not started, or the Linux firewall (step A6). |
| Preflight passes, but the trade-executor log shows connection errors to a **different** address | Kafka advertises the wrong address. Re-run A4 with `KAFKA_ADVERTISED_HOST` set to the IP Windows uses. |
| `psql failed` or `password authentication failed` | Check `POSTGRES_USER` and `POSTGRES_PASSWORD`, and set `PSQL_BIN_DIR` if psql isn't found. |
| trade-api: `type "account_status_enum" already exists` | An older `database\apply.sh` ran a Sprint 8 migration on this database. Drop the `tradedb` database and run B5 again. |
| Stage 3: `no token for john.carter@example.com`, or sign-in refused for a seed user | The database is older than the seed password, or than trade-api's Liquibase 012 (the browsers now send a digest of the password, B23). Drop `tradedb` and run B5 again. A user you registered yourself before that change has to register again. |
| `Port 8081 is already in use` | A previous run is still up. Run `stop-windows.ps1`. |
| A service `exited during startup` | The script prints its log. Full logs are in `windows\.run\logs\<service>.log` and `.err.log`. |
| `still waiting for trading-ui` until it fails, but http://localhost:4200 opens | Old copy of the script: the check asked the dev server for JSON, which it answers with 404. `git pull`. |
