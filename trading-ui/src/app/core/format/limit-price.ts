/** How far past the touch a suggested limit price sits: 0.02%. */
export const LIMIT_BUFFER = 0.0002;

/** The parts of a quote a suggestion needs; any of them may be missing. */
export interface QuoteLike {
  bid?: number | null;
  ask?: number | null;
  mid?: number | null;
}

/**
 * A limit price likely to fill straight away: 0.02% above the ask for a buy,
 * 0.02% below the bid for a sell (the mid when that side is missing), rounded
 * to the cent in the same direction so the buffer is never lost to rounding.
 * Null when the quote has no price at all.
 */
export function suggestedLimitPrice(
  quote: QuoteLike | null | undefined,
  side: 'BUY' | 'SELL',
): number | null {
  if (!quote) return null;
  const base = side === 'BUY' ? (quote.ask ?? quote.mid) : (quote.bid ?? quote.mid);
  if (base == null || !Number.isFinite(base) || base <= 0) return null;
  const cents = side === 'BUY' ? base * (1 + LIMIT_BUFFER) * 100 : base * (1 - LIMIT_BUFFER) * 100;
  // The epsilon keeps 10050.000000001 from rounding up to 10051.
  const rounded = side === 'BUY' ? Math.ceil(cents - 1e-6) : Math.floor(cents + 1e-6);
  return Math.max(rounded, 1) / 100;
}
