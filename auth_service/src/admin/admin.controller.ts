import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { LoginRequestDto } from '../auth/dto/login-request.dto';
import { clientIp } from '../auth/login-throttle.guard';
import { AdminJwtGuard, type AdminRequest } from './admin-jwt.guard';
import {
  AdminLoginAttemptLimiter,
  AdminLoginThrottleGuard,
} from './admin-login-throttle';
import { ListUsersQueryDto, ReasonRequestDto } from './admin.dto';
import { AdminService } from './admin.service';

/** POST /auth/admin/login: security [] in the contract, so no guard but the throttle. */
@ApiTags('AdminAuth')
@Controller('auth/admin')
export class AdminAuthController {
  constructor(
    private readonly admin: AdminService,
    private readonly attempts: AdminLoginAttemptLimiter,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AdminLoginThrottleGuard)
  @ApiOperation({
    operationId: 'adminLogin',
    summary: 'Sign an administrator in to the operations console',
  })
  async login(@Body() body: LoginRequestDto, @Req() request: Request) {
    try {
      return await this.admin.login(body.username, body.password);
    } catch (error) {
      if (
        error instanceof HttpException &&
        error.getStatus() === Number(HttpStatus.UNAUTHORIZED)
      ) {
        this.attempts.recordFailure(clientIp(request));
      }
      throw error;
    }
  }
}

/** /admin/**: every route needs an admin console token. */
@ApiTags('AdminUsers')
@ApiBearerAuth()
@UseGuards(AdminJwtGuard)
@Controller('admin')
export class AdminUsersController {
  constructor(private readonly admin: AdminService) {}

  @Get('me')
  @ApiOperation({ operationId: 'getAdminProfile' })
  me(@Req() request: AdminRequest) {
    return this.admin.profile(request.admin.sub);
  }

  @Get('users')
  @ApiOperation({ operationId: 'listUsers' })
  list(@Query() query: ListUsersQueryDto) {
    return this.admin.list(
      {
        q: query.q?.trim() || undefined,
        status: query.status,
        role: query.role,
      },
      query.page ?? 0,
      query.size ?? 25,
    );
  }

  @Post('users/:id/suspend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: 'suspendUser' })
  suspend(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: ReasonRequestDto,
    @Req() request: AdminRequest,
  ) {
    return this.admin.suspend(request.admin.sub, id, body.reason);
  }

  @Post('users/:id/reactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: 'reactivateUser' })
  reactivate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: ReasonRequestDto,
    @Req() request: AdminRequest,
  ) {
    return this.admin.reactivate(request.admin.sub, id, body.reason);
  }

  @Post('users/:id/force-password-reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: 'forcePasswordReset' })
  forceReset(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: ReasonRequestDto,
    @Req() request: AdminRequest,
  ) {
    return this.admin.forcePasswordReset(request.admin.sub, id, body.reason);
  }
}
