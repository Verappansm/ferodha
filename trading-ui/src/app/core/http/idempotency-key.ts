/**
 * A new idempotency key: a random (version 4) UUID.
 *
 * Built from crypto.getRandomValues rather than crypto.randomUUID: randomUUID
 * exists only in a secure context, and the UI is also opened over plain http on
 * a server address (EC2), where calling it throws and the order never leaves
 * the page.
 */
export function newIdempotencyKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
