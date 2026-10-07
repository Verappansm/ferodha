package com.trade.watchlist;

import com.trade.dto.PriceAlertDtos;
import com.trade.service.MarketDataService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Component
public class PriceAlertChecker {

    private static final Logger log = LoggerFactory.getLogger(PriceAlertChecker.class);

    private final WatchlistService watchlistService;
    private final MarketDataService marketDataService;
    private final NotificationService notificationService;

    public PriceAlertChecker(WatchlistService watchlistService,
                             MarketDataService marketDataService,
                             NotificationService notificationService) {
        this.watchlistService = watchlistService;
        this.marketDataService = marketDataService;
        this.notificationService = notificationService;
    }

    /**
     * Check all price alerts every 30 seconds.
     * This runs in the trade-api context and checks all users' watchlists.
     */
    @Scheduled(fixedRate = 30_000, initialDelay = 10_000)
    @Transactional
    public void checkAllPriceAlerts() {
        try {
            // Get all watchlists with items that have alerts
            List<PriceAlertDtos.PriceAlertCheckResult> results = watchlistService.checkPriceAlertsForAllUsers();
            
            // Group by user to send notifications
            Map<UUID, List<PriceAlertDtos.PriceAlertCheckResult>> byUser = results.stream()
                    .filter(r -> r.triggered())
                    .collect(Collectors.groupingBy(PriceAlertDtos.PriceAlertCheckResult::userId));
            
            for (Map.Entry<UUID, List<PriceAlertDtos.PriceAlertCheckResult>> entry : byUser.entrySet()) {
                UUID userId = entry.getKey();
                List<PriceAlertDtos.PriceAlertCheckResult> triggered = entry.getValue();
                
                for (PriceAlertDtos.PriceAlertCheckResult alert : triggered) {
                    String directionText = "ABOVE".equals(alert.alertDirection()) ? "above" : "below";
                    String message = String.format("Price alert: %s (%s) has gone %s $%.2f (current: $%.2f)",
                            alert.name(), alert.symbol(), directionText, alert.alertPrice(), alert.currentPrice());
                    
                    notificationService.createInAppNotification(userId, message, alert.itemId().toString());
                }
            }
            
            if (!results.isEmpty()) {
                long triggeredCount = results.stream().filter(PriceAlertDtos.PriceAlertCheckResult::triggered).count();
                log.debug("Checked {} price alerts, {} triggered", results.size(), triggeredCount);
            }
        } catch (Exception e) {
            log.error("Error checking price alerts", e);
        }
    }
}