/**
 * The admin console's settings. Nothing secret belongs here: it ships in the
 * console's public bundle.
 */
export const environment = {
  authApiUrl: 'http://localhost:3000',
  tradeApiUrl: 'http://localhost:8080',
  /**
   * When false, the console's routes open without an admin sign-in. Off for
   * now, while the admin routes do not exist on the backend yet; switch it on
   * as soon as they do. The backend's ADMIN check is the security control
   * either way: the guard only decides what the browser shows.
   */
  requireSignIn: false,
};
