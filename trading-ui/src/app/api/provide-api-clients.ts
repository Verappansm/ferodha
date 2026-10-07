import { EnvironmentProviders } from '@angular/core';
import { provideApi as provideAuthClient } from './generated/auth/provide-api';
import { provideApi as providePortfolioClient } from './generated/portfolio/provide-api';
import { provideApi as providePreferencesClient } from './generated/preferences/provide-api';
import { provideApi as provideProfileClient } from './generated/profile/provide-api';
import { provideApi as provideTradeClient } from './generated/trade/provide-api';

/**
 * Points each generated client at its service. Base paths only: no bearer
 * credential is ever configured here, so the generated services never set an
 * Authorization header themselves and the interceptor stays the one place
 * that does. The portfolio and preferences routes are served by the Trade
 * REST API, the profile routes by the auth service.
 */
export function provideApiClients(urls: {
  authApiUrl: string;
  tradeApiUrl: string;
}): EnvironmentProviders[] {
  return [
    provideAuthClient(urls.authApiUrl),
    provideProfileClient(urls.authApiUrl),
    provideTradeClient(urls.tradeApiUrl),
    providePortfolioClient(urls.tradeApiUrl),
    providePreferencesClient(urls.tradeApiUrl),
  ];
}
