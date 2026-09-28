import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
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
import {
  ErrorResponseDto,
  TokenResponseDto,
  UserResponseDto,
} from './dto/responses.dto';
import { AuthService } from './auth.service';
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
  constructor(
    private readonly authService: AuthService,
    private readonly loginAttempts: LoginAttemptLimiter,
  ) {}

  @Post('register')
  @ApiOperation({
    operationId: 'register',
    summary: 'Register a user. Issues no tokens and opens no trading account.',
  })
  @ApiCreatedResponse({ type: UserResponseDto })
  @ApiConflictResponse({
    description: 'The username is already taken.',
    type: ErrorResponseDto,
  })
  register(@Body() body: RegisterRequestDto) {
    return this.authService.register(body);
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
