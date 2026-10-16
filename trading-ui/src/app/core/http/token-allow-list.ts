import { InjectionToken } from '@angular/core';
import { environment } from '../../../environments/environment';

/**
 * Where the bearer token may go: an origin (scheme, host and port, compared
 * exactly) and the paths on it that require the token. A path ending in `/`
 * covers everything under it; any other path must match exactly.
 *
 * An allow list, not a deny list: a host nobody listed, including every
 * third party added later, never sees the token.
 */
export interface TokenDestination {
  origin: string;
  paths: string[];
}

export const TOKEN_ALLOW_LIST = new InjectionToken<TokenDestination[]>('TOKEN_ALLOW_LIST', {
  providedIn: 'root',
  factory: () => tokenAllowList(environment),
});

export function tokenAllowList(urls: {
  authApiUrl: string;
  tradeApiUrl: string;
}): TokenDestination[] {
  return [
    // Every Trade REST API route is protected.
    destination(urls.tradeApiUrl, ['/api/v1/']),
    // On the Auth service only /auth/me, /auth/logout-all and /profile are
    // protected. /auth/login, /auth/register, /auth/refresh and
    // /auth/account-status are `security: []` and take no header.
    destination(urls.authApiUrl, ['/auth/me', '/auth/logout-all', '/profile']),
  ];
}

/** The API's paths under its base URL, which may carry a path (`/auth-api`). */
function destination(apiUrl: string, paths: string[]): TokenDestination {
  const base = new URL(apiUrl);
  const prefix = base.pathname.replace(/\/$/, '');
  return { origin: base.origin, paths: paths.map((path) => prefix + path) };
}

/** True only when the URL is on a listed origin and a listed path. */
export function mayCarryToken(url: string, allowList: TokenDestination[]): boolean {
  let target: URL;
  try {
    target = new URL(url, document.baseURI);
  } catch {
    return false;
  }
  return allowList.some(
    (destination) =>
      destination.origin === target.origin &&
      destination.paths.some((path) =>
        path.endsWith('/') ? target.pathname.startsWith(path) : target.pathname === path,
      ),
  );
}