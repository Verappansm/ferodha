# Kafka Pipeline Setup

This document covers the setup required to run Kafka locally on the Linux machine and create the Sprint 7 Kafka topics.

## 1. Create and Start the Kafka Docker Container

### Where?

**Linux machine**

Kafka and Kafka UI run inside Docker on the Linux machine.

Windows is used only to connect to the Linux machine, for example through VS Code Remote SSH or SSH.

### Project structure

```text
kafka_pipeline/
├── docker-compose.yml
├── create_topics.sh
└── create_dlt_topics.sh
```

### Create the project directory

On Linux:

```bash
mkdir -p kafka_pipeline
cd kafka_pipeline
```

### Create `docker-compose.yml`

On Linux:

```bash
touch docker-compose.yml
```

Open it in your editor and add the Kafka and Kafka UI configuration used by the project.


### Start Docker containers

On Linux, from `kafka_pipeline`:

```bash
docker-compose up -d
```

or:

```bash
docker compose up -d
```

### Verify containers

On Linux:

```bash
docker ps
```

Verify that both containers are running:

```text
trade-kafka
kafka-ui
```

### Verify Kafka container logs

On Linux:

```bash
docker logs trade-kafka
```

### Verify Kafka UI logs

On Linux:

```bash
docker logs kafka-ui
```

### Open Kafka UI

From the **Windows browser**, use:

```text
http://<LINUX_IP>:<KAFKA_UI_PORT>
```

Example:

```text
http://10.8.70.116:8081
```

Use the actual Linux IP and Kafka UI port configured for your environment.

Kafka UI connects to the Kafka container internally using:

```text
kafka:9092
```

---

## 2. Create the Main Topic Script

### Where?

**Linux machine**

The `.sh` file is stored and executed on Linux.

Windows can be used to edit the file through VS Code Remote SSH.

### Create the file

From the Linux terminal:

```bash
cd kafka_pipeline
touch create_topics.sh
```

Verify:

```bash
ls -l create_topics.sh
```

### Give execute permission

```bash
chmod +x create_topics.sh
```

Verify the permission:

```bash
ls -l create_topics.sh
```

The permissions should include `x`, for example:

```text
-rwxr-xr-x
```

### Run the script

```bash
./create_topics.sh
```

The script creates these main topics:

```text
orders
trade-events
market-data
```

The required configuration is:

| Topic | Partitions | Replication | Retention |
|---|---:|---:|---:|
| `orders` | 3 | 1 | 7 days |
| `trade-events` | 3 | 1 | 30 days |
| `market-data` | 6 | 1 | 1 day |

### Verify main topics

On Linux:

```bash
docker exec trade-kafka   /opt/kafka/bin/kafka-topics.sh   --bootstrap-server localhost:9092   --list
```

Verify individual topic configuration:

```bash
docker exec trade-kafka   /opt/kafka/bin/kafka-topics.sh   --bootstrap-server localhost:9092   --describe   --topic orders
```

```bash
docker exec trade-kafka   /opt/kafka/bin/kafka-topics.sh   --bootstrap-server localhost:9092   --describe   --topic trade-events
```

```bash
docker exec trade-kafka   /opt/kafka/bin/kafka-topics.sh   --bootstrap-server localhost:9092   --describe   --topic market-data
```

Expected partition counts:

```text
orders       → 3
trade-events → 3
market-data  → 6
```

---

## 3. Create the Dead-Letter Topic Script

### Where?

**Linux machine**

### Create the file

From the Linux terminal:

```bash
cd kafka_pipeline
touch create_dlt_topics.sh
```

Verify:

```bash
ls -l create_dlt_topics.sh
```

### Give execute permission

```bash
chmod +x create_dlt_topics.sh
```

Verify:

```bash
ls -l create_dlt_topics.sh
```

The permissions should include `x`, for example:

```text
-rwxr-xr-x
```

### Run the script

```bash
./create_dlt_topics.sh
```

The script creates these dead-letter topics:

```text
orders.DLT
trade-events.DLT
market-data.DLT
```

### Verify DLT topics

On Linux:

```bash
docker exec trade-kafka   /opt/kafka/bin/kafka-topics.sh   --bootstrap-server localhost:9092   --list
```

The final topic list should contain:

```text
orders
trade-events
market-data
orders.DLT
trade-events.DLT
market-data.DLT
```

---

## 4. Final Setup Verification

### Linux

Run:

```bash
docker ps
```

Verify:

```text
trade-kafka
kafka-ui
```

Then:

```bash
docker exec trade-kafka   /opt/kafka/bin/kafka-topics.sh   --bootstrap-server localhost:9092   --list
```

Verify all six topics exist:

```text
orders
trade-events
market-data
orders.DLT
trade-events.DLT
market-data.DLT
```

### Windows

Open Kafka UI in the browser:

```text
http://<LINUX_IP>:<KAFKA_UI_PORT>
```

Kafka topic administration and script execution are performed on the Linux machine. Windows is used to connect to the Linux machine and access Kafka UI.
