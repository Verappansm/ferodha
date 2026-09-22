#!/bin/bash

CONTAINER_NAME="trade-kafka"

echo "Creating Kafka dead-letter topics..."

create_dlt_topic() {
    TOPIC=$1

    echo "Creating topic: $TOPIC"

    if docker exec "$CONTAINER_NAME" \
        /opt/kafka/bin/kafka-topics.sh \
        --bootstrap-server localhost:9092 \
        --create \
        --if-not-exists \
        --topic "$TOPIC" \
        --partitions 1 \
        --replication-factor 1; then
        echo "SUCCESS: $TOPIC created/exists"
    else
        echo "ERROR: Failed to create topic: $TOPIC"
        return 1
    fi
}

create_dlt_topic "orders.DLT"
ORDERS_DLT_STATUS=$?

create_dlt_topic "trade-events.DLT"
TRADE_EVENTS_DLT_STATUS=$?

create_dlt_topic "market-data.DLT"
MARKET_DATA_DLT_STATUS=$?

echo
echo "========== DLT Creation Summary =========="

if [ $ORDERS_DLT_STATUS -eq 0 ]; then
    echo "orders.DLT       : SUCCESS"
else
    echo "orders.DLT       : FAILED"
fi

if [ $TRADE_EVENTS_DLT_STATUS -eq 0 ]; then
    echo "trade-events.DLT : SUCCESS"
else
    echo "trade-events.DLT : FAILED"
fi

if [ $MARKET_DATA_DLT_STATUS -eq 0 ]; then
    echo "market-data.DLT  : SUCCESS"
else
    echo "market-data.DLT  : FAILED"
fi

if [ $ORDERS_DLT_STATUS -eq 0 ] && \
   [ $TRADE_EVENTS_DLT_STATUS -eq 0 ] && \
   [ $MARKET_DATA_DLT_STATUS -eq 0 ]; then

    echo
    echo "All DLT topics created successfully."
    exit 0
else
    echo
    echo "ERROR: One or more DLT topics failed to be created."
    exit 1
fi
