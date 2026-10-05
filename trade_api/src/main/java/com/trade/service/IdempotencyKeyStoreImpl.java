package com.trade.service;

import com.trade.domain.IdempotencyKeyStore;
import com.trade.mapper.OrderMapper;
import org.springframework.stereotype.Component;

// Backs rule 8 with a read against orders.idempotency_key. This read is a
// fast path only, not the authority: two requests carrying the same key can
// both pass isUsed() before either has written its row, so the actual
// guarantee is the UNIQUE constraint on that column, enforced at insert time.
// OrderService catches the resulting constraint violation and maps it to the
// same DuplicateOrderException this class's caller (OrderLogic) throws when
// isUsed() catches it first. markUsed() is a no-op for that reason: the
// insert itself is what "marks" a key used, not a separate write here.
@Component
public class IdempotencyKeyStoreImpl implements IdempotencyKeyStore {

    private final OrderMapper orderMapper;

    public IdempotencyKeyStoreImpl(OrderMapper orderMapper) {
        this.orderMapper = orderMapper;
    }

    @Override
    public boolean isUsed(String idempotencyKey) {
        return orderMapper.existsIdempotencyKey(idempotencyKey);
    }

    @Override
    public void markUsed(String idempotencyKey) {
        // Intentionally empty - see class comment.
    }
}
