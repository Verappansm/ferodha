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

  @ApiPropertyOptional({ example: '+1-555-1234', description: 'User phone number' })
  phone?: string;

  @ApiProperty({ enum: Role, isArray: true, example: [Role.CUSTOMER] })
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
