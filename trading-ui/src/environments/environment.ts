/**
 * Where the platform APIs live. These are also the only origins the bearer
 * token is ever sent to, so a new API gets a line here or it gets no token.
 * Host ports are the docker-compose ones (story_docs/contract-breach.md, B10).
 * Nothing secret belongs in this file: it ships in the public bundle.
 */
export const environment = {
  authApiUrl: 'http://localhost:8096',
  tradeApiUrl: 'http://localhost:8094',
};
