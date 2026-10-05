import { passwordDigest, sha256Hex } from './password-digest';

describe('sha256Hex', () => {
  // FIPS 180-4 / NIST test vectors.
  it.each([
    ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    [
      'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    ],
  ])('hashes %j', (message, expected) => {
    expect(sha256Hex(message)).toBe(expected);
  });

  it('hashes a million a', () => {
    expect(sha256Hex('a'.repeat(1_000_000))).toBe(
      'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0',
    );
  });

  it('hashes UTF-8, not UTF-16', () => {
    // Node: crypto.createHash('sha256').update('€', 'utf8') - bytes e2 82 ac
    expect(sha256Hex('€')).toBe('c4cc90ed3d26f12d4b08a75140970a7904035c31cbb4515a83f19b9003c00d1d');
  });
});

describe('passwordDigest', () => {
  it('is 64 lower-case hex characters, never the password itself', () => {
    const digest = passwordDigest('john.carter@example.com', 'seed-password-change-me');
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(digest).not.toContain('seed-password');
  });

  it('normalises the email the way the auth service does', () => {
    expect(passwordDigest('  John.Carter@Example.COM ', 'pw')).toBe(
      passwordDigest('john.carter@example.com', 'pw'),
    );
  });

  it('differs between users with the same password', () => {
    expect(passwordDigest('a@example.com', 'same password!')).not.toBe(
      passwordDigest('b@example.com', 'same password!'),
    );
  });

  it('is the documented label, email and password, joined by colons', () => {
    expect(passwordDigest('a@example.com', 'pw')).toBe(sha256Hex('ferodha-v1:a@example.com:pw'));
  });

  it('matches what the scripts and the seed migration compute for the seed users', () => {
    // Node: sha256('ferodha-v1:john.carter@example.com:seed-password-change-me')
    expect(passwordDigest('john.carter@example.com', 'seed-password-change-me')).toBe(
      'cf918170007a6a5e98938271485d11e959a2bf833834ce2e56feebf5cd7df16e',
    );
  });
});
