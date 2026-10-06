package com.trade.service;

import com.trade.domain.AccountRepository;
import com.trade.domain.IdempotencyKeyStore;
import com.trade.domain.InstrumentRepository;
import com.trade.domain.OrderLogic;
import com.trade.domain.PositionRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.math.BigDecimal;

// OrderLogic is plain Sprint 5 domain code and deliberately carries no
// Spring annotation of its own - the domain package must stay free of any
// framework type. This is the one place it is wired into the application
// context, from the persistence adapters that implement its four seams.
@Configuration
public class DomainConfiguration {

    @Bean
    public OrderLogic orderLogic(AccountRepository accountRepository,
                                  InstrumentRepository instrumentRepository,
                                  PositionRepository positionRepository,
                                  IdempotencyKeyStore idempotencyKeyStore,
                                  @Value("${fee.rate}") BigDecimal feeRate) {
        return new OrderLogic(accountRepository, instrumentRepository, positionRepository, idempotencyKeyStore,
                feeRate);
    }
}
