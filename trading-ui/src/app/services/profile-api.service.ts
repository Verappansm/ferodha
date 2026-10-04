import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ProfileService as GeneratedProfileService } from './generated/auth/api/profile.service';
import { UserResponse } from '../api/auth-api';

/**
 * The Profile API service that the application uses.
 * Wraps the generated ProfileService and provides methods for profile operations.
 */
@Injectable({ providedIn: 'root' })
export class ProfileApiService {
  private readonly profile = inject(GeneratedProfileService);

  /**
   * Retrieves the complete profile of the signed-in user.
   * @returns Observable of UserResponse containing user profile details
   */
  getProfile(): Observable<UserResponse> {
    return this.profile.getCurrentUser() as Observable<UserResponse>;
  }

  /**
   * Updates the user profile with new name and/or phone.
   * Note: The current implementation is a placeholder for frontend-side state management.
   * Backend implementation would need to be extended to support updates.
   *
   * @param profileData Object containing name and phone to update
   * @returns Observable of the update operation
   */
  updateProfile(profileData: {
    name?: string;
    phone?: string;
  }): Observable<any> {
    // Placeholder for profile update endpoint
    // In a real scenario, this would call a PATCH /profile endpoint
    // For now, we'll return a successful response for the UI
    return new Observable((observer) => {
      // Simulate API call
      setTimeout(() => {
        observer.next({});
        observer.complete();
      }, 500);
    });
  }
}
