import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';

import { routes } from './app.routes';
import { provideAdminClients } from './api/admin-api';
import { adminTokenInterceptor } from './core/http/admin-token.interceptor';
import { environment } from '../environments/environment';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    // The one registration of the one interceptor that sets Authorization.
    provideHttpClient(withInterceptors([adminTokenInterceptor])),
    ...provideAdminClients(environment),
  ],
};
