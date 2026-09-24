/**
 * The contract's password rules on RegisterRequest: 12 to 128 characters,
 * and length only - no symbol, digit or case requirement, because
 * character-class rules push people towards shorter passwords.
 */
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterRequestDto } from './register-request.dto';

async function passwordErrors(password: unknown) {
  const dto = plainToInstance(RegisterRequestDto, {
    name: 'Spec User',
    username: 'dto.spec@example.com',
    password,
    accountId: 1,
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
