/**
 * The admin console's settings. Nothing secret belongs here: it ships in the
 * console's public bundle.
 */
// The APIs run on the host that serves the console (localhost, or the EC2
// instance's address), on the standard ports: see the trading UI's environment.
const host = `${globalThis.location?.protocol ?? 'http:'}//${globalThis.location?.hostname ?? 'localhost'}`;

export const environment = {
  authApiUrl: `${host}:3000`,
  tradeApiUrl: `${host}:8081`,
  /**
   * When true, every console route needs an admin sign-in, so opening the
   * console lands on the sign-in page. Only switch it off to look at the
   * pages without a backend: the backend's ADMIN check is the security
   * control either way, and every page's data calls are refused without it.
   */
  requireSignIn: true,
};
