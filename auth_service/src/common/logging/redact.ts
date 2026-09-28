/**
 * Redaction by key name, at any depth.
 *
 * A key is sensitive when its normalised name (lower-case, letters and
 * digits only - so `password`, `Password`, `new_password`, `x-api-key` all
 * normalise the same way) contains one of the fragments below. Matching on
 * fragments rather than an exact list means `currentPassword`,
 * `passwordHash`, `refreshToken` and `jwtSecret` are caught without anyone
 * remembering to add them.
 */
const SENSITIVE_FRAGMENTS = [
  'password',
  'passwd',
  'passphrase',
  'secret',
  'token',
  'authorization',
  'cookie',
  'apikey',
  'credential',
];

export const REDACTED = '[REDACTED]';

function normaliseKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function isSensitiveKey(key: string): boolean {
  const normalised = normaliseKey(key);
  return SENSITIVE_FRAGMENTS.some((fragment) => normalised.includes(fragment));
}

/**
 * Returns a redacted copy - the input is never mutated, so the caller's
 * objects (a request, a DTO) keep their real values.
 *
 * Walks plain objects, arrays, Maps and Error properties with no depth
 * limit; cycles become '[Circular]' instead of overflowing the stack.
 */
export function redact(value: unknown): unknown {
  return walk(value, new WeakSet<object>());
}

function walk(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (value instanceof Date || value instanceof RegExp) {
    return value;
  }
  if (seen.has(value)) {
    return '[Circular]';
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => walk(item, seen));
  }

  if (value instanceof Map) {
    const copy = new Map<unknown, unknown>();
    for (const [key, item] of value) {
      copy.set(
        key,
        typeof key === 'string' && isSensitiveKey(key)
          ? REDACTED
          : walk(item, seen),
      );
    }
    return copy;
  }

  const source =
    value instanceof Error
      ? {
          ...value,
          name: value.name,
          message: value.message,
          stack: value.stack,
        }
      : value;

  const copy: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(source)) {
    copy[key] = isSensitiveKey(key) ? REDACTED : walk(item, seen);
  }
  return copy;
}
