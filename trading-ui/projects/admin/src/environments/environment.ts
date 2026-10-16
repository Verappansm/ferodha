/**
 * The admin console's settings. Nothing secret belongs here: it ships in the
 * console's public bundle.
 */
// The APIs run on the host that serves the console (localhost, or the EC2
// instance's address), on the standard ports; without a port (CloudFront, or
// the Kubernetes gateway on port 80) they share its one address, the auth API
// under /auth-api: see the trading UI's environment.
const page = globalThis.location;
const host = `${page?.protocol ?? 'http:'}//${page?.hostname ?? 'localhost'}`;
const oneAddress = page !== undefined && page.port === '' && page.hostname !== 'localhost';

export const environment = {
  authApiUrl: oneAddress ? `${host}/auth-api` : `${host}:3000`,
  tradeApiUrl: oneAddress ? host : `${host}:8081`,
  /**
   * When true, every console route needs an admin sign-in, so opening the
   * console lands on the sign-in page. Only switch it off to look at the
   * pages without a backend: the backend's ADMIN check is the security
   * control either way, and every page's data calls are refused without it.
   */
  requireSignIn: true,
};
