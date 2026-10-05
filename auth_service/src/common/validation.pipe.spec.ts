import { ArgumentMetadata } from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
import { createValidationPipe } from './validation.pipe';
import { ValidationException } from './validation.exception';

const SECRET = 'short-secret';

class PasswordOnlyDto {
  @IsString()
  @MinLength(64)
  password!: string;
}

describe('createValidationPipe', () => {
  it('keeps neither the submitted DTO nor the rejected value on the exception', async () => {
    const metadata: ArgumentMetadata = {
      type: 'body',
      metatype: PasswordOnlyDto,
    };

    const thrown = await createValidationPipe()
      .transform({ password: SECRET }, metadata)
      .then(
        () => undefined,
        (error: unknown) => error,
      );

    expect(thrown).toBeInstanceOf(ValidationException);
    const errors = (thrown as ValidationException).validationErrors;
    expect(errors[0].property).toBe('password');
    expect(errors[0].target).toBeUndefined();
    expect(errors[0].value).toBeUndefined();
    expect(JSON.stringify(errors)).not.toContain(SECRET);
  });
});
