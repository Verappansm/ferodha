/**
 * Where the platform APIs live. These are also the only origins the bearer
 * token is ever sent to, so a new API gets a line here or it gets no token.
 * The APIs run on the same host that serves this page, on the standard ports
 * (root README, "Ports"): localhost on a laptop, the instance's address on EC2,
 * with no rebuild between them.
 * Opened without a port instead (the CloudFront https address, or the
 * Kubernetes gateway on port 80), everything is on that one address: the
 * gateway sends /auth-api/* to the auth service and /api/v1/* to the trade API
 * (k8s/base/gateway.yaml). The auth API needs the prefix because its /profile
 * and /admin paths are also pages of this UI and of the admin console.
 * Nothing secret belongs in this file: it ships in the public bundle.
 */
const page = globalThis.location;
const host = `${page?.protocol ?? 'http:'}//${page?.hostname ?? 'localhost'}`;
const oneAddress = page !== undefined && page.port === '' && page.hostname !== 'localhost';

export const environment = {
  authApiUrl: oneAddress ? `${host}/auth-api` : `${host}:3000`,
  tradeApiUrl: oneAddress ? host : `${host}:8081`,
};
