#!/bin/bash

CONTAINER_NAME="trade-kafka"

echo "Creating Kafka topics..."

create_topic() {
    TOPIC=$1
    PARTITIONS=$2
    RETENTION=$3

    echo "Creating topic: $TOPIC"

    docker exec "$CONTAINER_NAME" \
        /opt/kafka/bin/kafka-topics.sh \
        --bootstrap-server localhost:9092 \
        --create \
        --if-not-exists \
        --topic "$TOPIC" \
        --partitions "$PARTITIONS" \
        --replication-factor 1 \
        --config retention.ms="$RETENTION"

    if [ $? -eq 0 ]; then
        echo "SUCCESS: $TOPIC created/exists"
    else
        echo "ERROR: Failed to create topic: $TOPIC"
        return 1
    fi
}

create_topic "orders" 3 604800000
ORDERS_STATUS=$?

create_topic "trade-events" 3 2592000000
TRADE_EVENTS_STATUS=$?

create_topic "market-data" 6 86400000
MARKET_DATA_STATUS=$?

echo
echo "========== Topic Creation Summary =========="

if [ $ORDERS_STATUS -eq 0 ]; then
    echo "orders       : SUCCESS"
else
    echo "orders       : FAILED"
fi

if [ $TRADE_EVENTS_STATUS -eq 0 ]; then
    echo "trade-events : SUCCESS"
else
    echo "trade-events : FAILED"
fi

if [ $MARKET_DATA_STATUS -eq 0 ]; then
    echo "market-data  : SUCCESS"
else
    echo "market-data  : FAILED"
fi

if [ $ORDERS_STATUS -eq 0 ] && \
   [ $TRADE_EVENTS_STATUS -eq 0 ] && \
   [ $MARKET_DATA_STATUS -eq 0 ]; then

    echo
    echo "All Kafka topics created successfully."
    exit 0
else
    echo
    echo "ERROR: One or more Kafka topics failed to be created."
    exit 1
fi