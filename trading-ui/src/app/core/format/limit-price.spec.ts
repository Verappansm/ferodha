import { suggestedLimitPrice } from './limit-price';

describe('suggestedLimitPrice', () => {
  it('buys 0.02% above the ask, rounded up to the cent', () => {
    // 100.00 * 1.0002 = 100.02
    expect(suggestedLimitPrice({ bid: 99.9, ask: 100, mid: 99.95 }, 'BUY')).toBe(100.02);
    // 231.37 * 1.0002 = 231.416274 -> 231.42
    expect(suggestedLimitPrice({ ask: 231.37 }, 'BUY')).toBe(231.42);
  });

  it('sells 0.02% below the bid, rounded down to the cent', () => {
    // 100.00 * 0.9998 = 99.98
    expect(suggestedLimitPrice({ bid: 100, ask: 100.1 }, 'SELL')).toBe(99.98);
    // 231.37 * 0.9998 = 231.323726 -> 231.32
    expect(suggestedLimitPrice({ bid: 231.37 }, 'SELL')).toBe(231.32);
  });

  it('falls back to the mid when that side of the quote is missing', () => {
    expect(suggestedLimitPrice({ mid: 50 }, 'BUY')).toBe(50.01);
    expect(suggestedLimitPrice({ mid: 50 }, 'SELL')).toBe(49.99);
  });

  it('suggests nothing without a price', () => {
    expect(suggestedLimitPrice(null, 'BUY')).toBeNull();
    expect(suggestedLimitPrice({ bid: null, ask: null, mid: null }, 'SELL')).toBeNull();
  });
});
