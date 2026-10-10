/**
 * Where the platform APIs live. These are also the only origins the bearer
 * token is ever sent to, so a new API gets a line here or it gets no token.
 * The APIs run on the same host that serves this page, on the standard ports
 * (root README, "Ports"): localhost on a laptop, the instance's address on EC2,
 * with no rebuild between them.
 * Nothing secret belongs in this file: it ships in the public bundle.
 */
const host = `${globalThis.location?.protocol ?? 'http:'}//${globalThis.location?.hostname ?? 'localhost'}`;

export const environment = {
  authApiUrl: `${host}:3000`,
  tradeApiUrl: `${host}:8081`,
};
