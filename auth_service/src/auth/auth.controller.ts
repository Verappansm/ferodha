import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Logger,
  Optional,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { RegisterRequestDto } from './dto/register-request.dto';
import { LoginRequestDto } from './dto/login-request.dto';
import { RefreshRequestDto } from './dto/refresh-request.dto';
import { ChangePasswordRequestDto } from './dto/change-password-request.dto';
import {
  AccountStatusResponseDto,
  ErrorResponseDto,
  TokenResponseDto,
  UserResponseDto,
} from './dto/responses.dto';
import { AuthService } from './auth.service';
import { EmailVerificationService } from './email-verification.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { LoginAttemptLimiter } from './login-attempt-limiter';
import { clientIp, LoginThrottleGuard } from './login-throttle.guard';
import { CurrentUser } from './current-user.decorator';
import type { AccessTokenClaims } from './access-token-claims';

// `/auth/register`, `/auth/login` and `/auth/refresh` are `security: []` in
// the contract. On `/auth/me`, JwtAuthGuard verifies the token and
// @CurrentUser() hands the handler the verified claims - never anything the
// caller controls.
@ApiTags('Auth')
@ApiUnprocessableEntityResponse({
  description: 'The request failed field validation.',
  type: ErrorResponseDto,
})
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly loginAttempts: LoginAttemptLimiter,
    @Optional()
    private readonly emailVerification?: EmailVerificationService,
  ) {}

  @Post('register')
  @ApiOperation({
    operationId: 'register',
    summary:
      'Register a user and file a pending account-opening request. Issues no tokens; login waits for an admin to approve the account.',
  })
  @ApiCreatedResponse({ type: UserResponseDto })
  @ApiConflictResponse({
    description: 'The username is already taken.',
    type: ErrorResponseDto,
  })
  async register(@Body() body: RegisterRequestDto) {
    const user = await this.authService.register(body);
    // The code proves the email is theirs. If the mail server is down the user
    // is still registered, and asks for another code from the verify page.
    try {
      await this.emailVerification?.issue(user.id, user.username);
    } catch (error) {
      this.logger.error(
        `Verification code for user ${user.id} could not be sent: ${String(error)}`,
      );
    }
    return user;
  }

  @Post('login')
  @UseGuards(LoginThrottleGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'login',
    summary:
      'Log in. Refused until the user owns a trading account. 5 failed attempts per IP lock that IP out for 15 minutes.',
  })
  @ApiOkResponse({ type: TokenResponseDto })
  @ApiUnauthorizedResponse({
    description:
      'Any failure, whatever its cause, including a throttled IP (which also gets Retry-After).',
    type: ErrorResponseDto,
  })
  async login(@Body() body: LoginRequestDto, @Req() request: Request) {
    try {
      return await this.authService.login(body);
    } catch (error) {
      // Only a refused login is a failed guess; a 500 is not the caller's.
      if (
        error instanceof HttpException &&
        error.getStatus() === Number(HttpStatus.UNAUTHORIZED)
      ) {
        this.loginAttempts.recordFailure(clientIp(request));
      }
      throw error;
    }
  }

  @Post('change-password')
  @UseGuards(LoginThrottleGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    operationId: 'changePassword',
    summary:
      'Change the password with the current one. Clears a forced reset and ends every session.',
  })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  async changePassword(
    @Body() body: ChangePasswordRequestDto,
    @Req() request: Request,
  ): Promise<void> {
    try {
      await this.authService.changePassword(body);
    } catch (error) {
      // A wrong current password is a failed guess, counted like a login.
      if (
        error instanceof HttpException &&
        error.getStatus() === Number(HttpStatus.UNAUTHORIZED)
      ) {
        this.loginAttempts.recordFailure(clientIp(request));
      }
      throw error;
    }
  }

  @Post('account-status')
  @UseGuards(LoginThrottleGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'accountStatus',
    summary:
      'The state of the account-opening request, checked with the email and password (no token is issued). Failures count towards the login throttle.',
  })
  @ApiOkResponse({ type: AccountStatusResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  async accountStatus(@Body() body: LoginRequestDto, @Req() request: Request) {
    try {
      return await this.authService.accountStatus(body);
    } catch (error) {
      if (
        error instanceof HttpException &&
        error.getStatus() === Number(HttpStatus.UNAUTHORIZED)
      ) {
        this.loginAttempts.recordFailure(clientIp(request));
      }
      throw error;
    }
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({
    operationId: 'logoutAll',
    summary:
      'Sign out everywhere: revokes every refresh token the user holds, this device included.',
  })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  async logoutAll(@CurrentUser() claims: AccessTokenClaims): Promise<void> {
    await this.authService.logoutEverywhere(claims);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'refresh',
    summary:
      'Exchange a refresh token for a new pair. A reused token revokes its whole login chain.',
  })
  @ApiOkResponse({ type: TokenResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  refresh(@Body() body: RefreshRequestDto) {
    return this.authService.refresh(body);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiTags('Profile')
  @ApiBearerAuth()
  @ApiOperation({
    operationId: 'getCurrentUser',
    summary: 'The user named by the verified access token.',
  })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  me(@CurrentUser() claims: AccessTokenClaims) {
    return this.authService.currentUser(claims);
  }
}
