import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MaxLength } from 'class-validator';
import { normaliseEmail } from './normalise-email';

/**
 * POST /auth/login body - LoginRequest in contracts/auth-api.yaml.
 *
 * The schema has only required-ness and upper bounds, deliberately: it does
 * NOT declare minLength for either field, so an empty username or an empty
 * password is a schema-valid body whose credentials simply do not match. That
 * is a 401 with the one shared body, reached by paying for a bcrypt
 * comparison - not a 422, which would let validation behave differently from
 * credential checking and start leaking which half of the pair was wrong.
 *
 * Adding `@MinLength` or `@IsNotEmpty` here would answer a request the
 * contract says is valid with VAL-422. Do not.
 */
export class LoginRequestDto {
  /** The registered email address, matched case-insensitively. */
  @ApiProperty({ maxLength: 64, example: 'priya.menon@example.com' })
  @Transform(normaliseEmail)
  @IsString()
  @MaxLength(64)
  username!: string;

  @ApiProperty({
    maxLength: 128,
    writeOnly: true,
    example: 'correct horse battery staple',
  })
  @IsString()
  @MaxLength(128)
  password!: string;
}
