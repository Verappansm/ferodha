import { Injectable, Logger } from '@nestjs/common';
import { AccountsRepository } from '../persistence/accounts.repository';
import { UsersRepository, AuthUser } from '../persistence/users.repository';
import { unauthorised } from '../common/error-envelope';
import { AccessTokenClaims } from './access-token-claims';
import { ProfileResponseDto } from './dto/profile-response.dto';
import { UpdateProfileRequestDto } from './dto/update-profile-request.dto';
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
    return this.toProfile(await this.activeUser(claims));
  }

  /**
   * PATCH /profile - changes the signed-in user's name and phone, read from
   * the verified token only, and returns the updated profile.
   */
  async updateProfile(
    claims: AccessTokenClaims,
    changes: UpdateProfileRequestDto,
  ): Promise<ProfileResponseDto> {
    const user = await this.activeUser(claims);
    const updated = await this.users.updateProfile(user.id, {
      name: changes.name,
      phone: changes.phone === undefined ? undefined : changes.phone || null,
    });
    if (!updated) {
      throw unauthorised();
    }
    this.logger.log(`Profile updated for user ${user.id}`);
    return this.toProfile(updated);
  }

  private async activeUser(claims: AccessTokenClaims): Promise<AuthUser> {
    const user = await this.users.findById(claims.sub);
    if (!user || user.status !== 'ACTIVE') {
      throw unauthorised();
    }
    return user;
  }

  private async toProfile(user: AuthUser): Promise<ProfileResponseDto> {
    // The trading account, if one has been opened for this user.
    const accountId = await this.accounts.findAccountIdForUser(user.id);

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
