package com.trade.admin.service;

import com.trade.admin.dto.AdminDtos.ComponentHealthDto;
import com.trade.admin.dto.AdminDtos.SystemHealthDto;
import com.trade.admin.mapper.AdminMapper;
import org.apache.kafka.clients.admin.Admin;
import org.apache.kafka.clients.admin.AdminClientConfig;
import org.apache.kafka.clients.admin.DescribeClusterOptions;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;

// LEAP-023: probes every platform component from the server side, so the
// console never calls an internal service and no internal address reaches the
// browser bundle. Each probe has a short timeout; one slow component makes
// that component DOWN, never the whole page slow.
@Service
public class SystemHealthService {

    private static final Duration TIMEOUT = Duration.ofSeconds(2);

    private final AdminMapper mapper;
    private final RestClient http;
    private final String authHealthUrl;
    private final String executorHealthUrl;
    private final String kafkaBootstrap;

    public SystemHealthService(
            AdminMapper mapper,
            @Value("${app.admin.health.auth-url}") String authHealthUrl,
            @Value("${app.admin.health.executor-url}") String executorHealthUrl,
            @Value("${spring.kafka.producer.bootstrap-servers}") String kafkaBootstrap) {
        this.mapper = mapper;
        this.authHealthUrl = authHealthUrl;
        this.executorHealthUrl = executorHealthUrl;
        this.kafkaBootstrap = kafkaBootstrap;
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(TIMEOUT);
        factory.setReadTimeout(TIMEOUT);
        this.http = RestClient.builder().requestFactory(factory).build();
    }

    public SystemHealthDto check() {
        return new SystemHealthDto(OffsetDateTime.now(), List.of(
                new ComponentHealthDto("trade-api", "UP", "Answering this request.", 0L),
                probe("postgres", () -> {
                    mapper.ping();
                    return "Query answered.";
                }),
                probe("kafka", this::kafka),
                probe("auth-service", () -> httpProbe(authHealthUrl, "\"ok\"")),
                probe("trade-executor", () -> httpProbe(executorHealthUrl, "\"UP\""))
        ));
    }

    private ComponentHealthDto probe(String name, Supplier<String> check) {
        long start = System.nanoTime();
        try {
            String detail = check.get();
            return new ComponentHealthDto(name, "UP", detail, elapsedMs(start));
        } catch (RuntimeException e) {
            // The cause's class only: an exception message can carry a host or a credential.
            return new ComponentHealthDto(name, "DOWN", "Not reachable (" + e.getClass().getSimpleName() + ").",
                    elapsedMs(start));
        }
    }

    private String httpProbe(String url, String expected) {
        String body = http.get().uri(url).retrieve().body(String.class);
        if (body == null || !body.contains(expected)) {
            throw new IllegalStateException("unexpected health body");
        }
        return "Health endpoint answered.";
    }

    private String kafka() {
        Map<String, Object> config = Map.of(
                AdminClientConfig.BOOTSTRAP_SERVERS_CONFIG, kafkaBootstrap,
                AdminClientConfig.REQUEST_TIMEOUT_MS_CONFIG, (int) TIMEOUT.toMillis(),
                AdminClientConfig.DEFAULT_API_TIMEOUT_MS_CONFIG, (int) TIMEOUT.toMillis());
        try (Admin admin = Admin.create(config)) {
            int brokers = admin.describeCluster(new DescribeClusterOptions().timeoutMs((int) TIMEOUT.toMillis()))
                    .nodes().get(TIMEOUT.toMillis(), TimeUnit.MILLISECONDS).size();
            return brokers + " broker" + (brokers == 1 ? "" : "s") + " in the cluster.";
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(e);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static long elapsedMs(long start) {
        return TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - start);
    }
}
