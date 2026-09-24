import { IsString, MaxLength } from 'class-validator';

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
  /** maxLength 64, and nothing else: no pattern, no minimum. */
  @IsString()
  @MaxLength(64)
  username!: string;

  /** maxLength 128, writeOnly in the contract. */
  @IsString()
  @MaxLength(128)
  password!: string;
}
