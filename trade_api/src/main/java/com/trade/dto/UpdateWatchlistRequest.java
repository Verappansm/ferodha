package com.trade.dto;

public record UpdateWatchlistRequest(
        String name,
        Integer displayOrder
) {
}