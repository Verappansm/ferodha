import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '../role.enum';

/*
 * Response shapes, as classes so the OpenAPI document can describe them. The
 * service returns plain objects of the same shape (see auth.service.ts).
 */

export class UserResponseDto {
  @ApiProperty({
    format: 'uuid',
    description: 'The value carried in the `sub` claim.',
  })
  id!: string;

  @ApiProperty({ example: 'priya.menon@example.com' })
  username!: string;

  @ApiPropertyOptional({
    format: 'int64',
    description:
      'The numeric trading account key, `Accounts.id`. Absent until an account has been opened for the user, so never present on the registration response.',
    example: 1,
  })
  accountId?: number;

  @ApiProperty({ enum: Role, isArray: true, example: [Role.CUSTOMER] })
  roles!: Role[];

  @ApiProperty({ format: 'date-time' })
  createdOn!: string;
}

export class TokenResponseDto {
  @ApiProperty({
    description:
      'HS256 JWT carrying exactly sub, accountId, roles, iat, exp and iss.',
  })
  accessToken!: string;

  @ApiProperty({
    description: 'Opaque, stored as a hash, single use, rotated on refresh.',
  })
  refreshToken!: string;

  @ApiProperty({ enum: ['Bearer'] })
  tokenType!: 'Bearer';

  @ApiProperty({
    description: 'Access token lifetime in seconds.',
    example: 900,
  })
  expiresIn!: number;
}

export class ErrorResponseDto {
  @ApiProperty({
    enum: ['AUTH-401', 'AUTH-409', 'VAL-422', 'INTERNAL-500'],
    example: 'AUTH-401',
  })
  errorCode!: string;

  @ApiProperty({ example: 'Unauthorised' })
  message!: string;
}

export class AccountStatusResponseDto {
  @ApiProperty({
    enum: ['PENDING', 'APPROVED', 'REJECTED', 'NONE'],
    description:
      'The latest account-opening request. NONE when no request was ever filed for the user.',
  })
  status!: 'PENDING' | 'APPROVED' | 'REJECTED' | 'NONE';

  @ApiPropertyOptional({
    nullable: true,
    description: 'Why the request was rejected; null otherwise.',
  })
  reason!: string | null;

  @ApiProperty({
    description:
      'Whether the code mailed at registration has been entered. Approval waits for it.',
  })
  emailVerified!: boolean;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  requestedAt!: string | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  decidedAt!: string | null;
}
