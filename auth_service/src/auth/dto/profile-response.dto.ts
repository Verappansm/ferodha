import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '../role.enum';

/**
 * Complete profile response for the signed-in user.
 * Includes all user details, role, trading account, and joining date.
 */
export class ProfileResponseDto {
  @ApiProperty({
    format: 'uuid',
    description: 'The value carried in the `sub` claim.',
  })
  id!: string;

  @ApiProperty({ example: 'Priya Menon' })
  name!: string;

  @ApiProperty({ example: 'priya.menon@example.com' })
  email!: string;

  @ApiPropertyOptional({
    example: '+91 98765 43210',
    description: 'Absent when none is held.',
  })
  phone?: string;

  @ApiProperty({ enum: Role, example: Role.CUSTOMER })
  role!: Role;

  @ApiPropertyOptional({
    format: 'int64',
    description: 'The numeric trading account key, `Accounts.id`.',
    example: 1,
  })
  accountId?: number;

  @ApiProperty({ format: 'date-time', description: 'Account joining date' })
  joiningDate!: string;
}
