package com.trade.domain;

// rule 8 (duplicate idempotency key)
// only has to prove the rule fires correctly in a single-threaded test
// it is not a concurrency-safe implementation itself
public interface IdempotencyKeyStore {

    boolean isUsed(String idempotencyKey);

    void markUsed(String idempotencyKey);
}
