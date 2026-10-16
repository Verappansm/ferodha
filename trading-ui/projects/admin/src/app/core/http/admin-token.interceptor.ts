import { HttpInterceptorFn } from '@angular/common/http';
import { inject, InjectionToken } from '@angular/core';
import { environment } from '../../../environments/environment';
import { AdminSession } from '../session/admin-session';

/** An origin (compared exactly) and the paths on it that take the admin token. */
export interface TokenDestination {
  origin: string;
  /** A path ending in `/` covers everything under it; any other must match exactly. */
  paths: string[];
}

export function adminTokenAllowList(urls: {
  authApiUrl: string;
  tradeApiUrl: string;
}): TokenDestination[] {
  return [
    destination(urls.tradeApiUrl, ['/api/v1/admin/']),
    // /admin/... only: /auth/admin/login takes no header.
    destination(urls.authApiUrl, ['/admin/']),
  ];
}

/** The API's paths under its base URL, which may carry a path (`/auth-api`). */
function destination(apiUrl: string, paths: string[]): TokenDestination {
  const base = new URL(apiUrl);
  const prefix = base.pathname.replace(/\/$/, '');
  return { origin: base.origin, paths: paths.map((path) => prefix + path) };
}

export const ADMIN_TOKEN_ALLOW_LIST = new InjectionToken<TokenDestination[]>(
  'ADMIN_TOKEN_ALLOW_LIST',
  { providedIn: 'root', factory: () => adminTokenAllowList(environment) },
);

export function mayCarryAdminToken(url: string, allowList: TokenDestination[]): boolean {
  let target: URL;
  try {
    target = new URL(url, document.baseURI);
  } catch {
    return false;
  }
  return allowList.some(
    (d) =>
      d.origin === target.origin &&
      d.paths.some((p) =>
        p.endsWith('/') ? target.pathname.startsWith(p) : target.pathname === p,
      ),
  );
}

/**
 * The only place in the console that sets an Authorization header, registered
 * once in app.config.ts. The admin token goes to the admin routes of the two
 * platform services and nowhere else, not even to their customer routes.
 */
export const adminTokenInterceptor: HttpInterceptorFn = (request, next) => {
  const token = inject(AdminSession).accessToken();
  if (!token || !mayCarryAdminToken(request.url, inject(ADMIN_TOKEN_ALLOW_LIST))) {
    return next(request);
  }
  return next(request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
};