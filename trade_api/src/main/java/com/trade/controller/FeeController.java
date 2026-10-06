package com.trade.controller;

import com.trade.dto.FeeScheduleDto;
import com.trade.security.AuthenticatedPrincipal;
import com.trade.security.JwtAuthFilter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;

// The fee schedule for the order ticket (LEAP-017). The rate is read from the
// same EXECUTOR_FEE_RATE trade_executor's FeeCalculator charges at, so the
// estimate the customer reviews is the fee the platform takes.
@RestController
@RequestMapping("/api/v1/fees")
public class FeeController {

    private final BigDecimal feeRate;

    public FeeController(@Value("${fee.rate}") BigDecimal feeRate) {
        this.feeRate = feeRate;
    }

    @GetMapping
    public FeeScheduleDto getFeeSchedule(
            @RequestAttribute(JwtAuthFilter.PRINCIPAL_ATTRIBUTE) AuthenticatedPrincipal principal) {
        return new FeeScheduleDto(feeRate);
    }
}
