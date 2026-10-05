import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Role } from '../role.enum';
import { normaliseEmail } from './normalise-email';

/**
 * POST /auth/register body - RegisterRequest in contracts/auth-api.yaml, with
 * the departures recorded in story_docs/contract-breach.md: the username is an
 * email address, `name` is an optional extra, and there is no `accountId`
 * because a user is registered before any trading account is opened for them.
 *
 * The global ValidationPipe runs with whitelist + forbidNonWhitelisted, so an
 * undeclared field is a VAL-422 rather than a silently ignored property.
 */
export class RegisterRequestDto {
  /**
   * The username this service accepts is an email address (`Users.email`,
   * UNIQUE). Stored lower-cased, so `Priya@Example.com` and
   * `priya@example.com` are one user.
   */
  @ApiProperty({
    format: 'email',
    maxLength: 64,
    example: 'priya.menon@example.com',
  })
  @Transform(normaliseEmail)
  @IsEmail()
  @MaxLength(64)
  username!: string;

  /** Length only: no symbol rule that pushes people towards shorter passwords. */
  @ApiProperty({
    minLength: 12,
    maxLength: 128,
    writeOnly: true,
    example: 'correct horse battery staple',
  })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;

  /**
   * Display name for `Users.name`, which is NOT NULL. Optional so that a
   * client built from the contract, which has no such field, can still
   * register; without it the part of the email before the @ is used.
   */
  @ApiPropertyOptional({ maxLength: 100, example: 'Priya Menon' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  /**
   * Accepted because the contract allows it, validated, then ignored: this
   * route is public, and a self-declared ADMIN would be privilege escalation.
   * Everyone who registers is a CUSTOMER.
   */
  @ApiPropertyOptional({
    enum: Role,
    isArray: true,
    description: 'Ignored. Every self-registered user is CUSTOMER.',
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(Role, { each: true })
  roles?: Role[];
}
