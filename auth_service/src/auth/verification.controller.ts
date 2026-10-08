import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiNoContentResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { ErrorResponseDto } from './dto/responses.dto';
import {
  ResendCodeRequestDto,
  VerifyEmailRequestDto,
} from './dto/verify-email-request.dto';
import { EmailVerificationService } from './email-verification.service';

// Both routes are public, like register: the person verifying has no session yet.
@ApiTags('Auth')
@Controller('auth')
export class VerificationController {
  constructor(private readonly verification: EmailVerificationService) {}

  @Post('verify-email')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    operationId: 'verifyEmail',
    summary:
      "Enter the six-digit code mailed at registration. Proves the address is the user's own; an account can be opened only after this.",
  })
  @ApiNoContentResponse({ description: 'The email address is verified.' })
  @ApiUnprocessableEntityResponse({
    description:
      'Wrong, expired or used-up code, or unknown address - one answer for all.',
    type: ErrorResponseDto,
  })
  async verify(@Body() body: VerifyEmailRequestDto): Promise<void> {
    await this.verification.verify(body.username, body.code);
  }

  @Post('resend-code')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    operationId: 'resendVerificationCode',
    summary:
      'Mail a new code (at most one a minute). Always 204, so it never reveals whether an address is registered.',
  })
  @ApiNoContentResponse({ description: 'Accepted.' })
  async resend(@Body() body: ResendCodeRequestDto): Promise<void> {
    await this.verification.resend(body.username);
  }
}
