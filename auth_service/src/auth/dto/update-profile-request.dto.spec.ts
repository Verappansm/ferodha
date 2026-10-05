/**
 * PATCH /profile accepts a name and a phone number, and nothing that is not
 * one: an invalid phone is VAL-422 here even if a client skips its own check.
 */
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateProfileRequestDto } from './update-profile-request.dto';

async function errorsFor(body: Record<string, unknown>) {
  const errors = await validate(plainToInstance(UpdateProfileRequestDto, body));
  return errors.map((error) => error.property);
}

describe('UpdateProfileRequestDto', () => {
  it.each(['+91 98765 43210', '020 7946 0000', '(555) 123-4567', '5551234'])(
    'accepts the phone number %s',
    async (phone) => {
      expect(await errorsFor({ phone })).toEqual([]);
    },
  );

  it.each([
    '12345',
    'call me',
    '+91-98765-4321O',
    '555 1234 5678 9012 3456',
    '-5551234',
  ])('rejects %s as a phone number', async (phone) => {
    expect([...new Set(await errorsFor({ phone }))]).toEqual(['phone']);
  });

  it('accepts an empty phone, which removes it', async () => {
    expect(await errorsFor({ phone: '' })).toEqual([]);
  });

  it('rejects a blank or over-long name and trims a good one', async () => {
    expect(await errorsFor({ name: '   ' })).toEqual(['name']);
    expect(await errorsFor({ name: 'a'.repeat(101) })).toEqual(['name']);
    expect(
      plainToInstance(UpdateProfileRequestDto, { name: '  Priya  ' }).name,
    ).toBe('Priya');
  });
});
