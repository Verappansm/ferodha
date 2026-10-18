package com.trade.watchlist;

import com.trade.domain.Instrument;
import com.trade.domain.InstrumentRepository;
import com.trade.dto.AddWatchlistItemRequest;
import com.trade.dto.BulkAddWatchlistItemsRequest;
import com.trade.dto.CreateWatchlistRequest;
import com.trade.dto.IntradayPricePoint;
import com.trade.dto.PriceAlertDtos;
import com.trade.dto.ReorderWatchlistItemsRequest;
import com.trade.dto.UpdateWatchlistRequest;
import com.trade.dto.WatchlistItemResponse;
import com.trade.dto.WatchlistResponse;
import com.trade.exception.InstrumentNotFoundException;
import com.trade.exception.InvalidRequestException;
import com.trade.exception.WatchlistConflictException;
import com.trade.exception.WatchlistItemNotFoundException;
import com.trade.exception.WatchlistNotFoundException;
import com.trade.service.MarketDataService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class WatchlistService {

    private final WatchlistRepository watchlistRepository;
    private final WatchlistItemRepository watchlistItemRepository;
    private final InstrumentRepository instrumentRepository;
    private final MarketDataService marketDataService;

    public WatchlistService(WatchlistRepository watchlistRepository,
                            WatchlistItemRepository watchlistItemRepository,
                            InstrumentRepository instrumentRepository,
                            MarketDataService marketDataService) {
        this.watchlistRepository = watchlistRepository;
        this.watchlistItemRepository = watchlistItemRepository;
        this.instrumentRepository = instrumentRepository;
        this.marketDataService = marketDataService;
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
        return toWatchlistResponses(watchlistRepository.findByUserId(userId).stream()
                .sorted(Comparator.comparingInt(Watchlist::getDisplayOrder))
                .toList());
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
                OffsetDateTime.now(),
                null,
                null
        );
        watchlistItemRepository.save(item);

        return toItemResponses(List.of(item), false).get(0);
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

        // The one list on screen, so its sparklines come with it (no request per item).
        return toItemResponses(watchlistItemRepository.findByWatchlistId(watchlistId), true);
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

    // Price alert operations (LEAP-007). An alert is ACTIVE once set, TRIGGERED once a quote
    // crosses it (PriceAlertEvaluator), CANCELLED by the customer. Setting it again re-arms it.

    @Transactional
    public PriceAlertDtos.PriceAlertResponse createPriceAlert(UUID userId, PriceAlertDtos.CreatePriceAlertRequest request)
            throws WatchlistNotFoundException, WatchlistItemNotFoundException, InvalidRequestException {
        if (!request.isValid()) {
            throw new InvalidRequestException(
                    "A price alert needs the item, a price above zero with at most two decimals, and ABOVE or BELOW");
        }
        WatchlistItem item = ownedItem(userId, request.itemId());
        watchlistItemRepository.armAlert(item.getItemId(), request.alertPrice(), request.alertDirection());
        return alertResponse(item.getItemId());
    }

    @Transactional
    public PriceAlertDtos.PriceAlertResponse updatePriceAlert(UUID userId, UUID itemId, PriceAlertDtos.UpdatePriceAlertRequest request)
            throws WatchlistNotFoundException, WatchlistItemNotFoundException, InvalidRequestException {
        if (!request.isValid()) {
            throw new InvalidRequestException(
                    "Give a price above zero with at most two decimals and ABOVE or BELOW, or neither to cancel");
        }
        WatchlistItem item = ownedItem(userId, itemId);
        if (request.isCancel()) {
            watchlistItemRepository.cancelAlert(item.getItemId());
        } else {
            watchlistItemRepository.armAlert(item.getItemId(), request.alertPrice(), request.alertDirection());
        }
        return alertResponse(item.getItemId());
    }

    @Transactional
    public void deletePriceAlert(UUID userId, UUID itemId)
            throws WatchlistNotFoundException, WatchlistItemNotFoundException {
        WatchlistItem item = ownedItem(userId, itemId);
        watchlistItemRepository.cancelAlert(item.getItemId());
    }

    /** The item, if it is in a watchlist the user owns; another user's item reads as not found. */
    private WatchlistItem ownedItem(UUID userId, UUID itemId)
            throws WatchlistItemNotFoundException, WatchlistNotFoundException {
        WatchlistItem item = watchlistItemRepository.findById(itemId)
                .orElseThrow(() -> new WatchlistItemNotFoundException(itemId.toString()));
        watchlistRepository.findById(item.getWatchlistId())
                .filter(w -> w.getUserId().equals(userId))
                .orElseThrow(() -> new WatchlistNotFoundException(item.getWatchlistId().toString()));
        return item;
    }

    private PriceAlertDtos.PriceAlertResponse alertResponse(UUID itemId) throws WatchlistItemNotFoundException {
        WatchlistItem item = watchlistItemRepository.findById(itemId)
                .orElseThrow(() -> new WatchlistItemNotFoundException(itemId.toString()));
        Instrument instrument = instrumentRepository.findByInstrumentId(item.getInstrumentId()).orElse(null);
        return new PriceAlertDtos.PriceAlertResponse(
                item.getItemId(),
                instrument != null ? instrument.getSymbol() : item.getInstrumentId().toString(),
                instrument != null ? instrument.getDisplayName() : "Unknown",
                item.getAlertPrice(),
                item.getAlertDirection(),
                item.getAlertStatus(),
                item.getAlertTriggeredAt(),
                item.getAlertTriggeredPrice());
    }

    // Helper methods

    private WatchlistResponse toWatchlistResponse(Watchlist watchlist) {
        return toWatchlistResponses(List.of(watchlist)).get(0);
    }

    // The items of every watchlist in one query, then their instruments and prices
    // through toItemResponses: a fixed handful of queries however many lists and items
    // there are, instead of several per item.
    private List<WatchlistResponse> toWatchlistResponses(List<Watchlist> watchlists) {
        if (watchlists.isEmpty()) {
            return List.of();
        }
        List<WatchlistItem> allItems = watchlistItemRepository.findByWatchlistIds(
                watchlists.stream().map(Watchlist::getWatchlistId).toList());
        Map<UUID, WatchlistItemResponse> responses = toItemResponses(allItems, false).stream()
                .collect(Collectors.toMap(WatchlistItemResponse::itemId, response -> response));
        Map<UUID, List<WatchlistItem>> itemsByList = allItems.stream()
                .collect(Collectors.groupingBy(WatchlistItem::getWatchlistId));
        return watchlists.stream()
                .map(watchlist -> new WatchlistResponse(
                        watchlist.getWatchlistId(),
                        watchlist.getName(),
                        watchlist.getDisplayOrder(),
                        itemsByList.getOrDefault(watchlist.getWatchlistId(), List.of()).stream()
                                .sorted(Comparator.comparingInt(WatchlistItem::getDisplayOrder))
                                .map(item -> responses.get(item.getItemId()))
                                .toList()))
                .toList();
    }

    // One query for the instruments and two for the prices of all the items, sorted by
    // display order, plus one for the day's minute closes when withIntraday. Only a
    // tradable instrument is priced, as on the instrument page.
    private List<WatchlistItemResponse> toItemResponses(List<WatchlistItem> items, boolean withIntraday) {
        if (items.isEmpty()) {
            return List.of();
        }
        Set<UUID> instrumentIds = items.stream().map(WatchlistItem::getInstrumentId).collect(Collectors.toSet());
        Map<UUID, Instrument> instruments = instrumentRepository.findByInstrumentIds(instrumentIds);
        List<String> tradableSymbols = instruments.values().stream()
                .filter(Instrument::isTradable)
                .map(Instrument::getSymbol)
                .toList();
        Map<String, MarketDataService.PriceMove> moves = marketDataService.getPriceMoves(tradableSymbols);
        Map<String, List<IntradayPricePoint>> intraday = withIntraday
                ? marketDataService.getIntradayCloses(tradableSymbols)
                : Map.of();
        return items.stream()
                .sorted(Comparator.comparingInt(WatchlistItem::getDisplayOrder))
                .map(item -> {
                    Instrument instrument = instruments.get(item.getInstrumentId());
                    boolean priced = instrument != null && instrument.isTradable();
                    String symbol = priced ? instrument.getSymbol().toUpperCase() : null;
                    return toWatchlistItemResponse(item, instrument, priced ? moves.get(symbol) : null,
                            priced ? intraday.getOrDefault(symbol, List.of()) : List.of());
                })
                .toList();
    }

    private WatchlistItemResponse toWatchlistItemResponse(WatchlistItem item, Instrument instrument,
                                                          MarketDataService.PriceMove move,
                                                          List<IntradayPricePoint> intradayData) {
        if (instrument == null) {
            return new WatchlistItemResponse(
                    item.getItemId(), item.getInstrumentId(), item.getInstrumentId().toString(), "Unknown",
                    "", "", null, 0.0, 0.0, 0.0, null, item.getAddedAt(), item.getDisplayOrder(), List.of(),
                    item.getAlertPrice(), item.getAlertDirection(), item.getAlertStatus(),
                    item.getAlertTriggeredAt(), item.getAlertTriggeredPrice());
        }

        // The latest price and the day's move from the previous close. No price leaves
        // the figures at zero, and the screen asks for live prices on its own.
        double lastPrice = 0.0;
        double dayChange = 0.0;
        double dayChangePercent = 0.0;
        OffsetDateTime lastUpdated = null;
        if (move != null && move.price() != null) {
            lastPrice = move.price().doubleValue();
            lastUpdated = move.asOf();
            if (move.previousClose() != null && move.previousClose().signum() > 0) {
                BigDecimal change = move.price().subtract(move.previousClose());
                dayChange = change.doubleValue();
                dayChangePercent = change.multiply(BigDecimal.valueOf(100))
                        .divide(move.previousClose(), 4, RoundingMode.HALF_UP).doubleValue();
            }
        }

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
                intradayData,
                item.getAlertPrice(),
                item.getAlertDirection(),
                item.getAlertStatus(),
                item.getAlertTriggeredAt(),
                item.getAlertTriggeredPrice()
        );
    }
}
