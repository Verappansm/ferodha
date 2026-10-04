import { Injectable, Logger } from '@nestjs/common';
import { AccountsRepository } from '../persistence/accounts.repository';
import { UsersRepository, AuthUser } from '../persistence/users.repository';
import { unauthorised } from '../common/error-envelope';
import { AccessTokenClaims } from './access-token-claims';
import { ProfileResponseDto } from './dto/profile-response.dto';
import { Role } from './role.enum';

@Injectable()
export class ProfileService {
  private readonly logger = new Logger(ProfileService.name);

  constructor(
    private readonly users: UsersRepository,
    private readonly accounts: AccountsRepository,
  ) {}

  /**
   * GET /profile - Returns the complete profile of the signed-in user.
   * Reads user from the verified token only.
   *
   * @param claims - The verified JWT claims from the access token
   * @returns The user's full profile including name, email, phone, role, account, and joining date
   * @throws unauthorised() if the user is not ACTIVE
   */
  async getProfile(claims: AccessTokenClaims): Promise<ProfileResponseDto> {
    const user = await this.users.findById(claims.sub);

    if (!user || user.status !== 'ACTIVE') {
      throw unauthorised();
    }

    // Get the trading account if one exists for this user
    const accountId = await this.accounts.findAccountIdForUser(user.id);

    this.logger.log(`Profile retrieved for user ${user.id}`);

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.roles[0] || Role.CUSTOMER,
      accountId: accountId ?? undefined,
      joiningDate: user.createdAt.toISOString(),
    };
  }
}
