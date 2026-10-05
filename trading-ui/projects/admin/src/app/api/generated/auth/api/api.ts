export * from './admin-auth.service';
import { AdminAuthService } from './admin-auth.service';
export * from './admin-users.service';
import { AdminUsersService } from './admin-users.service';
export const APIS = [AdminAuthService, AdminUsersService];
