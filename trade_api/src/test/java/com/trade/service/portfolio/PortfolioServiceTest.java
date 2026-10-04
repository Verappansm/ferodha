package com.trade.service.portfolio;

import com.trade.client.portfolio.Quote;
import com.trade.client.portfolio.QuoteServiceClient;
import com.trade.dto.portfolio.PnlResponseDto;
import com.trade.dto.portfolio.PortfolioSummaryDto;
import com.trade.dto.portfolio.PricedPositionDto;
import com.trade.exception.AccountNotFoundException;
import com.trade.exception.InvalidAccountAccessException;
import com.trade.mapper.AccountMapper;
import com.trade.mapper.AccountRow;
import com.trade.mapper.PositionMapper;
import com.trade.mapper.PositionRow;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PortfolioServiceTest {

    @Mock
    private AccountMapper accountMapper;

    @Mock
    private PositionMapper positionMapper;

    @Mock
    private QuoteServiceClient quoteServiceClient;

    @InjectMocks
    private PortfolioService portfolioService;

    private AccountRow mockAccount;
    private PositionRow mockPosition;
    private Quote mockQuote;

    @BeforeEach
    void setUp() {
        mockAccount = new AccountRow(
                1L,
                UUID.randomUUID(),
                "ACC-123",
                UUID.randomUUID(),
                "John Doe",
                new BigDecimal("10000.00"),
                "ACTIVE",
                1,
                OffsetDateTime.now(),
                "USD"
        );

        mockPosition = new PositionRow(
                1L,
                "AAPL",
                10L,
                new BigDecimal("150.00")
        );

        mockQuote = new Quote(
                "AAPL",
                new BigDecimal("160.00"),
                new BigDecimal("159.50"),
                new BigDecimal("160.50"),
                "USD",
                Instant.now(),
                false
        );
    }

    @Test
    void testGetPortfolioSummary_EmptyPortfolio() throws Exception {
        when(accountMapper.findById(1L)).thenReturn(Optional.of(mockAccount));
        when(positionMapper.findAllForAccount(1L)).thenReturn(Collections.emptyList());

        PortfolioSummaryDto summary = portfolioService.getPortfolioSummary(1L, 1L);

        assertNotNull(summary);
        assertEquals(1L, summary.accountId());
        assertEquals(new BigDecimal("10000.00"), summary.cashBalance());
        assertEquals(BigDecimal.ZERO, summary.marketValue());
        assertEquals(0, summary.positionCount());
        assertFalse(summary.partial());
    }

    @Test
    void testGetPortfolioSummary_WithPositions() throws Exception {
        when(accountMapper.findById(1L)).thenReturn(Optional.of(mockAccount));
        when(positionMapper.findAllForAccount(1L)).thenReturn(List.of(mockPosition));
        when(quoteServiceClient.fetchQuotes(List.of("AAPL"))).thenReturn(Map.of("AAPL", mockQuote));

        PortfolioSummaryDto summary = portfolioService.getPortfolioSummary(1L, 1L);

        assertNotNull(summary);
        assertEquals(1L, summary.accountId());
        assertEquals(new BigDecimal("10000.00"), summary.cashBalance());
        // 10 * 160 = 1600
        assertEquals(new BigDecimal("1600.00"), summary.marketValue());
        // 10 * 150 = 1500
        assertEquals(new BigDecimal("1500.00"), summary.costBasis());
        // 1600 - 1500 = 100
        assertEquals(new BigDecimal("100.00"), summary.unrealisedPnl());
        assertEquals(1, summary.positionCount());
        assertFalse(summary.partial());
    }

    @Test
    void testGetPortfolioSummary_UnrealisedPnLNegative() throws Exception {
        PositionRow position = new PositionRow(1L, "AAPL", 10L, new BigDecimal("170.00"));
        Quote quote = new Quote("AAPL", new BigDecimal("160.00"), new BigDecimal("159.50"), new BigDecimal("160.50"), "USD", Instant.now(), false);

        when(accountMapper.findById(1L)).thenReturn(Optional.of(mockAccount));
        when(positionMapper.findAllForAccount(1L)).thenReturn(List.of(position));
        when(quoteServiceClient.fetchQuotes(List.of("AAPL"))).thenReturn(Map.of("AAPL", quote));

        PortfolioSummaryDto summary = portfolioService.getPortfolioSummary(1L, 1L);

        // 10 * 160 = 1600, 10 * 170 = 1700, PnL = 1600 - 1700 = -100
        assertEquals(new BigDecimal("-100.00"), summary.unrealisedPnl());
    }

    @Test
    void testGetPortfolioSummary_StaleQuote() throws Exception {
        Quote staleQuote = new Quote("AAPL", new BigDecimal("160.00"), new BigDecimal("159.50"), new BigDecimal("160.50"), "USD", Instant.now(), true);

        when(accountMapper.findById(1L)).thenReturn(Optional.of(mockAccount));
        when(positionMapper.findAllForAccount(1L)).thenReturn(List.of(mockPosition));
        when(quoteServiceClient.fetchQuotes(List.of("AAPL"))).thenReturn(Map.of("AAPL", staleQuote));

        PortfolioSummaryDto summary = portfolioService.getPortfolioSummary(1L, 1L);

        assertTrue(summary.partial());
    }

    @Test
    void testGetPortfolioSummary_MissingQuote() throws Exception {
        when(accountMapper.findById(1L)).thenReturn(Optional.of(mockAccount));
        when(positionMapper.findAllForAccount(1L)).thenReturn(List.of(mockPosition));
        when(quoteServiceClient.fetchQuotes(List.of("AAPL"))).thenReturn(Collections.emptyMap());

        PortfolioSummaryDto summary = portfolioService.getPortfolioSummary(1L, 1L);

        assertTrue(summary.partial());
    }

    @Test
    void testGetPortfolioSummary_AccountNotFound() {
        when(accountMapper.findById(1L)).thenReturn(Optional.empty());

        assertThrows(AccountNotFoundException.class, () ->
                portfolioService.getPortfolioSummary(1L, 1L));
    }

    @Test
    void testGetPortfolioSummary_AccessDenied() {
        when(accountMapper.findById(1L)).thenReturn(Optional.of(mockAccount));

        assertThrows(InvalidAccountAccessException.class, () ->
                portfolioService.getPortfolioSummary(1L, 999L)); // Different account ID
    }

    @Test
    void testGetPricedPositions_SinglePosition() throws Exception {
        when(accountMapper.findById(1L)).thenReturn(Optional.of(mockAccount));
        when(positionMapper.findAllForAccount(1L)).thenReturn(List.of(mockPosition));
        when(quoteServiceClient.fetchQuotes(List.of("AAPL"))).thenReturn(Map.of("AAPL", mockQuote));

        List<PricedPositionDto> positions = portfolioService.getPricedPositions(1L, 1L, null);

        assertNotNull(positions);
        assertEquals(1, positions.size());
        PricedPositionDto pos = positions.get(0);
        assertEquals("AAPL", pos.symbol());
        assertEquals(new BigDecimal("10"), pos.quantity());
        assertEquals(new BigDecimal("150.00"), pos.averageCost());
        assertEquals(new BigDecimal("1600.00"), pos.marketValue());
        assertEquals(new BigDecimal("100.00"), pos.unrealisedPnl());
        assertFalse(pos.stale());
    }

    @Test
    void testGetPricedPositions_FilterBySymbol() throws Exception {
        PositionRow pos1 = new PositionRow(1L, "AAPL", 10L, new BigDecimal("150.00"));
        PositionRow pos2 = new PositionRow(1L, "GOOGL", 5L, new BigDecimal("2800.00"));

        when(accountMapper.findById(1L)).thenReturn(Optional.of(mockAccount));
        when(positionMapper.findAllForAccount(1L)).thenReturn(List.of(pos1, pos2));
        when(quoteServiceClient.fetchQuotes(argThat(list -> list.contains("AAPL")))).thenReturn(Map.of("AAPL", mockQuote));

        List<PricedPositionDto> positions = portfolioService.getPricedPositions(1L, 1L, "AAPL");

        assertEquals(1, positions.size());
        assertEquals("AAPL", positions.get(0).symbol());
    }

    @Test
    void testGetPnL() throws Exception {
        when(accountMapper.findById(1L)).thenReturn(Optional.of(mockAccount));
        when(positionMapper.findAllForAccount(1L)).thenReturn(List.of(mockPosition));
        when(quoteServiceClient.fetchQuotes(List.of("AAPL"))).thenReturn(Map.of("AAPL", mockQuote));

        PnlResponseDto pnl = portfolioService.getPnL(1L, 1L);

        assertNotNull(pnl);
        assertEquals(1L, pnl.accountId());
        assertEquals(new BigDecimal("100.00"), pnl.unrealisedPnl());
        assertEquals(BigDecimal.ZERO, pnl.realisedPnl());
    }

    @Test
    void testGetPnL_EmptyPortfolio() throws Exception {
        when(accountMapper.findById(1L)).thenReturn(Optional.of(mockAccount));
        when(positionMapper.findAllForAccount(1L)).thenReturn(Collections.emptyList());

        PnlResponseDto pnl = portfolioService.getPnL(1L, 1L);

        assertNotNull(pnl);
        assertEquals(BigDecimal.ZERO, pnl.unrealisedPnl());
        assertEquals(BigDecimal.ZERO, pnl.realisedPnl());
        assertEquals(BigDecimal.ZERO, pnl.totalPnl());
    }
}
