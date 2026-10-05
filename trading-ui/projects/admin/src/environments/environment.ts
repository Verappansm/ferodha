/**
 * The admin console's settings. Nothing secret belongs here: it ships in the
 * console's public bundle.
 */
export const environment = {
  authApiUrl: 'http://localhost:3000',
  tradeApiUrl: 'http://localhost:8080',
  /**
   * When true, every console route needs an admin sign-in, so opening the
   * console lands on the sign-in page. Only switch it off to look at the
   * pages without a backend: the backend's ADMIN check is the security
   * control either way, and every page's data calls are refused without it.
   */
  requireSignIn: true,
};
