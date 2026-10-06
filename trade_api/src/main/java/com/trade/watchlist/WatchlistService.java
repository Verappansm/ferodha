package com.trade.watchlist;

import com.trade.domain.Instrument;
import com.trade.domain.InstrumentRepository;
import com.trade.dto.AddWatchlistItemRequest;
import com.trade.dto.BulkAddWatchlistItemsRequest;
import com.trade.dto.CreateWatchlistRequest;
import com.trade.dto.IntradayPricePoint;
import com.trade.dto.ReorderWatchlistItemsRequest;
import com.trade.dto.UpdateWatchlistRequest;
import com.trade.dto.WatchlistItemResponse;
import com.trade.dto.WatchlistResponse;
import com.trade.exception.InstrumentNotFoundException;
import com.trade.exception.WatchlistConflictException;
import com.trade.exception.WatchlistItemNotFoundException;
import com.trade.exception.WatchlistNotFoundException;
import com.trade.mapper.InstrumentRow;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class WatchlistService {

    private final WatchlistRepository watchlistRepository;
    private final WatchlistItemRepository watchlistItemRepository;
    private final InstrumentRepository instrumentRepository;

    public WatchlistService(WatchlistRepository watchlistRepository,
                            WatchlistItemRepository watchlistItemRepository,
                            InstrumentRepository instrumentRepository) {
        this.watchlistRepository = watchlistRepository;
        this.watchlistItemRepository = watchlistItemRepository;
        this.instrumentRepository = instrumentRepository;
    }

    // Watchlist CRUD operations

    @Transactional
    public WatchlistResponse createWatchlist(UUID userId, CreateWatchlistRequest request)
            throws WatchlistConflictException {
        if (watchlistRepository.findByUserIdAndName(userId, request.name()).isPresent()) {
            throw new WatchlistConflictException("A watchlist with this name already exists");
        }

        int displayOrder = watchlistRepository.getMaxDisplayOrder(userId) + 1;
        Watchlist watchlist = new Watchlist(UUID.randomUUID(), request.name(), userId, displayOrder);
        watchlistRepository.save(watchlist);

        return new WatchlistResponse(watchlist.getWatchlistId(), watchlist.getName(), displayOrder, List.of());
    }

    public List<WatchlistResponse> getWatchlists(UUID userId) {
        return watchlistRepository.findByUserId(userId).stream()
                .sorted(Comparator.comparingInt(Watchlist::getDisplayOrder))
                .map(this::toWatchlistResponse)
                .toList();
    }

    public Optional<WatchlistResponse> getWatchlist(UUID userId, UUID watchlistId) {
        return watchlistRepository.findById(watchlistId)
                .filter(w -> w.getUserId().equals(userId))
                .map(this::toWatchlistResponse);
    }

    @Transactional
    public WatchlistResponse updateWatchlist(UUID userId, UUID watchlistId, UpdateWatchlistRequest request)
            throws WatchlistNotFoundException, WatchlistConflictException {
        Watchlist watchlist = watchlistRepository.findById(watchlistId)
                .filter(w -> w.getUserId().equals(userId))
                .orElseThrow(() -> new WatchlistNotFoundException(watchlistId.toString()));

        if (request.name() != null && !request.name().equals(watchlist.getName())) {
            if (watchlistRepository.findByUserIdAndName(userId, request.name()).isPresent()) {
                throw new WatchlistConflictException("A watchlist with this name already exists");
            }
        }

        if (request.displayOrder() != null && request.displayOrder() != watchlist.getDisplayOrder()) {
            watchlistRepository.updateDisplayOrder(watchlistId, request.displayOrder());
        }

        return toWatchlistResponse(watchlist);
    }

    @Transactional
    public void deleteWatchlist(UUID userId, UUID watchlistId) throws WatchlistNotFoundException {
        Watchlist watchlist = watchlistRepository.findById(watchlistId)
                .filter(w -> w.getUserId().equals(userId))
                .orElseThrow(() -> new WatchlistNotFoundException(watchlistId.toString()));
        watchlistRepository.deleteById(watchlistId);
    }

    // Watchlist item operations

    @Transactional
    public WatchlistItemResponse addItem(UUID userId, UUID watchlistId, AddWatchlistItemRequest request)
            throws WatchlistNotFoundException, InstrumentNotFoundException, WatchlistConflictException {
        Watchlist watchlist = watchlistRepository.findById(watchlistId)
                .filter(w -> w.getUserId().equals(userId))
                .orElseThrow(() -> new WatchlistNotFoundException(watchlistId.toString()));

        Instrument instrument = instrumentRepository.findBySymbol(request.symbol().toUpperCase())
                .orElseThrow(() -> new InstrumentNotFoundException(request.symbol()));

        if (watchlistItemRepository.findByWatchlistIdAndInstrumentId(watchlistId, instrument.getInstrumentId()).isPresent()) {
            throw new WatchlistConflictException("Instrument already in watchlist");
        }

        int displayOrder = watchlistItemRepository.getMaxDisplayOrder(watchlistId) + 1;
        WatchlistItem item = new WatchlistItem(
                UUID.randomUUID(),
                watchlistId,
                instrument.getInstrumentId(),
                displayOrder,
                OffsetDateTime.now()
        );
        watchlistItemRepository.save(item);

        return toWatchlistItemResponse(item, instrument);
    }

    @Transactional
    public List<WatchlistItemResponse> addItemsBulk(UUID userId, BulkAddWatchlistItemsRequest request) {
        List<WatchlistItemResponse> addedItems = new ArrayList<>();
        for (UUID watchlistId : request.watchlistIds()) {
            try {
                AddWatchlistItemRequest singleRequest = new AddWatchlistItemRequest(request.symbol(), watchlistId);
                WatchlistItemResponse response = addItem(userId, watchlistId, singleRequest);
                addedItems.add(response);
            } catch (WatchlistConflictException | WatchlistNotFoundException | InstrumentNotFoundException e) {
                // Skip if already exists in this watchlist or watchlist not found
            }
        }
        return addedItems;
    }

    public List<WatchlistItemResponse> getItems(UUID userId, UUID watchlistId) throws WatchlistNotFoundException {
        Watchlist watchlist = watchlistRepository.findById(watchlistId)
                .filter(w -> w.getUserId().equals(userId))
                .orElseThrow(() -> new WatchlistNotFoundException(watchlistId.toString()));

        return watchlistItemRepository.findByWatchlistId(watchlistId).stream()
                .sorted(Comparator.comparingInt(WatchlistItem::getDisplayOrder))
                .map(item -> {
                    Instrument instrument = instrumentRepository.findByInstrumentId(item.getInstrumentId())
                            .orElse(null);
                    return toWatchlistItemResponse(item, instrument);
                })
                .toList();
    }

    @Transactional
    public void removeItem(UUID userId, UUID watchlistId, UUID itemId)
            throws WatchlistNotFoundException, WatchlistItemNotFoundException {
        watchlistRepository.findById(watchlistId)
                .filter(w -> w.getUserId().equals(userId))
                .orElseThrow(() -> new WatchlistNotFoundException(watchlistId.toString()));

        WatchlistItem item = watchlistItemRepository.findById(itemId)
                .filter(i -> i.getWatchlistId().equals(watchlistId))
                .orElseThrow(() -> new WatchlistItemNotFoundException(itemId.toString()));
        watchlistItemRepository.deleteById(itemId);
    }

    @Transactional
    public void reorderItems(UUID userId, UUID watchlistId, ReorderWatchlistItemsRequest request)
            throws WatchlistNotFoundException {
        watchlistRepository.findById(watchlistId)
                .filter(w -> w.getUserId().equals(userId))
                .orElseThrow(() -> new WatchlistNotFoundException(watchlistId.toString()));

        watchlistItemRepository.updateDisplayOrders(watchlistId, request.itemOrderMap());
    }

    // Helper methods

    private WatchlistResponse toWatchlistResponse(Watchlist watchlist) {
        List<WatchlistItemResponse> items = watchlistItemRepository.findByWatchlistId(watchlist.getWatchlistId()).stream()
                .sorted(Comparator.comparingInt(WatchlistItem::getDisplayOrder))
                .map(item -> {
                    Instrument instrument = instrumentRepository.findByInstrumentId(item.getInstrumentId())
                            .orElse(null);
                    return toWatchlistItemResponse(item, instrument);
                })
                .toList();
        return new WatchlistResponse(watchlist.getWatchlistId(), watchlist.getName(), watchlist.getDisplayOrder(), items);
    }

    private WatchlistItemResponse toWatchlistItemResponse(WatchlistItem item, Instrument instrument) {
        if (instrument == null) {
            return new WatchlistItemResponse(
                    item.getItemId(),
                    item.getInstrumentId(),
                    item.getInstrumentId().toString(),
                    "Unknown",
                    "",
                    "",
                    null,
                    0.0,
                    0.0,
                    0.0,
                    null,
                    item.getAddedAt(),
                    item.getDisplayOrder(),
                    List.of()
            );
        }

        // TODO: Integrate with MarketDataService for real-time pricing
        // For now, return placeholder prices
        double lastPrice = 0.0;
        double dayChange = 0.0;
        double dayChangePercent = 0.0;
        OffsetDateTime lastUpdated = null;
        List<IntradayPricePoint> intradayData = new ArrayList<>();

        return new WatchlistItemResponse(
                item.getItemId(),
                instrument.getInstrumentId(),
                instrument.getSymbol(),
                instrument.getDisplayName(),
                instrument.getExchange(),
                instrument.getQuoteCurrency(),
                instrument.getSector(),
                lastPrice,
                dayChange,
                dayChangePercent,
                lastUpdated,
                item.getAddedAt(),
                item.getDisplayOrder(),
                intradayData
        );
    }

    private List<IntradayPricePoint> fetchIntradayData(String symbol) {
        // Placeholder - in real implementation, fetch from market_data table
        // For now, return empty list
        return List.of();
    }
}