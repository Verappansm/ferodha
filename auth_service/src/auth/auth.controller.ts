import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { RegisterRequestDto } from './dto/register-request.dto';
import { LoginRequestDto } from './dto/login-request.dto';
import { RefreshRequestDto } from './dto/refresh-request.dto';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { LoginThrottleGuard } from './login-throttle.guard';
import { CurrentUser } from './current-user.decorator';
import type { AccessTokenClaims } from './access-token-claims';

// `/auth/register` and `/auth/login` are `security: []` in the contract 
//  JwtAuthGuard verifies the token, and @CurrentUser() hands the
 // handler the verified claims - never anything the caller controls.
 
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // 201 with the user, or 409 taken, or 422 invalid input
  @Post('register')
  register(@Body() body: RegisterRequestDto) {
    return this.authService.register(body);
  }

  //200 with a token pair, or 401 with the one indistinguishable body
  @Post('login')
  @UseGuards(LoginThrottleGuard)
  @HttpCode(HttpStatus.OK)
  login(@Body() body: LoginRequestDto) {
    return this.authService.login(body);
  }

  // 200 with a fresh pair - token is spent - or 401
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() body: RefreshRequestDto) {
    return this.authService.refresh(body);
  }

  //200 with the user named by the access token, or 401
  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() claims: AccessTokenClaims) {
    return this.authService.currentUser(claims);
  }
}
