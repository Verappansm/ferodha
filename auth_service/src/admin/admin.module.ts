import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PasswordService } from '../auth/password.service';
import { AppConfigModule } from '../config/config.module';
import { PersistenceModule } from '../persistence/persistence.module';
import { AdminAuthController, AdminUsersController } from './admin.controller';
import { AdminJwtGuard } from './admin-jwt.guard';
import {
  AdminLoginAttemptLimiter,
  AdminLoginThrottleGuard,
} from './admin-login-throttle';
import { AdminUsersRepository } from './admin-users.repository';
import { AdminService } from './admin.service';

/**
 * The operations console's half of the auth service (LEAP-011, LEAP-021):
 * admin sign-in and user management. Kept as its own module so it can be
 * reviewed, tested and, if ever needed, deployed apart from customer auth.
 */
@Module({
  imports: [AppConfigModule, PersistenceModule, AuthModule],
  controllers: [AdminAuthController, AdminUsersController],
  providers: [
    AdminService,
    AdminUsersRepository,
    AdminJwtGuard,
    AdminLoginAttemptLimiter,
    AdminLoginThrottleGuard,
    PasswordService,
  ],
})
export class AdminModule {}
