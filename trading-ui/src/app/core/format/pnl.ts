/** Which way a profit-and-loss figure went. */
export type PnlDirection = 'gain' | 'loss' | 'flat';

export function pnlDirection(amount: number | null | undefined): PnlDirection {
  if (amount == null || amount === 0) return 'flat';
  return amount > 0 ? 'gain' : 'loss';
}

/**
 * The word shown beside every gain or loss, so the direction never depends
 * on colour alone.
 */
export function pnlWord(amount: number | null | undefined): string {
  return { gain: 'Gain', loss: 'Loss', flat: 'No change' }[pnlDirection(amount)];
}

/** `+` or `−` (a real minus sign) for a signed amount, nothing for zero. */
export function pnlSign(amount: number | null | undefined): string {
  return { gain: '+', loss: '−', flat: '' }[pnlDirection(amount)];
}
