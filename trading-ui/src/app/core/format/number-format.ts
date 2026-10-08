import { NumberFormat } from '../../api/preferences-api';

/** What a hidden balance shows instead of its figure. */
export const MASKED = '•••••';

const LOCALE: Record<NumberFormat, string> = {
  // 1,00,000.00 - lakh and crore grouping
  INDIAN: 'en-IN',
  // 100,000.00
  INTERNATIONAL: 'en-US',
};

const formatters = new Map<string, Intl.NumberFormat>();

/**
 * Formats a number the way DecimalPipe does - same digitsInfo,
 * `{minIntegerDigits}.{minFractionDigits}-{maxFractionDigits}`, default
 * '1.0-3' - but grouped the way the customer chose. Null for no value.
 */
export function formatNumber(
  value: number | null | undefined,
  format: NumberFormat,
  digitsInfo = '1.0-3',
): string | null {
  if (value == null || Number.isNaN(value)) return null;
  const key = `${format}|${digitsInfo}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    const [minInt, minFrac, maxFrac] = parseDigits(digitsInfo);
    formatter = new Intl.NumberFormat(LOCALE[format], {
      minimumIntegerDigits: minInt,
      minimumFractionDigits: minFrac,
      maximumFractionDigits: maxFrac,
    });
    formatters.set(key, formatter);
  }
  return formatter.format(value);
}

function parseDigits(digitsInfo: string): [number, number, number] {
  const match = /^(\d+)?\.?(\d+)?-?(\d+)?$/.exec(digitsInfo);
  const minInt = match?.[1] ? Number(match[1]) : 1;
  const minFrac = match?.[2] ? Number(match[2]) : 0;
  const maxFrac = match?.[3] ? Number(match[3]) : Math.max(minFrac, 3);
  return [minInt, minFrac, Math.max(minFrac, maxFrac)];
}
