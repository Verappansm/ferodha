import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { provideApiClients } from './api/provide-api-clients';
import { authTokenInterceptor } from './core/http/auth-token.interceptor';
import { environment } from '../environments/environment';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    // The one registration of the one interceptor that sets Authorization.
    provideHttpClient(withInterceptors([authTokenInterceptor])),
    ...provideApiClients(environment),
  ],
};
