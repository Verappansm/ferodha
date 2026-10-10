import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { PreferencesService } from './generated/preferences/api/preferences.service';
import { PreferencesResponse } from './generated/preferences/model/preferences-response';
import { PreferencesUpdateRequest } from './generated/preferences/model/preferences-update-request';

export type { PreferencesResponse, PreferencesUpdateRequest };
export { NotificationChannel } from './generated/preferences/model/notification-channel';
export { NumberFormat } from './generated/preferences/model/number-format';
export { StartPage } from './generated/preferences/model/start-page';
export { Theme as ThemePreference } from './generated/preferences/model/theme';

/**
 * The customer's preferences on the Trade REST API, over the client generated
 * from contracts/preferences-api.yaml. Addressed by the token's own account.
 */
@Injectable({ providedIn: 'root' })
export class PreferencesApi {
  private readonly preferences = inject(PreferencesService);

  get(accountId: number): Observable<PreferencesResponse> {
    return this.preferences.getPreferences(accountId);
  }

  update(accountId: number, changes: PreferencesUpdateRequest): Observable<PreferencesResponse> {
    return this.preferences.updatePreferences(accountId, changes);
  }

  reset(accountId: number): Observable<PreferencesResponse> {
    return this.preferences.resetPreferences(accountId);
  }
}
