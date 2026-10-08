import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength } from 'class-validator';
import { normaliseEmail } from './normalise-email';

/** POST /auth/verify-email body: the address and the six-digit code mailed to it. */
export class VerifyEmailRequestDto {
  @ApiProperty({ maxLength: 64, example: 'priya.menon@example.com' })
  @Transform(normaliseEmail)
  @IsString()
  @MaxLength(64)
  username!: string;

  @ApiProperty({ pattern: '^[0-9]{6}$', example: '482913' })
  @IsString()
  @Matches(/^[0-9]{6}$/)
  code!: string;
}

/** POST /auth/resend-code body. */
export class ResendCodeRequestDto {
  @ApiProperty({ maxLength: 64, example: 'priya.menon@example.com' })
  @Transform(normaliseEmail)
  @IsString()
  @MaxLength(64)
  username!: string;
}
