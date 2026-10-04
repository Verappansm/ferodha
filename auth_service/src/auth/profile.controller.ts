import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from './current-user.decorator';
import type { AccessTokenClaims } from './access-token-claims';
import { ProfileService } from './profile.service';
import { ProfileResponseDto } from './dto/profile-response.dto';
import { ErrorResponseDto } from './dto/responses.dto';

/**
 * Profile endpoint for retrieving and managing user profiles.
 * All endpoints are protected and return data for the signed-in user only.
 */
@ApiTags('Profile')
@Controller('profile')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get()
  @ApiOperation({
    operationId: 'getProfile',
    summary: 'Get the signed-in user profile with all details.',
  })
  @ApiOkResponse({
    type: ProfileResponseDto,
    description:
      'User profile including name, email, phone, role, trading account, and joining date.',
  })
  @ApiUnauthorizedResponse({
    description: 'User is not authenticated or no longer has an active account.',
    type: ErrorResponseDto,
  })
  async getProfile(
    @CurrentUser() claims: AccessTokenClaims,
  ): Promise<ProfileResponseDto> {
    return this.profileService.getProfile(claims);
  }
}
