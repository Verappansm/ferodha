/**
 * Where the platform APIs live. These are also the only origins the bearer
 * token is ever sent to, so a new API gets a line here or it gets no token.
 * The ports are the standard host ports, the same under Docker and on the
 * Windows profile (root README, "Ports").
 * Nothing secret belongs in this file: it ships in the public bundle.
 */
export const environment = {
  authApiUrl: 'http://localhost:3000',
  tradeApiUrl: 'http://localhost:8080',
};
