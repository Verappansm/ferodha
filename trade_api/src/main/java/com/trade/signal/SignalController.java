package com.trade.signal;

import com.trade.exception.InstrumentNotFoundException;
import com.trade.security.AuthenticatedPrincipal;
import com.trade.security.JwtAuthFilter;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RestController;

// Trade advice and signals (Sprint 10 stretch). Public market information, the same for every
// customer, so a valid customer token is the only check; nothing account-specific is read.
@RestController
public class SignalController {

    private final SignalService signals;

    public SignalController(SignalService signals) {
        this.signals = signals;
    }

    @GetMapping("/api/v1/instruments/{symbol}/signal")
    public SignalDto signal(@PathVariable String symbol,
                            @RequestAttribute(JwtAuthFilter.PRINCIPAL_ATTRIBUTE) AuthenticatedPrincipal principal)
            throws InstrumentNotFoundException {
        return signals.signal(symbol);
    }
}
