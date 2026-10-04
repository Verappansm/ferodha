/**
 * Single candle OHLC data point
 */
export interface Candle {
    date?: string;
    open?: number;
    high?: number;
    low?: number;
    close?: number;
    volume?: number | null;
}
