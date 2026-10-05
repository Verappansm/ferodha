import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ProfileService } from './generated/profile/api/profile.service';
import { ProfileResponse } from './generated/profile/model/profile-response';
import { UpdateProfileRequest } from './generated/profile/model/update-profile-request';

export type { ProfileResponse, UpdateProfileRequest };

/**
 * The signed-in user's profile on the auth service, over the client generated
 * from design/profile-api.yaml. The user comes from the token, never a parameter.
 */
@Injectable({ providedIn: 'root' })
export class ProfileApi {
  private readonly profile = inject(ProfileService);

  get(): Observable<ProfileResponse> {
    return this.profile.getProfile();
  }

  update(changes: UpdateProfileRequest): Observable<ProfileResponse> {
    return this.profile.updateProfile(changes);
  }
}
