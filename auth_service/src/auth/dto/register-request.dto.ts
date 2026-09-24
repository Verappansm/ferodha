import {
  ArrayNotEmpty,
  IsArray,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  Min,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Role } from '../role.enum';

/**
 * POST /auth/register body - RegisterRequest in contracts/auth-api.yaml,
 * including its `additionalProperties: false` (the global ValidationPipe is
 * configured with whitelist + forbidNonWhitelisted, so an undeclared field is
 * a VAL-422 rather than a silently ignored extra property).
 *
 * The decorators mirror the schema except where this service reads the
 * username as an email and takes a display `name` (both fields say why):
 * for the password, length beats character-class rules, so there is no
 * symbol requirement that would push users towards a shorter one.
 */
export class RegisterRequestDto {
  /**
   * The account holder's display name. Not part of the contract's
   * RegisterRequest - added because the platform's `Users.name` is NOT NULL
   * and a person should not be registered (or greeted) under their email
   * address. Stored verbatim; this API never returns it (UserResponse has
   * no name field - `additionalProperties: false` keeps it that way).
   */
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  /**
   * The username this service accepts IS an email address - `Users.email`,
   * UNIQUE. The field keeps the contract's `username` name; the contract's
   * username pattern is reference-only here, since it would reject every
   * value this API actually takes (`@` is not in its character class).
   * maxLength 64 from the contract still holds.
   */
  @IsEmail()
  @MaxLength(64)
  username!: string;

  /** minLength 12, maxLength 128, writeOnly in the contract. */
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;

  /** The numeric trading account key, `Accounts.id`; minimum 1. */
  @IsInt()
  @Min(1)
  accountId!: number;

  /**
   * Optional in the schema - and accepted, validated, then ignored. The route
   * is `security: []`: no caller of it has proved anything, so a self-declared
   * `ADMIN` would be privilege escalation. Everyone who registers is pinned to
   * the `client` role (see UsersRepository.create), which reads back as
   * CUSTOMER.
   */
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(Role, { each: true })
  roles?: Role[];
}
