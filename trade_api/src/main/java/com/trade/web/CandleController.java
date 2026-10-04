package com.trade.web;

import com.trade.dto.CandlesResponseDto;
import com.trade.service.CandleService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * REST endpoint for fetching OHLC candle data.
 * Used by LEAP-016 (Instrument Detail Page) to display price charts.
 *
 * Candles are pre-calculated and stored in market_candles table
 * (updated daily by pricing_generator's CandlePersistenceScheduler).
 */
@RestController
@RequestMapping("/api/v1/candles")
public class CandleController {

    private final CandleService candleService;

    @Autowired
    public CandleController(CandleService candleService) {
        this.candleService = candleService;
    }

    /**
     * Fetch OHLC candles for an instrument.
     *
     * @param symbol The instrument symbol (e.g., "AAPL", "TATASTEEL.BO")
     * @param interval The candle interval (default "1d" for daily)
     * @return List of candles for the symbol/interval
     */
    @GetMapping("/{symbol}")
    public ResponseEntity<CandlesResponseDto> getCandles(
            @PathVariable String symbol,
            @RequestParam(defaultValue = "1d") String interval
    ) {
        // Validate symbol
        if (symbol == null || symbol.trim().isEmpty()) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).build();
        }

        CandlesResponseDto response = candleService.getCandles(symbol, interval);

        // If no candles found, return 404
        if (response.candles().isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
        }

        return ResponseEntity.ok(response);
    }
}
