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
    { origin: new URL(urls.tradeApiUrl).origin, paths: ['/api/v1/'] },
    // Only /auth/me is protected on the Auth service. /auth/login,
    // /auth/register and /auth/refresh are `security: []` and take no header.
    { origin: new URL(urls.authApiUrl).origin, paths: ['/auth/me'] },
  ];
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
