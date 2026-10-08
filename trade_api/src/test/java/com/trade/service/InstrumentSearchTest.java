package com.trade.service;

import com.trade.domain.InstrumentRepository;
import com.trade.dto.PaginatedInstrumentsResponseDto;
import com.trade.exception.InvalidParameterException;
import com.trade.mapper.InstrumentMapper;
import com.trade.mapper.InstrumentRow;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

// LEAP-015: the text matches ticker and name case-insensitively, filters combine, a blank
// filter is no filter, and the choices come from the data.
class InstrumentSearchTest {

    private final InstrumentMapper mapper = mock(InstrumentMapper.class);
    private final InstrumentService service = new InstrumentService(mock(InstrumentRepository.class), mapper);

    @Test
    @DisplayName("the text is lower-cased into one contains-pattern, and filters pass through combined")
    void filtersCombine() throws Exception {
        InstrumentRow apple = new InstrumentRow(UUID.randomUUID(), "AAPL", "Apple Inc.", "EQUITY", "USD", true,
                "NASDAQ", "Technology");
        when(mapper.searchTradable("%app%", "NASDAQ", "Technology", "EQUITY", 20, 0)).thenReturn(List.of(apple));
        when(mapper.countSearchTradable("%app%", "NASDAQ", "Technology", "EQUITY")).thenReturn(1L);

        PaginatedInstrumentsResponseDto page = service.searchInstruments(" App ", "NASDAQ", "Technology", "equity", 20, 0);

        assertEquals(1, page.total());
        assertEquals("AAPL", page.instruments().get(0).symbol());
    }

    @Test
    @DisplayName("a typed % or _ is matched literally, and a blank filter is no filter")
    void wildcardsAreLiteral() throws Exception {
        service.searchInstruments("50%_", " ", null, "", 20, 0);
        verify(mapper).searchTradable(org.mockito.ArgumentMatchers.eq("%50!%!_%"), isNull(), isNull(), isNull(),
                anyInt(), anyLong());
    }

    @Test
    @DisplayName("an unknown type or a bad page is VAL-422, and nothing is queried")
    void invalidInput() {
        assertThrows(InvalidParameterException.class, () -> service.searchInstruments(null, null, null, "OPTION", 20, 0));
        assertThrows(InvalidParameterException.class, () -> service.searchInstruments("a", null, null, null, 0, 0));
        verify(mapper, never()).searchTradable(any(), any(), any(), any(), anyInt(), anyLong());
    }

    @Test
    @DisplayName("the filter choices are the distinct values of the tradable instruments")
    void filtersFromData() {
        when(mapper.distinctTradableExchanges()).thenReturn(List.of("NASDAQ", "NSE"));
        when(mapper.distinctTradableSectors()).thenReturn(List.of("Technology"));
        when(mapper.distinctTradableTypes()).thenReturn(List.of("EQUITY", "ETF"));

        assertEquals(List.of("NASDAQ", "NSE"), service.filters().exchanges());
        assertEquals(List.of("EQUITY", "ETF"), service.filters().types());
    }
}
