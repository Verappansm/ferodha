/**
 * The access token's claim set, as the claims contract in
 * contracts/auth-api.yaml fixes it. The Trade REST API's authorisation check
 * breaks if the shape drifts, so nothing outside this set is ever signed.
 */
export interface AccessTokenClaims {
  /** The user id (a UUID). Stable for the life of the user. */
  sub: string;
  /** The numeric trading account key, `Accounts.id`. */
  accountId: number;
  /** Never empty: CUSTOMER for a trader, ADMIN for an operator. */
  roles: string[];
  /** Issued-at, seconds since the Unix epoch. */
  iat: number;
  /** Expiry, seconds since the Unix epoch; iat + 900 for an access token. */
  exp: number;
  /** Issuer; this service always writes `auth-service`. */
  iss: string;
}
