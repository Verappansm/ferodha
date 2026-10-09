import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

/**
 * Digits with optional spaces, dashes and brackets and an optional leading
 * +, starting and ending on a digit (or an opening bracket), and at most 20
 * characters (`Users.phone_number` is VARCHAR(20)). The trading UI applies
 * the same rule before it sends anything.
 */
export const PHONE_PATTERN = /^\+?\(?[0-9][0-9 ()-]{5,18}[0-9]$/;

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * PATCH /profile body (contracts/profile-api.yaml). Only the name and phone can
 * change; the email, role and account are not editable here. An omitted
 * field is left as it is; an empty `phone` clears it.
 */
export class UpdateProfileRequestDto {
  @ApiPropertyOptional({ maxLength: 100, example: 'Priya Menon' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({
    maxLength: 20,
    pattern: PHONE_PATTERN.source,
    example: '+91 98765 43210',
    description: 'Empty to remove the phone number.',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(20)
  @Matches(new RegExp(`^$|${PHONE_PATTERN.source}`))
  phone?: string;
}
