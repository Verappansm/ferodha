import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** ReasonRequest in contracts/admin-auth-api.yaml: recorded in the audit log. */
export class ReasonRequestDto {
  @ApiProperty({ minLength: 3, maxLength: 500 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

/** GET /admin/users query parameters. */
export class ListUsersQueryDto {
  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ enum: ['PENDING', 'ACTIVE', 'SUSPENDED', 'CLOSED'] })
  @IsOptional()
  @IsIn(['PENDING', 'ACTIVE', 'SUSPENDED', 'CLOSED'])
  status?: 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'CLOSED';

  @ApiPropertyOptional({ enum: ['client', 'admin', 'analyst', 'advisor'] })
  @IsOptional()
  @IsIn(['client', 'admin', 'analyst', 'advisor'])
  role?: 'client' | 'admin' | 'analyst' | 'advisor';

  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  size?: number;
}
