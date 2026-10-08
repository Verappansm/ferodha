/**
 * What the Trade Executor's rejection reasons (OrderHistoryEntry.
 * rejectionReason) mean for the customer. An unknown code still reads as a
 * sentence rather than a raw constant.
 */
const REJECTION_TEXT: Record<string, string> = {
  NOT_MARKETABLE:
    'The market moved past your limit before the order could fill. A sell fills only at or above your limit when the bid is at or above it, a buy only when the ask is at or below it. Use the suggested price and try again.',
  PRICE_UNAVAILABLE:
    'No market price could be fetched for this instrument just then, so nothing was traded. Try again shortly.',
  INSUFFICIENT_HOLDINGS: 'You no longer held enough units to cover this sell.',
  INSUFFICIENT_FUNDS: 'Your cash did not cover the order and its fee at the fill price.',
  ACCOUNT_NOT_ACTIVE: 'Your account is suspended or closed, so the order was not executed.',
  INSTRUMENT_NOT_TRADABLE: 'This instrument is not tradable right now.',
};

/** The same reasons in a few words, for a table cell. */
const REJECTION_LABEL: Record<string, string> = {
  NOT_MARKETABLE: 'Price moved past your limit',
  PRICE_UNAVAILABLE: 'No market price available',
  INSUFFICIENT_HOLDINGS: 'Not enough units held',
  INSUFFICIENT_FUNDS: 'Not enough cash',
  ACCOUNT_NOT_ACTIVE: 'Account not active',
  INSTRUMENT_NOT_TRADABLE: 'Instrument not tradable',
};

export function rejectionLabel(reason: string | null | undefined): string | null {
  if (!reason) return null;
  return REJECTION_LABEL[reason] ?? 'Rejected by the executor';
}

export function rejectionText(reason: string | null | undefined): string | null {
  if (!reason) return null;
  return REJECTION_TEXT[reason] ?? 'The order was rejected by the trade executor.';
}
