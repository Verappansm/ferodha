package com.trade.watchlist;

import com.trade.dto.AddWatchlistItemRequest;
import com.trade.dto.BulkAddWatchlistItemsRequest;
import com.trade.dto.CreateWatchlistRequest;
import com.trade.dto.ReorderWatchlistItemsRequest;
import com.trade.dto.UpdateWatchlistRequest;
import com.trade.dto.WatchlistItemResponse;
import com.trade.dto.WatchlistResponse;
import com.trade.exception.InstrumentNotFoundException;
import com.trade.exception.WatchlistConflictException;
import com.trade.exception.WatchlistItemNotFoundException;
import com.trade.exception.WatchlistNotFoundException;
import com.trade.security.AuthenticatedPrincipal;
import com.trade.security.JwtAuthFilter;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/watchlists")
public class WatchlistController {

    private final WatchlistService watchlistService;

    public WatchlistController(WatchlistService watchlistService) {
        this.watchlistService = watchlistService;
    }

    private UUID getUserId(AuthenticatedPrincipal principal) {
        return UUID.fromString(principal.subjectUserId());
    }

    // Watchlist CRUD endpoints

    @PostMapping
    public WatchlistResponse createWatchlist(
            @RequestBody CreateWatchlistRequest request,
            @RequestAttribute(JwtAuthFilter.PRINCIPAL_ATTRIBUTE) AuthenticatedPrincipal principal)
            throws WatchlistConflictException {
        UUID userId = getUserId(principal);
        return watchlistService.createWatchlist(userId, request);
    }

    @GetMapping
    public List<WatchlistResponse> getWatchlists(
            @RequestAttribute(JwtAuthFilter.PRINCIPAL_ATTRIBUTE) AuthenticatedPrincipal principal) {
        UUID userId = getUserId(principal);
        return watchlistService.getWatchlists(userId);
    }

    @GetMapping("/{watchlistId}")
    public WatchlistResponse getWatchlist(
            @PathVariable UUID watchlistId,
            @RequestAttribute(JwtAuthFilter.PRINCIPAL_ATTRIBUTE) AuthenticatedPrincipal principal)
            throws WatchlistNotFoundException {
        UUID userId = getUserId(principal);
        return watchlistService.getWatchlist(userId, watchlistId)
                .orElseThrow(() -> new WatchlistNotFoundException(watchlistId.toString()));
    }

    @PatchMapping("/{watchlistId}")
    public WatchlistResponse updateWatchlist(
            @PathVariable UUID watchlistId,
            @RequestBody UpdateWatchlistRequest request,
            @RequestAttribute(JwtAuthFilter.PRINCIPAL_ATTRIBUTE) AuthenticatedPrincipal principal)
            throws WatchlistNotFoundException, WatchlistConflictException {
        UUID userId = getUserId(principal);
        return watchlistService.updateWatchlist(userId, watchlistId, request);
    }

    @DeleteMapping("/{watchlistId}")
    public void deleteWatchlist(
            @PathVariable UUID watchlistId,
            @RequestAttribute(JwtAuthFilter.PRINCIPAL_ATTRIBUTE) AuthenticatedPrincipal principal)
            throws WatchlistNotFoundException {
        UUID userId = getUserId(principal);
        watchlistService.deleteWatchlist(userId, watchlistId);
    }

    // Watchlist item endpoints

    @PostMapping("/{watchlistId}/items")
    public WatchlistItemResponse addItem(
            @PathVariable UUID watchlistId,
            @RequestBody AddWatchlistItemRequest request,
            @RequestAttribute(JwtAuthFilter.PRINCIPAL_ATTRIBUTE) AuthenticatedPrincipal principal)
            throws WatchlistNotFoundException, InstrumentNotFoundException, WatchlistConflictException {
        UUID userId = getUserId(principal);
        return watchlistService.addItem(userId, watchlistId, request);
    }

    @PostMapping("/items/bulk")
    public List<WatchlistItemResponse> addItemsBulk(
            @RequestBody BulkAddWatchlistItemsRequest request,
            @RequestAttribute(JwtAuthFilter.PRINCIPAL_ATTRIBUTE) AuthenticatedPrincipal principal) {
        UUID userId = getUserId(principal);
        return watchlistService.addItemsBulk(userId, request);
    }

    @GetMapping("/{watchlistId}/items")
    public List<WatchlistItemResponse> getItems(
            @PathVariable UUID watchlistId,
            @RequestAttribute(JwtAuthFilter.PRINCIPAL_ATTRIBUTE) AuthenticatedPrincipal principal)
            throws WatchlistNotFoundException {
        UUID userId = getUserId(principal);
        return watchlistService.getItems(userId, watchlistId);
    }

    @DeleteMapping("/{watchlistId}/items/{itemId}")
    public void removeItem(
            @PathVariable UUID watchlistId,
            @PathVariable UUID itemId,
            @RequestAttribute(JwtAuthFilter.PRINCIPAL_ATTRIBUTE) AuthenticatedPrincipal principal)
            throws WatchlistNotFoundException, WatchlistItemNotFoundException {
        UUID userId = getUserId(principal);
        watchlistService.removeItem(userId, watchlistId, itemId);
    }

    @PatchMapping("/{watchlistId}/items/reorder")
    public void reorderItems(
            @PathVariable UUID watchlistId,
            @RequestBody ReorderWatchlistItemsRequest request,
            @RequestAttribute(JwtAuthFilter.PRINCIPAL_ATTRIBUTE) AuthenticatedPrincipal principal)
            throws WatchlistNotFoundException {
        UUID userId = getUserId(principal);
        watchlistService.reorderItems(userId, watchlistId, request);
    }
}