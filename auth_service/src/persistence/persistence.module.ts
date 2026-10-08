import { Global, Module } from '@nestjs/common';
import { AppConfigModule } from '../config/config.module';
import { AppConfigService } from '../config/config.service';
import { AccountsRepository } from './accounts.repository';
import { createPool, DatabaseService, PG_POOL } from './database.service';
import { EmailOtpsRepository } from './email-otps.repository';
import { RefreshTokensRepository } from './refresh-tokens.repository';
import { UsersRepository } from './users.repository';

/**
 * Everything that talks to Postgres. Global, because the pool and the
 * repositories are infrastructure rather than a feature of any one module.
 * PG_POOL is exported too so that a test - or a future maintenance endpoint -
 * can reach the same pool the service writes through.
 */
@Global()
@Module({
  imports: [AppConfigModule],
  providers: [
    { provide: PG_POOL, useFactory: createPool, inject: [AppConfigService] },
    DatabaseService,
    UsersRepository,
    RefreshTokensRepository,
    AccountsRepository,
    EmailOtpsRepository,
  ],
  exports: [
    PG_POOL,
    UsersRepository,
    RefreshTokensRepository,
    AccountsRepository,
    EmailOtpsRepository,
  ],
})
export class PersistenceModule {}
