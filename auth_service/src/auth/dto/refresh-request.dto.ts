import { IsString } from 'class-validator';

/**
 * POST /auth/refresh body - RefreshRequest in the contract.
 *
 * Shape only: whether the token is known, live and unrotated is an
 * authentication question, and every authentication failure here must come
 * back as the same AUTH-401 rather than as a hint about which part was wrong.
 */
export class RefreshRequestDto {
  @IsString()
  refreshToken!: string;
}
