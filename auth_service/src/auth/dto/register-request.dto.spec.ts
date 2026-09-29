/**
 * The contract's password rules on RegisterRequest: 12 to 128 characters,
 * and length only - no symbol, digit or case requirement, because
 * character-class rules push people towards shorter passwords.
 */
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LoginRequestDto } from './login-request.dto';
import { RegisterRequestDto } from './register-request.dto';

async function passwordErrors(password: unknown) {
  const dto = plainToInstance(RegisterRequestDto, {
    name: 'Spec User',
    username: 'dto.spec@example.com',
    password,
  });
  const errors = await validate(dto);
  return errors.filter((error) => error.property === 'password');
}

describe('RegisterRequestDto password', () => {
  it('rejects 11 characters', async () => {
    expect(await passwordErrors('a'.repeat(11))).not.toHaveLength(0);
  });

  it('accepts exactly 12 characters', async () => {
    expect(await passwordErrors('a'.repeat(12))).toHaveLength(0);
  });

  it('accepts exactly 128 characters', async () => {
    expect(await passwordErrors('a'.repeat(128))).toHaveLength(0);
  });

  it('rejects 129 characters', async () => {
    expect(await passwordErrors('a'.repeat(129))).not.toHaveLength(0);
  });

  it('imposes no character-class rule: lower-case letters only is fine', async () => {
    expect(await passwordErrors('correcthorsebatterystaple')).toHaveLength(0);
  });

  it('rejects a non-string', async () => {
    expect(await passwordErrors(123456789012345)).not.toHaveLength(0);
  });
});

describe('email normalisation', () => {
  it('lower-cases and trims the username on register', () => {
    const dto = plainToInstance(RegisterRequestDto, {
      username: '  Priya.Menon@Example.COM ',
      password: 'a'.repeat(12),
    });
    expect(dto.username).toBe('priya.menon@example.com');
  });

  it('lower-cases the username on login, so either case finds the user', () => {
    const dto = plainToInstance(LoginRequestDto, {
      username: 'Priya.Menon@Example.COM',
      password: 'x',
    });
    expect(dto.username).toBe('priya.menon@example.com');
  });

  it('leaves a non-string alone for the validators to refuse', async () => {
    const dto = plainToInstance(RegisterRequestDto, {
      username: 42,
      password: 'a'.repeat(12),
    });
    const errors = await validate(dto);
    expect(errors.map((error) => error.property)).toContain('username');
  });
});
