package com.trade.executor.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.config.ConcurrentKafkaListenerContainerFactory;
import org.springframework.kafka.core.ConsumerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.listener.ContainerProperties;
import org.springframework.kafka.listener.DeadLetterPublishingRecoverer;
import org.springframework.kafka.listener.DefaultErrorHandler;
import org.springframework.kafka.support.ExponentialBackOffWithMaxRetries;

// Poison messages (malformed JSON, missing fields) and transient
// infrastructure failures (DB/Kafka unreachable) end up here, via whatever
// RuntimeException OrderPlacedListener.onMessage lets propagate. A
// Fauxnance outage never reaches this handler - QuoteSource.fetchQuote
// resolves it to a business reject instead (see FauxnanceQuoteClient).
@Configuration
public class KafkaConsumerConfig {

    @Bean
    public ConcurrentKafkaListenerContainerFactory<String, String> manualAckOrdersListenerFactory(
            ConsumerFactory<String, String> consumerFactory,
            KafkaTemplate<String, String> kafkaTemplate,
            @Value("${kafka.topics.orders-dlt:orders.DLT}") String ordersDlt) {

        ConcurrentKafkaListenerContainerFactory<String, String> factory = new ConcurrentKafkaListenerContainerFactory<>();
        factory.setConsumerFactory(consumerFactory);
        factory.getContainerProperties().setAckMode(ContainerProperties.AckMode.MANUAL_IMMEDIATE);

        // Partition -1: let the producer's partitioner choose, since
        // orders.DLT need not share orders' partition count.
        DeadLetterPublishingRecoverer recoverer = new DeadLetterPublishingRecoverer(
                kafkaTemplate, (record, ex) -> new org.apache.kafka.common.TopicPartition(ordersDlt, -1));

        ExponentialBackOffWithMaxRetries backOff = new ExponentialBackOffWithMaxRetries(5);
        backOff.setInitialInterval(500L);
        backOff.setMultiplier(2.0);
        backOff.setMaxInterval(5_000L);

        factory.setCommonErrorHandler(new DefaultErrorHandler(recoverer, backOff));
        return factory;
    }
}
