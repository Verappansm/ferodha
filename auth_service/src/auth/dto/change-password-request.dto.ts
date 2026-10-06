import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { normaliseEmail } from './normalise-email';

/**
 * POST /auth/change-password body (LEAP-010, and the second half of an
 * admin's forced reset). The current password is the credential, so the route
 * needs no token: a user whose reset was forced has none. The new password
 * takes the registration length rule.
 */
export class ChangePasswordRequestDto {
  @ApiProperty({ maxLength: 64, example: 'priya.menon@example.com' })
  @Transform(normaliseEmail)
  @IsString()
  @MaxLength(64)
  username!: string;

  @ApiProperty({ maxLength: 128, writeOnly: true })
  @IsString()
  @MaxLength(128)
  currentPassword!: string;

  @ApiProperty({ minLength: 12, maxLength: 128, writeOnly: true })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  newPassword!: string;
}
