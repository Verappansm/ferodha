import { newIdempotencyKey } from './idempotency-key';

describe('newIdempotencyKey', () => {
  it('is a version 4 UUID', () => {
    expect(newIdempotencyKey()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('is different every time', () => {
    expect(newIdempotencyKey()).not.toBe(newIdempotencyKey());
  });

  it('works where crypto.randomUUID does not exist (plain http on a server address)', () => {
    const original = crypto.randomUUID;
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
    try {
      expect(newIdempotencyKey()).toHaveLength(36);
    } finally {
      Object.defineProperty(crypto, 'randomUUID', { value: original, configurable: true });
    }
  });
});
