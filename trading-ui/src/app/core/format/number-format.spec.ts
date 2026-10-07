import { formatNumber } from './number-format';

describe('formatNumber', () => {
  it('groups in lakhs and crores in the Indian format', () => {
    expect(formatNumber(10000000.5, 'INDIAN', '1.2-2')).toBe('1,00,00,000.50');
  });

  it('groups in thousands in the international format', () => {
    expect(formatNumber(10000000.5, 'INTERNATIONAL', '1.2-2')).toBe('10,000,000.50');
  });

  it('follows DecimalPipe digitsInfo, defaulting to 1.0-3', () => {
    expect(formatNumber(1.23456, 'INTERNATIONAL', '1.2-4')).toBe('1.2346');
    expect(formatNumber(1.5, 'INTERNATIONAL')).toBe('1.5');
    expect(formatNumber(42, 'INTERNATIONAL', '1.0-0')).toBe('42');
  });

  it('has no text for no value', () => {
    expect(formatNumber(null, 'INDIAN')).toBeNull();
    expect(formatNumber(undefined, 'INDIAN')).toBeNull();
  });
});
