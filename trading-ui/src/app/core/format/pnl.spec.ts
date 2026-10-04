import { pnlDirection, pnlSign, pnlWord } from './pnl';

describe('pnl formatting', () => {
  it('names a gain, a loss and no change in words as well as signs', () => {
    expect([pnlWord(12.5), pnlSign(12.5)]).toEqual(['Gain', '+']);
    expect([pnlWord(-3), pnlSign(-3)]).toEqual(['Loss', '−']);
    expect([pnlWord(0), pnlSign(0)]).toEqual(['No change', '']);
  });

  it('treats a missing figure as flat', () => {
    expect(pnlDirection(null)).toBe('flat');
    expect(pnlDirection(undefined)).toBe('flat');
  });
});
