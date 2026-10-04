/**
 * Response DTO for candle data endpoint
 */
import { Candle } from './candle';

export interface CandlesResponseDto {
    symbol?: string;
    interval?: string;
    candles?: Array<Candle>;
}
